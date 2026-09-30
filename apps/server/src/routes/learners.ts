import { LEARNER_STATUSES, isValidLrn } from '@bnhs/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { generateTempPassword, hashPassword, requireRole } from '../auth';
import { conflict, notFound, parse } from '../errors';
import { presentLearner } from '../services/present';
import { recomputeSection } from '../services/grades';
import { idParam, tidyName, zDate, zNullableText } from '../util';

const learnerFields = {
  lrn: z.string().trim().regex(/^\d{12}$/, 'LRN must be exactly 12 digits'),
  lastName: z.string().trim().min(1, 'Required').max(60),
  firstName: z.string().trim().min(1, 'Required').max(60),
  middleName: zNullableText(60),
  extName: zNullableText(10),
  sex: z.enum(['M', 'F']),
  birthDate: zDate,
  birthPlace: zNullableText(120),
  address: zNullableText(250),
  religion: zNullableText(60),
  motherTongue: zNullableText(60),
  ipGroup: zNullableText(60),
  guardianName: zNullableText(100),
  guardianRelation: zNullableText(40),
  guardianContact: zNullableText(40),
  previousSchool: zNullableText(150),
};

const learnerBody = z.object(learnerFields);
const learnerUpdate = z.object({ ...learnerFields, status: z.enum(LEARNER_STATUSES).optional() });

/** One row of the CSV import. Dates arrive as text and are checked row by row. */
const importRow = z.object({
  lrn: z.string(),
  lastName: z.string(),
  firstName: z.string(),
  middleName: z.string().optional(),
  extName: z.string().optional(),
  sex: z.string(),
  birthDate: z.string(),
  address: z.string().optional(),
  guardianName: z.string().optional(),
  guardianContact: z.string().optional(),
});
const importBody = z.object({
  rows: z.array(importRow).min(1).max(2000),
  /** Enroll everyone into this section as they are created. */
  sectionId: z.number().int().positive().optional(),
});

const externalBody = z.object({
  schoolName: z.string().trim().min(1).max(150),
  schoolId: zNullableText(20),
  schoolYear: z.string().trim().min(4).max(20),
  semester: z.union([z.literal(1), z.literal(2)]),
  gradeLevel: z.union([z.literal(11), z.literal(12)]),
  strandName: zNullableText(100),
  sectionName: zNullableText(60),
  generalAverage: z.number().int().min(0).max(100).nullable().optional(),
  subjects: z
    .array(
      z.object({
        subject: z.string().trim().min(1).max(200),
        type: z.string().trim().max(20).default(''),
        q1: z.number().int().min(0).max(100).nullable().default(null),
        q2: z.number().int().min(0).max(100).nullable().default(null),
        final: z.number().int().min(0).max(100).nullable().default(null),
        remarks: z.string().trim().max(40).default(''),
      }),
    )
    .min(1)
    .max(30),
});

function normalizeSex(s: string): 'M' | 'F' | null {
  const v = s.trim().toUpperCase();
  if (['M', 'MALE', 'LALAKI'].includes(v)) return 'M';
  if (['F', 'FEMALE', 'BABAE'].includes(v)) return 'F';
  return null;
}

/** Accepts 2008-03-25, 03/25/2008 or 25/03/2008 (month/day is assumed when both parts are 12 or less). */
function parseFlexibleDate(s: string): Date | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    y = Number(match[3]);
    if (a > 12) [d, m] = [a, b];
    else [m, d] = [a, b];
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1990 || y > new Date().getUTCFullYear()) return null;
  return date;
}

