import { COMPONENTS, semesterOfQuarter, type Component } from '@bnhs/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { bulkUpsert } from '../db';
import { isOffice, me, requireRole, type AuthUser } from '../auth';
import { badRequest, conflict, forbidden, locked, notFound, parse } from '../errors';
import {
  classWeights,
  computeForEnrollment,
  loadClass,
  quarterStates,
  recomputeClassQuarter,
  type LoadedClass,
} from '../services/grades';
import { loadRecordData } from '../services/record';
import { idParam, zOptDate } from '../util';

const quarterSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const componentSchema = z.enum(COMPONENTS as unknown as [Component, ...Component[]]);

const itemBody = z.object({
  quarter: quarterSchema,
  component: componentSchema,
  title: z.string().trim().min(1, 'Give the item a title').max(60),
  hps: z.number().positive('Highest possible score must be more than 0').max(1000),
  dateGiven: zOptDate,
});

const itemUpdate = itemBody.pick({ title: true, hps: true, dateGiven: true });

const scoresBody = z.object({
  quarter: quarterSchema,
  entries: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        enrollmentId: z.number().int().positive(),
        score: z.number().min(0).max(1000).nullable(),
        excused: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(3000),
});

const quarterOnly = z.object({ quarter: quarterSchema });
const returnBody = z.object({ quarter: quarterSchema, note: z.string().trim().min(3, 'Tell the teacher what to fix').max(300) });
const reopenRequestBody = z.object({ quarter: quarterSchema, reason: z.string().trim().min(5, 'Give a reason').max(300) });
const decideBody = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() });
const copyBody = z.object({ fromQuarter: quarterSchema, toQuarter: quarterSchema });
const bulkApproveBody = z.object({ quarter: quarterSchema, classIds: z.array(z.number().int().positive()).min(1).max(500) });

const round2 = (n: number) => Math.round(n * 100) / 100;

