import { SUBJECT_TYPES, TRACKS, validateWeights } from '@bnhs/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { badRequest, conflict, notFound, parse } from '../errors';
import { loadProfiles, profileCodeFor } from '../services/grades';
import { idParam, zText } from '../util';

const strandBody = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, 'Code: 2 to 20 letters, numbers or dash'),
  name: zText(150),
  track: z.enum(TRACKS),
  active: z.boolean().default(true),
});

const subjectBody = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, 'Code: 2 to 20 letters, numbers or dash'),
  name: zText(200),
  type: z.enum(SUBJECT_TYPES),
  isImmersion: z.boolean().default(false),
  weightProfileId: z.number().int().positive().nullable().default(null),
  active: z.boolean().default(true),
});

const weightBody = z.object({
  name: zText(200).optional(),
  ww: z.number().min(0).max(100),
  pt: z.number().min(0).max(100),
  qa: z.number().min(0).max(100),
});

const curriculumBody = z.object({
  strandId: z.number().int().positive().nullable(),
  gradeLevel: z.union([z.literal(11), z.literal(12)]),
  term: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  subjectId: z.number().int().positive(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export default async function catalogRoutes(app: FastifyInstance) {
  const db = app.db;
  const admin = requireRole('ADMIN');

  // ---- strands

  app.get('/strands', async () => db.strand.findMany({ orderBy: [{ track: 'asc' }, { code: 'asc' }] }));

  app.post('/strands', { preHandler: admin }, async (req, reply) => {
    const body = parse(strandBody, req.body);
    const s = await db.strand.create({ data: body });
    await audit(db, req, 'STRAND_CREATED', 'Strand', s.id, { code: s.code });
    reply.code(201);
    return s;
  });

  app.put('/strands/:id', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    const body = parse(strandBody, req.body);
    const s = await db.strand.update({ where: { id }, data: body });
    await audit(db, req, 'STRAND_UPDATED', 'Strand', id);
    return s;
  });

  app.delete('/strands/:id', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    if (await db.section.count({ where: { strandId: id } })) throw conflict('Sections use this strand. Deactivate it instead.');
    await db.strand.delete({ where: { id } });
    await audit(db, req, 'STRAND_DELETED', 'Strand', id);
    return { ok: true };
  });

  // ---- weights

  app.get('/weight-profiles', async () => db.weightProfile.findMany({ orderBy: { id: 'asc' } }));

  app.put('/weight-profiles/:id', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    const body = parse(weightBody, req.body);
    try {
      validateWeights(body);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    const p = await db.weightProfile.update({ where: { id }, data: body });
    await audit(db, req, 'WEIGHTS_UPDATED', 'WeightProfile', id, body);
    return p;
  });

  // ---- subjects

  app.get('/subjects', async () => {
    const [subjects, profiles] = await Promise.all([
      db.subject.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      loadProfiles(db),
    ]);
    return subjects.map((s) => ({
      ...s,
      // For display: the profile used in an academic-track strand and in a TVL strand.
      academicProfile: s.weightProfileId ? null : profiles.get(profileCodeFor(s, 'ACADEMIC'))?.code,
      tvlProfile: s.weightProfileId ? null : profiles.get(profileCodeFor(s, 'TVL'))?.code,
    }));
  });

  app.post('/subjects', { preHandler: admin }, async (req, reply) => {
    const body = parse(subjectBody, req.body);
    const s = await db.subject.create({ data: body });
    await audit(db, req, 'SUBJECT_CREATED', 'Subject', s.id, { code: s.code });
    reply.code(201);
    return s;
  });

  app.put('/subjects/:id', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    const body = parse(subjectBody, req.body);
    const s = await db.subject.update({ where: { id }, data: body });
    await audit(db, req, 'SUBJECT_UPDATED', 'Subject', id);
    return s;
  });

  app.delete('/subjects/:id', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    if (await db.classAssignment.count({ where: { subjectId: id } })) {
      throw conflict('Classes already use this subject. Deactivate it instead.');
    }
    await db.subject.delete({ where: { id } });
    await audit(db, req, 'SUBJECT_DELETED', 'Subject', id);
    return { ok: true };
  });

  // ---- curriculum: which subject is taken by which strand, grade level and term

  app.get('/curriculum', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (q.gradeLevel) where.gradeLevel = Number(q.gradeLevel);
    if (q.term) where.term = Number(q.term);
    if (q.strandId) where.OR = [{ strandId: Number(q.strandId) }, { strandId: null }];
    return db.curriculumSubject.findMany({
      where,
      include: { subject: true, strand: true },
      orderBy: [{ gradeLevel: 'asc' }, { term: 'asc' }, { sortOrder: 'asc' }],
    });
  });

  app.post('/curriculum', { preHandler: admin }, async (req, reply) => {
    const body = parse(curriculumBody, req.body);
    if (!(await db.subject.findUnique({ where: { id: body.subjectId } }))) throw notFound('Subject');
    const dup = await db.curriculumSubject.findFirst({
      where: { strandId: body.strandId, gradeLevel: body.gradeLevel, term: body.term, subjectId: body.subjectId },
    });
    if (dup) throw conflict('That subject is already in this curriculum slot.');
    const row = await db.curriculumSubject.create({ data: body });
    await audit(db, req, 'CURRICULUM_ADDED', 'CurriculumSubject', row.id, body);
    reply.code(201);
    return row;
  });

  app.delete('/curriculum/:id', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    await db.curriculumSubject.delete({ where: { id } });
    await audit(db, req, 'CURRICULUM_REMOVED', 'CurriculumSubject', id);
    return { ok: true };
  });
}