export default async function learnersRoutes(app: FastifyInstance) {
  const db = app.db;
  const office = requireRole('ADMIN', 'REGISTRAR');

  app.get('/learners', { preHandler: office }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 50)));
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.q) {
      const term = q.q.trim();
      where.OR = [{ lrn: { contains: term } }, { lastName: { contains: term } }, { firstName: { contains: term } }];
    }
    if (q.schoolYearId || q.sectionId) {
      where.enrollments = {
        some: {
          ...(q.schoolYearId ? { schoolYearId: Number(q.schoolYearId) } : {}),
          ...(q.sectionId ? { sectionId: Number(q.sectionId) } : {}),
        },
      };
    }
    if (q.unenrolled === 'true' && q.schoolYearId) {
      where.enrollments = { none: { schoolYearId: Number(q.schoolYearId) } };
      where.status = 'ACTIVE';
    }
    const [total, rows] = await Promise.all([
      db.learner.count({ where }),
      db.learner.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          enrollments: {
            orderBy: { schoolYear: { startDate: 'desc' } },
            take: 1,
            include: { section: { include: { strand: true } }, schoolYear: true },
          },
          users: { where: { role: 'STUDENT' }, select: { id: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((l) => {
        const e = l.enrollments[0];
        return {
          ...presentLearner(l),
          hasAccount: l.users.length > 0,
          latest: e
            ? {
                enrollmentId: e.id,
                schoolYear: e.schoolYear.name,
                gradeLevel: e.section.gradeLevel,
                section: e.section.name,
                strand: e.section.strand.code,
                status: e.status,
              }
            : null,
        };
      }),
    };
  });

  app.get('/learners/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const l = await db.learner.findUnique({
      where: { id },
      include: {
        enrollments: {
          orderBy: { schoolYear: { startDate: 'desc' } },
          include: { section: { include: { strand: true, adviser: true } }, schoolYear: true },
        },
        externalRecords: true,
        users: { select: { id: true, username: true, fullName: true, role: true, active: true } },
      },
    });
    if (!l) throw notFound('Learner');
    return {
      ...presentLearner(l),
      enrollments: l.enrollments.map((e) => ({
        id: e.id,
        schoolYearId: e.schoolYearId,
        schoolYear: e.schoolYear.name,
        status: e.status,
        remarks: e.remarks,
        section: {
          id: e.section.id,
          name: e.section.name,
          gradeLevel: e.section.gradeLevel,
          strand: e.section.strand.code,
          adviser: e.section.adviser?.fullName ?? null,
        },
      })),
      externalRecords: l.externalRecords.map((r) => ({ ...r, subjects: JSON.parse(r.subjects) })),
      accounts: l.users,
    };
  });

  app.post('/learners', { preHandler: office }, async (req, reply) => {
    const body = parse(learnerBody, req.body);
    if (await db.learner.findUnique({ where: { lrn: body.lrn } })) throw conflict('A learner with that LRN already exists.');
    const l = await db.learner.create({
      data: { ...body, lastName: tidyName(body.lastName), firstName: tidyName(body.firstName), middleName: body.middleName ? tidyName(body.middleName) : null },
    });
    await audit(db, req, 'LEARNER_CREATED', 'Learner', l.id, { lrn: l.lrn });
    reply.code(201);
    return presentLearner(l);
  });

  app.put('/learners/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const body = parse(learnerUpdate, req.body);
    const clash = await db.learner.findFirst({ where: { lrn: body.lrn, id: { not: id } } });
    if (clash) throw conflict('Another learner already has that LRN.');
    const l = await db.learner.update({
      where: { id },
      data: { ...body, lastName: tidyName(body.lastName), firstName: tidyName(body.firstName), middleName: body.middleName ? tidyName(body.middleName) : null },
    });
    await audit(db, req, 'LEARNER_UPDATED', 'Learner', id);
    return presentLearner(l);
  });

  app.delete('/learners/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    if (await db.enrollment.count({ where: { learnerId: id } })) {
      throw conflict('This learner has enrollment records. Mark the learner as transferred or dropped instead of deleting.');
    }
    await db.user.deleteMany({ where: { learnerId: id } });
    await db.learner.delete({ where: { id } });
    await audit(db, req, 'LEARNER_DELETED', 'Learner', id);
    return { ok: true };
  });

  /** Bulk create from a spreadsheet. Bad rows are skipped and reported, good rows still go in. */
  app.post('/learners/import', { preHandler: office }, async (req) => {
    const body = parse(importBody, req.body);
    let section: { id: number; schoolYearId: number } | null = null;
    if (body.sectionId) {
      section = await db.section.findUnique({ where: { id: body.sectionId }, select: { id: true, schoolYearId: true } });
      if (!section) throw notFound('Section');
    }
    const created: number[] = [];
    const skipped: Array<{ row: number; lrn: string; reason: string }> = [];

    for (const [i, r] of body.rows.entries()) {
      const rowNo = i + 1;
      const lrn = r.lrn.replace(/\s+/g, '');
      const fail = (reason: string) => skipped.push({ row: rowNo, lrn, reason });
      if (!isValidLrn(lrn)) {
        fail('LRN must be 12 digits');
        continue;
      }
      const sex = normalizeSex(r.sex);
      if (!sex) {
        fail('Sex must be M or F');
        continue;
      }
      const birthDate = parseFlexibleDate(r.birthDate);
      if (!birthDate) {
        fail('Birthdate not understood (use YYYY-MM-DD)');
        continue;
      }
      if (!r.lastName.trim() || !r.firstName.trim()) {
        fail('Name is missing');
        continue;
      }
      try {
        let learner = await db.learner.findUnique({ where: { lrn } });
        if (!learner) {
          learner = await db.learner.create({
            data: {
              lrn,
              lastName: tidyName(r.lastName),
              firstName: tidyName(r.firstName),
              middleName: r.middleName?.trim() ? tidyName(r.middleName) : null,
              extName: r.extName?.trim() || null,
              sex,
              birthDate,
              address: r.address?.trim() || null,
              guardianName: r.guardianName?.trim() || null,
              guardianContact: r.guardianContact?.trim() || null,
            },
          });
          created.push(learner.id);
        } else if (!section) {
          fail('LRN already exists');
          continue;
        }
        if (section) {
          const has = await db.enrollment.findUnique({
            where: { learnerId_schoolYearId: { learnerId: learner.id, schoolYearId: section.schoolYearId } },
          });
          if (has) {
            fail('Already enrolled this school year');
            continue;
          }
          await db.enrollment.create({
            data: { learnerId: learner.id, schoolYearId: section.schoolYearId, sectionId: section.id },
          });
        }
      } catch (e) {
        req.log.warn({ err: e }, 'import row failed');
        fail('Could not be saved');
      }
    }
    if (section) await recomputeSection(db, section.id);
    await audit(db, req, 'LEARNERS_IMPORTED', 'Learner', undefined, {
      received: body.rows.length,
      created: created.length,
      skipped: skipped.length,
      sectionId: body.sectionId ?? null,
    });
    return { received: body.rows.length, created: created.length, skipped };
  });

  // ---- learner portal accounts: username is the LRN, the password is a one-time code

  async function createAccount(learnerId: number, lrn: string, fullName: string) {
    const tempPassword = generateTempPassword();
    await db.user.create({
      data: {
        username: lrn,
        fullName,
        role: 'STUDENT',
        learnerId,
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
      },
    });
    return { username: lrn, tempPassword };
  }

  app.post('/learners/:id/account', { preHandler: office }, async (req, reply) => {
    const id = idParam(req);
    const l = await db.learner.findUnique({ where: { id } });
    if (!l) throw notFound('Learner');
    if (await db.user.findUnique({ where: { username: l.lrn } })) {
      throw conflict('This learner already has an account. Reset the password from Users instead.');
    }
    const cred = await createAccount(l.id, l.lrn, `${l.firstName} ${l.lastName}`);
    await audit(db, req, 'LEARNER_ACCOUNT_CREATED', 'Learner', id);
    reply.code(201);
    return cred;
  });

  /** A parent or guardian signs in with their own account and sees only this learner. */
  app.post('/learners/:id/parent-account', { preHandler: office }, async (req, reply) => {
    const id = idParam(req);
    const body = parse(z.object({ fullName: z.string().trim().min(2).max(100) }), req.body);
    const l = await db.learner.findUnique({ where: { id } });
    if (!l) throw notFound('Learner');
    let n = 1;
    let username = `p${n}-${l.lrn}`;
    while (await db.user.findUnique({ where: { username } })) username = `p${++n}-${l.lrn}`;
    const tempPassword = generateTempPassword();
    await db.user.create({
      data: { username, fullName: body.fullName, role: 'PARENT', learnerId: id, passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
    });
    await audit(db, req, 'PARENT_ACCOUNT_CREATED', 'Learner', id, { username });
    reply.code(201);
    return { username, tempPassword };
  });

  /** New one-time password for a learner's or parent's account (registrars cannot open the Users screen). */
  app.post('/learners/:id/accounts/:userId/reset-password', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const userId = idParam(req, 'userId');
    const u = await db.user.findUnique({ where: { id: userId } });
    if (!u || u.learnerId !== id || (u.role !== 'STUDENT' && u.role !== 'PARENT')) throw notFound('Account');
    const tempPassword = generateTempPassword();
    await db.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true, active: true, tokenVersion: { increment: 1 } },
    });
    await audit(db, req, 'PASSWORD_RESET', 'User', userId, { learnerId: id });
    return { username: u.username, tempPassword };
  });

  app.post('/learners/accounts/bulk', { preHandler: office }, async (req) => {
    const body = parse(z.object({ sectionId: z.number().int().positive() }), req.body);
    const enrollments = await db.enrollment.findMany({
      where: { sectionId: body.sectionId },
      include: { learner: true },
    });
    const out: Array<{ lrn: string; name: string; username: string; tempPassword: string }> = [];
    for (const e of enrollments) {
      const exists = await db.user.findUnique({ where: { username: e.learner.lrn } });
      if (exists) continue;
      const name = `${e.learner.firstName} ${e.learner.lastName}`;
      const cred = await createAccount(e.learner.id, e.learner.lrn, name);
      out.push({ lrn: e.learner.lrn, name: `${e.learner.lastName}, ${e.learner.firstName}`, ...cred });
    }
    await audit(db, req, 'LEARNER_ACCOUNTS_BULK', 'Section', body.sectionId, { created: out.length });
    return { created: out.length, accounts: out };
  });

  // ---- records from previous schools (printed on the SF10)

  app.post('/learners/:id/external-records', { preHandler: office }, async (req, reply) => {
    const id = idParam(req);
    if (!(await db.learner.findUnique({ where: { id } }))) throw notFound('Learner');
    const body = parse(externalBody, req.body);
    const { subjects, ...rest } = body;
    const rec = await db.externalRecord.create({
      data: { learnerId: id, ...rest, generalAverage: rest.generalAverage ?? null, subjects: JSON.stringify(subjects) },
    });
    await audit(db, req, 'EXTERNAL_RECORD_ADDED', 'Learner', id, { school: body.schoolName, sy: body.schoolYear });
    reply.code(201);
    return { id: rec.id };
  });

  app.delete('/external-records/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    await db.externalRecord.delete({ where: { id } });
    await audit(db, req, 'EXTERNAL_RECORD_DELETED', 'ExternalRecord', id);
    return { ok: true };
  });
}
