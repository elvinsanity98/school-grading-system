import { ENROLLMENT_STATUSES } from '@bnhs/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { isFamily, isOffice, me, requireRole } from '../auth';
import { conflict, forbidden, notFound, parse } from '../errors';
import { classState, compareLearners, recomputeSection } from '../services/grades';
import { briefLearner } from '../services/present';
import type { Db } from '../db';
import { idParam, zNullableText, zText } from '../util';

const sectionBody = z.object({
  schoolYearId: z.number().int().positive(),
  gradeLevel: z.union([z.literal(11), z.literal(12)]),
  strandId: z.number().int().positive(),
  name: zText(40),
  adviserId: z.number().int().positive().nullable().optional(),
  room: zNullableText(30),
});

const enrollBody = z.object({
  learnerId: z.number().int().positive(),
  schoolYearId: z.number().int().positive(),
  sectionId: z.number().int().positive(),
  status: z.enum(['ENROLLED', 'LATE_ENROLLEE']).default('ENROLLED'),
});

const bulkEnrollBody = z.object({
  schoolYearId: z.number().int().positive(),
  sectionId: z.number().int().positive(),
  learnerIds: z.array(z.number().int().positive()).min(1).max(200),
});

const enrollUpdate = z.object({
  sectionId: z.number().int().positive().optional(),
  status: z.enum(ENROLLMENT_STATUSES).optional(),
  remarks: zNullableText(200),
});

const loadBody = z.object({ teacherId: z.number().int().positive().nullable() });
const newLoadBody = z.object({
  sectionId: z.number().int().positive(),
  subjectId: z.number().int().positive(),
  term: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  teacherId: z.number().int().positive().nullable().optional(),
});

/** Creates the class records (teaching loads) that the curriculum calls for. Returns how many are new. */
export async function generateClasses(db: Db, sectionId: number): Promise<number> {
  const section = await db.section.findUnique({ where: { id: sectionId } });
  if (!section) throw notFound('Section');
  const curriculum = await db.curriculumSubject.findMany({
    where: { gradeLevel: section.gradeLevel, OR: [{ strandId: null }, { strandId: section.strandId }] },
  });
  let created = 0;
  for (const c of curriculum) {
    const exists = await db.classAssignment.findUnique({
      where: { sectionId_subjectId_term: { sectionId, subjectId: c.subjectId, term: c.term } },
    });
    if (exists) continue;
    await db.classAssignment.create({
      data: { schoolYearId: section.schoolYearId, sectionId, subjectId: c.subjectId, term: c.term },
    });
    created++;
  }
  return created;
}