export default async function recordsRoutes(app: FastifyInstance) {
  const db = app.db;
  const office = requireRole('ADMIN', 'REGISTRAR');

  /** Loads a class and checks the caller may open its record. */
  async function openClass(req: FastifyRequest, classId: number): Promise<{ cls: LoadedClass; user: AuthUser }> {
    const user = me(req);
    if (user.role === 'STUDENT' || user.role === 'PARENT') throw forbidden();
    const cls = await loadClass(db, classId);
    if (user.role === 'TEACHER' && cls.teacherId !== user.id) throw forbidden('This is not your class.');
    return { cls, user };
  }

  async function workflowOf(classId: number, quarter: number) {
    return db.classQuarter.findUnique({ where: { classId_quarter: { classId, quarter } } });
  }

  /** Can this person change items and scores right now? */
  async function editState(user: AuthUser, cls: LoadedClass, quarter: number): Promise<{ canEdit: boolean; reason: string | null }> {
    if (semesterOfQuarter(quarter) !== cls.semester) return { canEdit: false, reason: `Quarter ${quarter} is not part of this semester.` };
    const wf = await workflowOf(cls.id, quarter);
    const status = wf?.status ?? 'DRAFT';
    if (status === 'APPROVED') return { canEdit: false, reason: 'Approved and locked. Ask the registrar to reopen it.' };
    if (status === 'SUBMITTED') return { canEdit: false, reason: 'Submitted and waiting for approval.' };
    if (user.role === 'TEACHER') {
      const period = await db.gradingPeriod.findUnique({
        where: { schoolYearId_quarter: { schoolYearId: cls.schoolYearId, quarter } },
      });
      if (period?.status !== 'OPEN') return { canEdit: false, reason: `Quarter ${quarter} is closed for encoding.` };
    }
    return { canEdit: true, reason: null };
  }

  async function assertEditable(user: AuthUser, cls: LoadedClass, quarter: number) {
    const s = await editState(user, cls, quarter);
    if (!s.canEdit) throw locked(s.reason ?? 'This record cannot be edited.');
  }

  // ------------------------------------------------------------ the class record

  app.get('/classes/:id/record', async (req) => {
    const { cls, user } = await openClass(req, idParam(req));
    const quarter = quarterSchema.parse(Number((req.query as { quarter?: string }).quarter ?? 1));
    if (semesterOfQuarter(quarter) !== cls.semester) throw badRequest(`Quarter ${quarter} is not in semester ${cls.semester}.`);

    const [data, states, edit] = await Promise.all([loadRecordData(db, cls, quarter), quarterStates(db, cls), editState(user, cls, quarter)]);
    const state = states.find((s) => s.quarter === quarter)!;

    return {
      class: {
        id: cls.id,
        semester: cls.semester,
        schoolYear: cls.schoolYear.name,
        subject: { id: cls.subject.id, code: cls.subject.code, name: cls.subject.name, type: cls.subject.type },
        section: {
          id: cls.section.id,
          name: cls.section.name,
          gradeLevel: cls.section.gradeLevel,
          strand: cls.section.strand.code,
          track: cls.section.strand.track,
        },
        teacher: cls.teacher ? { id: cls.teacher.id, fullName: cls.teacher.fullName } : null,
        weights: data.weights,
      },
      quarter,
      workflow: state,
      canEdit: edit.canEdit,
      lockedReason: edit.reason,
      items: data.items,
      learners: data.learners,
    };
  });

  // ------------------------------------------------------------ items

  app.post('/classes/:id/items', async (req, reply) => {
    const { cls, user } = await openClass(req, idParam(req));
    const body = parse(itemBody, req.body);
    await assertEditable(user, cls, body.quarter);
    const siblings = await db.assessmentItem.findMany({
      where: { classId: cls.id, quarter: body.quarter, component: body.component },
      select: { sortOrder: true },
    });
    if (siblings.length >= 40) throw conflict('That is the most items one component can have (40).');
    const item = await db.assessmentItem.create({
      data: {
        classId: cls.id,
        quarter: body.quarter,
        component: body.component,
        title: body.title,
        hps: body.hps,
        dateGiven: body.dateGiven ?? null,
        sortOrder: siblings.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 1,
      },
    });
    await recomputeClassQuarter(db, cls.id, body.quarter);
    await audit(db, req, 'ITEM_ADDED', 'ClassAssignment', cls.id, { quarter: body.quarter, component: body.component, title: body.title, hps: body.hps });
    reply.code(201);
    return { id: item.id };
  });

  app.put('/items/:id', async (req) => {
    const id = idParam(req);
    const item = await db.assessmentItem.findUnique({ where: { id } });
    if (!item) throw notFound('Item');
    const { cls, user } = await openClass(req, item.classId);
    await assertEditable(user, cls, item.quarter);
    const body = parse(itemUpdate, req.body);
    const top = await db.score.aggregate({ where: { itemId: id, excused: false }, _max: { score: true } });
    if (top._max.score != null && top._max.score > body.hps) {
      throw conflict(`A learner already scored ${top._max.score}. The highest possible score cannot be lower than that.`);
    }
    await db.assessmentItem.update({
      where: { id },
      data: { title: body.title, hps: body.hps, dateGiven: body.dateGiven === undefined ? undefined : body.dateGiven },
    });
    await recomputeClassQuarter(db, cls.id, item.quarter);
    await audit(db, req, 'ITEM_UPDATED', 'AssessmentItem', id, { title: body.title, hps: body.hps });
    return { ok: true };
  });

  app.delete('/items/:id', async (req) => {
    const id = idParam(req);
    const item = await db.assessmentItem.findUnique({ where: { id } });
    if (!item) throw notFound('Item');
    const { cls, user } = await openClass(req, item.classId);
    await assertEditable(user, cls, item.quarter);
    await db.assessmentItem.delete({ where: { id } });
    await recomputeClassQuarter(db, cls.id, item.quarter);
    await audit(db, req, 'ITEM_DELETED', 'AssessmentItem', id, { title: item.title });
    return { ok: true };
  });

  /** Reuse a quarter's list of items (titles and highest possible scores, no scores) in another quarter. */
  app.post('/classes/:id/copy-items', async (req) => {
    const { cls, user } = await openClass(req, idParam(req));
    const body = parse(copyBody, req.body);
    if (body.fromQuarter === body.toQuarter) throw badRequest('Choose two different quarters.');
    await assertEditable(user, cls, body.toQuarter);
    if (await db.assessmentItem.count({ where: { classId: cls.id, quarter: body.toQuarter } })) {
      throw conflict('The target quarter already has items.');
    }
    const source = await db.assessmentItem.findMany({ where: { classId: cls.id, quarter: body.fromQuarter }, orderBy: { sortOrder: 'asc' } });
    if (!source.length) throw conflict('The source quarter has no items to copy.');
    await db.assessmentItem.createMany({
      data: source.map((s) => ({ classId: cls.id, quarter: body.toQuarter, component: s.component, title: s.title, hps: s.hps, sortOrder: s.sortOrder })),
    });
    await recomputeClassQuarter(db, cls.id, body.toQuarter);
    await audit(db, req, 'ITEMS_COPIED', 'ClassAssignment', cls.id, body);
    return { copied: source.length };
  });

  // ------------------------------------------------------------ scores

  app.put('/classes/:id/scores', async (req) => {
    const { cls, user } = await openClass(req, idParam(req));
    const body = parse(scoresBody, req.body);
    await assertEditable(user, cls, body.quarter);

    const [items, enrollments] = await Promise.all([
      db.assessmentItem.findMany({ where: { classId: cls.id, quarter: body.quarter } }),
      db.enrollment.findMany({ where: { sectionId: cls.sectionId }, select: { id: true } }),
    ]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const okEnrollments = new Set(enrollments.map((e) => e.id));

    for (const e of body.entries) {
      const item = itemById.get(e.itemId);
      if (!item) throw badRequest('One of the items does not belong to this class and quarter.');
      if (!okEnrollments.has(e.enrollmentId)) throw badRequest('One of the learners is not in this section.');
      if (e.score != null && e.score > item.hps) {
        throw badRequest(`A score of ${e.score} is higher than the highest possible score (${item.hps}) of "${item.title}".`);
      }
    }

    // Later entries for the same cell win. Then save in a handful of statements, not one per cell:
    // pasting a column of scores is dozens of cells, and each statement is a round trip to the database.
    const latest = new Map<string, (typeof body.entries)[number]>();
    for (const e of body.entries) latest.set(`${e.itemId}:${e.enrollmentId}`, e);
    const clears: Array<{ itemId: number; enrollmentId: number }> = [];
    const sets: unknown[][] = [];
    for (const e of latest.values()) {
      if (e.score == null && !e.excused) clears.push({ itemId: e.itemId, enrollmentId: e.enrollmentId });
      else sets.push([e.itemId, e.enrollmentId, e.excused ? null : round2(e.score!), e.excused]);
    }
    await db.$transaction(async (tx) => {
      for (let i = 0; i < clears.length; i += 300) await tx.score.deleteMany({ where: { OR: clears.slice(i, i + 300) } });
      await bulkUpsert(tx, { table: 'Score', columns: ['itemId', 'enrollmentId', 'score', 'excused'], key: ['itemId', 'enrollmentId'], rows: sets });
    });
    await recomputeClassQuarter(db, cls.id, body.quarter);

    await audit(db, req, 'SCORES_SAVED', 'ClassAssignment', cls.id, { quarter: body.quarter, entries: body.entries.length });
    return { saved: body.entries.length };
  });

  // ------------------------------------------------------------ workflow

  async function setStatus(classId: number, quarter: number, data: Record<string, unknown>) {
    return db.classQuarter.upsert({
      where: { classId_quarter: { classId, quarter } },
      update: data,
      create: { classId, quarter, ...data },
    });
  }

  app.post('/classes/:id/submit', async (req) => {
    const { cls, user } = await openClass(req, idParam(req));
    const { quarter } = parse(quarterOnly, req.body);
    if (semesterOfQuarter(quarter) !== cls.semester) throw badRequest('That quarter is not in this semester.');
    const wf = await workflowOf(cls.id, quarter);
    const status = wf?.status ?? 'DRAFT';
    if (status === 'SUBMITTED') throw conflict('Already submitted.');
    if (status === 'APPROVED') throw conflict('Already approved.');
    if (user.role === 'TEACHER') {
      const period = await db.gradingPeriod.findUnique({ where: { schoolYearId_quarter: { schoolYearId: cls.schoolYearId, quarter } } });
      if (period?.status !== 'OPEN') throw locked(`Quarter ${quarter} is closed for encoding.`);
    }

    const items = await db.assessmentItem.findMany({ where: { classId: cls.id, quarter }, include: { scores: true } });
    for (const c of COMPONENTS) {
      if (!items.some((i) => i.component === c)) {
        throw conflict(`Add at least one ${c === 'WW' ? 'Written Work' : c === 'PT' ? 'Performance Task' : 'Quarterly Assessment'} item before submitting.`);
      }
    }
    const weights = await classWeights(db, cls);
    const enrollments = await db.enrollment.findMany({
      where: { sectionId: cls.sectionId, status: { in: ['ENROLLED', 'LATE_ENROLLEE'] } },
      include: { learner: true },
    });
    const incomplete: string[] = [];
    let blanks = 0;
    for (const e of enrollments) {
      const r = computeForEnrollment(items, e.id, weights);
      if (r.missing > 0) {
        blanks += r.missing;
        incomplete.push(`${e.learner.lastName}, ${e.learner.firstName}`);
      }
    }
    if (blanks > 0) {
      throw conflict(
        `${blanks} score${blanks === 1 ? ' is' : 's are'} still blank (${incomplete.slice(0, 5).join('; ')}${incomplete.length > 5 ? '...' : ''}). Enter 0 for work not handed in, or mark it excused.`,
      );
    }

    await recomputeClassQuarter(db, cls.id, quarter);
    await setStatus(cls.id, quarter, { status: 'SUBMITTED', submittedAt: new Date(), submittedById: user.id, note: null });
    await audit(db, req, 'RECORD_SUBMITTED', 'ClassAssignment', cls.id, { quarter });
    return { status: 'SUBMITTED' };
  });

  async function approveOne(req: FastifyRequest, classId: number, quarter: number) {
    const wf = await workflowOf(classId, quarter);
    if ((wf?.status ?? 'DRAFT') !== 'SUBMITTED') throw conflict('Only submitted records can be approved.');
    await recomputeClassQuarter(db, classId, quarter);
    await setStatus(classId, quarter, { status: 'APPROVED', reviewedAt: new Date(), reviewedById: me(req).id, note: null });
    await audit(db, req, 'RECORD_APPROVED', 'ClassAssignment', classId, { quarter });
  }

  app.post('/classes/:id/approve', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const { quarter } = parse(quarterOnly, req.body);
    await loadClass(db, id);
    await approveOne(req, id, quarter);
    return { status: 'APPROVED' };
  });

  app.post('/approvals/bulk', { preHandler: office }, async (req) => {
    const body = parse(bulkApproveBody, req.body);
    let approved = 0;
    const skipped: number[] = [];
    for (const id of body.classIds) {
      try {
        await approveOne(req, id, body.quarter);
        approved++;
      } catch {
        skipped.push(id);
      }
    }
    return { approved, skipped };
  });

  /** Sends a submitted record back for corrections, or reopens an approved one. */
  app.post('/classes/:id/return', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const body = parse(returnBody, req.body);
    await loadClass(db, id);
    const wf = await workflowOf(id, body.quarter);
    const status = wf?.status ?? 'DRAFT';
    if (status !== 'SUBMITTED' && status !== 'APPROVED') throw conflict('Only submitted or approved records can be returned.');
    await setStatus(id, body.quarter, { status: 'RETURNED', reviewedAt: new Date(), reviewedById: me(req).id, note: body.note });
    await audit(db, req, status === 'APPROVED' ? 'RECORD_REOPENED' : 'RECORD_RETURNED', 'ClassAssignment', id, body);
    return { status: 'RETURNED' };
  });

  // ------------------------------------------------------------ requests to reopen an approved record

  app.post('/classes/:id/reopen-request', async (req, reply) => {
    const { cls, user } = await openClass(req, idParam(req));
    const body = parse(reopenRequestBody, req.body);
    const wf = await workflowOf(cls.id, body.quarter);
    if (wf?.status !== 'APPROVED') throw conflict('Only approved records need a reopen request.');
    const pending = await db.reopenRequest.count({ where: { classId: cls.id, quarter: body.quarter, status: 'PENDING' } });
    if (pending) throw conflict('A request for this record is already waiting.');
    const r = await db.reopenRequest.create({
      data: { classId: cls.id, quarter: body.quarter, reason: body.reason, requestedById: user.id },
    });
    await audit(db, req, 'REOPEN_REQUESTED', 'ClassAssignment', cls.id, body);
    reply.code(201);
    return { id: r.id };
  });

  app.get('/reopen-requests', async (req) => {
    const user = me(req);
    if (user.role !== 'TEACHER' && !isOffice(user)) throw forbidden();
    const status = (req.query as { status?: string }).status;
    const rows = await db.reopenRequest.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(user.role === 'TEACHER' ? { requestedById: user.id } : {}),
      },
      include: { class: { include: { subject: true, section: true, teacher: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      classId: r.classId,
      quarter: r.quarter,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      subject: r.class.subject.name,
      section: `${r.class.section.gradeLevel} - ${r.class.section.name}`,
      teacher: r.class.teacher?.fullName ?? null,
    }));
  });

  app.post('/reopen-requests/:id/decide', { preHandler: office }, async (req) => {
    const id = idParam(req);
    const body = parse(decideBody, req.body);
    const r = await db.reopenRequest.findUnique({ where: { id } });
    if (!r) throw notFound('Request');
    if (r.status !== 'PENDING') throw conflict('This request was already decided.');
    await db.reopenRequest.update({
      where: { id },
      data: { status: body.approve ? 'APPROVED' : 'DENIED', decidedById: me(req).id, decidedAt: new Date() },
    });
    if (body.approve) {
      await setStatus(r.classId, r.quarter, {
        status: 'RETURNED',
        reviewedAt: new Date(),
        reviewedById: me(req).id,
        note: body.note || `Reopened at your request: ${r.reason}`,
      });
    }
    await audit(db, req, body.approve ? 'REOPEN_APPROVED' : 'REOPEN_DENIED', 'ClassAssignment', r.classId, { quarter: r.quarter });
    return { ok: true };
  });

  /** For the Approvals screen: classes with a given status in a quarter. */
  app.get('/approvals', { preHandler: office }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const quarter = quarterSchema.parse(Number(q.quarter ?? 1));
    const schoolYear = q.schoolYearId
      ? await db.schoolYear.findUnique({ where: { id: Number(q.schoolYearId) } })
      : await db.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!schoolYear) return [];
    const semester = semesterOfQuarter(quarter);
    const classes = await db.classAssignment.findMany({
      where: { schoolYearId: schoolYear.id, semester },
      include: { subject: true, teacher: true, section: { include: { strand: true } }, quarters: { where: { quarter } } },
      orderBy: [{ section: { gradeLevel: 'asc' } }, { section: { name: 'asc' } }, { subject: { name: 'asc' } }],
    });
    const itemCounts = await db.assessmentItem.groupBy({ by: ['classId'], where: { quarter, class: { schoolYearId: schoolYear.id } }, _count: true });
    return classes.map((c) => ({
      classId: c.id,
      quarter,
      status: c.quarters[0]?.status ?? 'DRAFT',
      note: c.quarters[0]?.note ?? null,
      submittedAt: c.quarters[0]?.submittedAt?.toISOString() ?? null,
      items: itemCounts.find((i) => i.classId === c.id)?._count ?? 0,
      subject: c.subject.name,
      section: `${c.section.gradeLevel} - ${c.section.name}`,
      strand: c.section.strand.code,
      teacher: c.teacher?.fullName ?? null,
    }));
  });
}