export default async function sectionsRoutes(app: FastifyInstance) {
  const db = app.db;
  const office = requireRole('ADMIN', 'REGISTRAR');

  async function currentYearId(raw?: string): Promise<number | undefined> {
    if (raw) return Number(raw);
    const y = await db.schoolYear.findFirst({ where: { isCurrent: true } });
    return y?.id;
  }

  // ---------------------------------------------------------------- sections

  app.get('/sections', async (req) => {
    if (isFamily(me(req))) throw forbidden();
    const q = req.query as Record<string, string | undefined>;
    const schoolYearId = await currentYearId(q.schoolYearId);
    const sections = await db.section.findMany({
      where: { ...(schoolYearId ? { schoolYearId } : {}), ...(q.gradeLevel ? { gradeLevel: Number(q.gradeLevel) } : {}) },
      include: { strand: true, adviser: true, enrollments: { include: { learner: { select: { sex: true } } } }, _count: { select: { classes: true } } },
      orderBy: [{ gradeLevel: 'asc' }, { strandId: 'asc' }, { name: 'asc' }],
    });
    return sections.map((s) => {
      const active = s.enrollments.filter((e) => e.status === 'ENROLLED' || e.status === 'LATE_ENROLLEE');
      return {
        id: s.id,
        schoolYearId: s.schoolYearId,
        gradeLevel: s.gradeLevel,
        name: s.name,
        room: s.room,
        strand: { id: s.strand.id, code: s.strand.code, name: s.strand.name, track: s.strand.track },
        adviser: s.adviser ? { id: s.adviser.id, fullName: s.adviser.fullName } : null,
        enrolled: active.length,
        male: active.filter((e) => e.learner.sex === 'M').length,
        female: active.filter((e) => e.learner.sex === 'F').length,
        classes: s._count.classes,
      };
    });
  });

  app.post('/sections', { preHandler: office }, async (req, reply) => {
    const body = parse(sectionBody, req.body);
    const dup = await db.section.findFirst({
      where: { schoolYearId: body.schoolYearId, gradeLevel: body.gradeLevel, strandId: body.strandId, name: body.name },
    });
    if (dup) throw conflict('That section already exists.');
    const section = await db.section.create({ data: { ...body, adviserId: body.adviserId ?? null, room: body.room ?? null } });
    const classes = await generateClasses(db, section.id);
    await audit(db, req, 'SECTION_CREATED', 'Section', section.id, { name: section.name, classes });
    reply.code(201);
    return { id: section.id, classesCreated: classes };
  });

  app.put('/sections/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const body = parse(sectionBody, req.body);
    const s = await db.section.update({
      where: { id },
      data: { name: body.name, adviserId: body.adviserId ?? null, room: body.room ?? null },
    });
    await audit(db, req, 'SECTION_UPDATED', 'Section', id);
    return { id: s.id };
  });

  app.delete('/sections/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    if (await db.enrollment.count({ where: { sectionId: id } })) throw conflict('Move or remove the enrolled learners first.');
    if (await db.assessmentItem.count({ where: { class: { sectionId: id } } })) {
      throw conflict('Teachers have already recorded scores for this section.');
    }
    await db.section.delete({ where: { id } });
    await audit(db, req, 'SECTION_DELETED', 'Section', id);
    return { ok: true };
  });

  app.post('/sections/:id/generate-classes', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const created = await generateClasses(db, id);
    await audit(db, req, 'CLASSES_GENERATED', 'Section', id, { created });
    return { created };
  });

  app.get('/sections/:id', async (req) => {
    const id = idParam(req);
    const user = me(req);
    const s = await db.section.findUnique({
      where: { id },
      include: {
        strand: true,
        adviser: true,
        schoolYear: true,
        enrollments: { include: { learner: true } },
      },
    });
    if (!s) throw notFound('Section');
    if (!isOffice(user)) {
      const teaches = await db.classAssignment.count({ where: { sectionId: id, teacherId: user.id } });
      if (s.adviserId !== user.id && !teaches) throw forbidden();
    }
    return {
      id: s.id,
      name: s.name,
      gradeLevel: s.gradeLevel,
      room: s.room,
      schoolYear: { id: s.schoolYear.id, name: s.schoolYear.name },
      strand: { id: s.strand.id, code: s.strand.code, name: s.strand.name, track: s.strand.track },
      adviser: s.adviser ? { id: s.adviser.id, fullName: s.adviser.fullName } : null,
      learners: s.enrollments
        .map((e) => ({ enrollmentId: e.id, status: e.status, ...briefLearner(e.learner) }))
        .sort(compareLearners),
    };
  });

  // ---------------------------------------------------------------- enrollment

  app.get('/enrollments', { preHandler: office }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const schoolYearId = await currentYearId(q.schoolYearId);
    const rows = await db.enrollment.findMany({
      where: {
        ...(schoolYearId ? { schoolYearId } : {}),
        ...(q.sectionId ? { sectionId: Number(q.sectionId) } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      include: { learner: true, section: { include: { strand: true } } },
    });
    return rows
      .map((e) => ({
        id: e.id,
        status: e.status,
        remarks: e.remarks,
        dateEnrolled: e.dateEnrolled.toISOString(),
        section: { id: e.section.id, name: e.section.name, gradeLevel: e.section.gradeLevel, strand: e.section.strand.code },
        learner: briefLearner(e.learner),
      }))
      .sort((a, b) => compareLearners(a.learner, b.learner));
  });

  async function enrollOne(learnerId: number, schoolYearId: number, sectionId: number, status: 'ENROLLED' | 'LATE_ENROLLEE') {
    const section = await db.section.findUnique({ where: { id: sectionId } });
    if (!section || section.schoolYearId !== schoolYearId) throw notFound('Section in that school year');
    const existing = await db.enrollment.findUnique({ where: { learnerId_schoolYearId: { learnerId, schoolYearId } } });
    if (existing) throw conflict('This learner is already enrolled in that school year.');
    const learner = await db.learner.findUnique({ where: { id: learnerId } });
    if (!learner) throw notFound('Learner');
    return db.enrollment.create({ data: { learnerId, schoolYearId, sectionId, status } });
  }

  app.post('/enrollments', { preHandler: office }, async (req, reply) => {
    const body = parse(enrollBody, req.body);
    const e = await enrollOne(body.learnerId, body.schoolYearId, body.sectionId, body.status);
    await db.learner.update({ where: { id: body.learnerId }, data: { status: 'ACTIVE' } });
    await recomputeSection(db, body.sectionId);
    await audit(db, req, 'ENROLLED', 'Enrollment', e.id, body);
    reply.code(201);
    return { id: e.id };
  });

  app.post('/enrollments/bulk', { preHandler: office }, async (req) => {
    const body = parse(bulkEnrollBody, req.body);
    const skipped: Array<{ learnerId: number; reason: string }> = [];
    let enrolled = 0;
    for (const learnerId of body.learnerIds) {
      try {
        await enrollOne(learnerId, body.schoolYearId, body.sectionId, 'ENROLLED');
        await db.learner.update({ where: { id: learnerId }, data: { status: 'ACTIVE' } });
        enrolled++;
      } catch (e) {
        skipped.push({ learnerId, reason: (e as Error).message });
      }
    }
    await recomputeSection(db, body.sectionId);
    await audit(db, req, 'ENROLLED_BULK', 'Section', body.sectionId, { enrolled, skipped: skipped.length });
    return { enrolled, skipped };
  });

  app.put('/enrollments/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const body = parse(enrollUpdate, req.body);
    const current = await db.enrollment.findUnique({ where: { id }, include: { section: true } });
    if (!current) throw notFound('Enrollment');
    if (body.sectionId && body.sectionId !== current.sectionId) {
      const target = await db.section.findUnique({ where: { id: body.sectionId } });
      if (!target || target.schoolYearId !== current.schoolYearId) throw notFound('Section in that school year');
      if (target.gradeLevel !== current.section.gradeLevel || target.strandId !== current.section.strandId) {
        throw conflict('A learner can only move to a section of the same grade level and strand.');
      }
    }
    const e = await db.enrollment.update({
      where: { id },
      data: { sectionId: body.sectionId, status: body.status, remarks: body.remarks ?? undefined },
    });
    if (body.status === 'TRANSFERRED_OUT' || body.status === 'DROPPED_OUT') {
      await db.learner.update({ where: { id: e.learnerId }, data: { status: body.status } });
    } else if (body.status === 'ENROLLED' || body.status === 'LATE_ENROLLEE') {
      await db.learner.update({ where: { id: e.learnerId }, data: { status: 'ACTIVE' } });
    }
    if (body.sectionId && body.sectionId !== current.sectionId) await recomputeSection(db, body.sectionId);
    await audit(db, req, 'ENROLLMENT_UPDATED', 'Enrollment', id, body);
    return { id: e.id };
  });

  app.delete('/enrollments/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    if (await db.score.count({ where: { enrollmentId: id, score: { not: null } } })) {
      throw conflict('Scores are already recorded for this learner. Mark the enrollment as dropped or transferred instead.');
    }
    await db.enrollment.delete({ where: { id } });
    await audit(db, req, 'ENROLLMENT_DELETED', 'Enrollment', id);
    return { ok: true };
  });

  // ---------------------------------------------------------------- teaching loads (class records)

  app.get('/classes', async (req) => {
    const user = me(req);
    const q = req.query as Record<string, string | undefined>;
    const schoolYearId = await currentYearId(q.schoolYearId);
    if (user.role === 'STUDENT' || user.role === 'PARENT') throw forbidden();
    const where: Record<string, unknown> = {};
    if (schoolYearId) where.schoolYearId = schoolYearId;
    if (q.sectionId) where.sectionId = Number(q.sectionId);
    if (q.term) where.term = Number(q.term);
    if (q.unassigned === 'true') where.teacherId = null;
    // Teachers only ever see their own classes.
    if (user.role === 'TEACHER') where.teacherId = user.id;
    else if (q.teacherId) where.teacherId = Number(q.teacherId);

    const rows = await db.classAssignment.findMany({
      where,
      include: {
        subject: true,
        teacher: true,
        section: { include: { strand: true, _count: { select: { enrollments: true } } } },
        workflow: true,
      },
      orderBy: [{ term: 'asc' }, { section: { gradeLevel: 'asc' } }, { section: { name: 'asc' } }, { subject: { name: 'asc' } }],
    });
    return rows.map((c) => ({
      id: c.id,
      term: c.term,
      subject: { id: c.subject.id, code: c.subject.code, name: c.subject.name, type: c.subject.type },
      section: {
        id: c.section.id,
        name: c.section.name,
        gradeLevel: c.section.gradeLevel,
        strand: c.section.strand.code,
        learners: c.section._count.enrollments,
      },
      teacher: c.teacher ? { id: c.teacher.id, fullName: c.teacher.fullName } : null,
      status: c.workflow?.status ?? 'DRAFT',
    }));
  });

  app.put('/classes/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const body = parse(loadBody, req.body);
    if (body.teacherId) {
      const t = await db.user.findUnique({ where: { id: body.teacherId } });
      if (!t || t.role !== 'TEACHER' || !t.active) throw notFound('Teacher');
    }
    const c = await db.classAssignment.update({ where: { id }, data: { teacherId: body.teacherId } });
    await audit(db, req, 'CLASS_ASSIGNED', 'ClassAssignment', id, { teacherId: body.teacherId });
    return { id: c.id };
  });

  app.post('/classes', { preHandler: office }, async (req, reply) => {
    const body = parse(newLoadBody, req.body);
    const section = await db.section.findUnique({ where: { id: body.sectionId } });
    if (!section) throw notFound('Section');
    const dup = await db.classAssignment.findUnique({
      where: { sectionId_subjectId_term: { sectionId: body.sectionId, subjectId: body.subjectId, term: body.term } },
    });
    if (dup) throw conflict('That subject is already scheduled for this section and term.');
    const c = await db.classAssignment.create({
      data: { schoolYearId: section.schoolYearId, sectionId: body.sectionId, subjectId: body.subjectId, term: body.term, teacherId: body.teacherId ?? null },
    });
    await audit(db, req, 'CLASS_CREATED', 'ClassAssignment', c.id);
    reply.code(201);
    return { id: c.id };
  });

  app.delete('/classes/:id', { preHandler: office }, async (req) => {
    const id = idParam(req);
    if (await db.assessmentItem.count({ where: { classId: id } })) throw conflict('This class already has recorded scores.');
    await db.classAssignment.delete({ where: { id } });
    await audit(db, req, 'CLASS_DELETED', 'ClassAssignment', id);
    return { ok: true };
  });

  app.get('/classes/:id/status', async (req) => {
    const id = idParam(req);
    const user = me(req);
    const c = await db.classAssignment.findUnique({ where: { id } });
    if (!c) throw notFound('Class');
    if (isFamily(user) || (user.role === 'TEACHER' && c.teacherId !== user.id)) throw forbidden();
    return classState(db, c);
  });
}
