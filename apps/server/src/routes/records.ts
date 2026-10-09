import { COMPONENTS, COMPONENT_LABEL, type Component } from '@bnhs/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { bulkUpsert } from '../db';
import { isOffice, me, requireRole, type AuthUser } from '../auth';
import { badRequest, conflict, forbidden, locked, notFound, parse } from '../errors';
import { classState, classWeights, computeForEnrollment, loadClass, recomputeClass, type LoadedClass } from '../services/grades';
import { loadRecordData } from '../services/record';
import { idParam, zOptDate } from '../util';

const termSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const componentSchema = z.enum(COMPONENTS as unknown as [Component, ...Component[]]);

const itemBody = z.object({
  component: componentSchema,
  title: z.string().trim().min(1, 'Give the item a title').max(60),
  hps: z.number().positive('Highest possible score must be more than 0').max(1000),
  dateGiven: zOptDate,
});

const itemUpdate = itemBody.pick({ title: true, hps: true, dateGiven: true });

const scoresBody = z.object({
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

const returnBody = z.object({ note: z.string().trim().min(3, 'Tell the teacher what to fix').max(300) });
const reopenRequestBody = z.object({ reason: z.string().trim().min(5, 'Give a reason').max(300) });
const decideBody = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() });
const copyBody = z.object({ fromClassId: z.number().int().positive() });
const bulkApproveBody = z.object({ classIds: z.array(z.number().int().positive()).min(1).max(500) });

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

  /** Can this person change items and scores right now? */
  async function editState(user: AuthUser, cls: LoadedClass): Promise<{ canEdit: boolean; reason: string | null }> {
    const state = await classState(db, cls);
    if (state.status === 'APPROVED') return { canEdit: false, reason: 'Approved and locked. Ask the registrar to reopen it.' };
    if (state.status === 'SUBMITTED') return { canEdit: false, reason: 'Submitted and waiting for approval.' };
    if (user.role === 'TEACHER' && state.periodStatus !== 'OPEN') {
      return { canEdit: false, reason: `Term ${cls.term} is closed for encoding.` };
    }
    return { canEdit: true, reason: null };
  }

  async function assertEditable(user: AuthUser, cls: LoadedClass) {
    const s = await editState(user, cls);
    if (!s.canEdit) throw locked(s.reason ?? 'This record cannot be edited.');
  }

  // ------------------------------------------------------------ the class record

  app.get('/classes/:id/record', async (req) => {
    const { cls, user } = await openClass(req, idParam(req));
    const [data, state, edit] = await Promise.all([loadRecordData(db, cls), classState(db, cls), editState(user, cls)]);

    return {
      class: {
        id: cls.id,
        term: cls.term,
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
    await assertEditable(user, cls);
    const siblings = await db.assessmentItem.findMany({
      where: { classId: cls.id, component: body.component },
      select: { sortOrder: true },
    });
    if (siblings.length >= 40) throw conflict('That is the most items one component can have (40).');
    const item = await db.assessmentItem.create({
      data: {
        classId: cls.id,
        component: body.component,
        title: body.title,
        hps: body.hps,
        dateGiven: body.dateGiven ?? null,
        sortOrder: siblings.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 1,
      },
    });
    await recomputeClass(db, cls.id);
    await audit(db, req, 'ITEM_ADDED', 'ClassAssignment', cls.id, { component: body.component, title: body.title, hps: body.hps });
    reply.code(201);
    return { id: item.id };
  });

  app.put('/items/:id', async (req) => {
    const id = idParam(req);
    const item = await db.assessmentItem.findUnique({ where: { id } });
    if (!item) throw notFound('Item');
    const { cls, user } = await openClass(req, item.classId);
    await assertEditable(user, cls);
    const body = parse(itemUpdate, req.body);
    const top = await db.score.aggregate({ where: { itemId: id, excused: false }, _max: { score: true } });
    if (top._max.score != null && top._max.score > body.hps) {
      throw conflict(`A learner already scored ${top._max.score}. The highest possible score cannot be lower than that.`);
    }
    await db.assessmentItem.update({
      where: { id },
      data: { title: body.title, hps: body.hps, dateGiven: body.dateGiven === undefined ? undefined : body.dateGiven },
    });
    await recomputeClass(db, cls.id);
    await audit(db, req, 'ITEM_UPDATED', 'AssessmentItem', id, { title: body.title, hps: body.hps });
    return { ok: true };
  });

  app.delete('/items/:id', async (req) => {
    const id = idParam(req);
    const item = await db.assessmentItem.findUnique({ where: { id } });
    if (!item) throw notFound('Item');
    const { cls, user } = await openClass(req, item.classId);
    await assertEditable(user, cls);
    await db.assessmentItem.delete({ where: { id } });
    await recomputeClass(db, cls.id);
    await audit(db, req, 'ITEM_DELETED', 'AssessmentItem', id, { title: item.title });
    return { ok: true };
  });

  /**
   * Reuse the list of items (titles and highest possible scores, no scores) of another class, for example
   * the same subject in another section. The caller must be allowed to open that class too.
   */
  app.post('/classes/:id/copy-items', async (req) => {
    const { cls, user } = await openClass(req, idParam(req));
    const body = parse(copyBody, req.body);
    if (body.fromClassId === cls.id) throw badRequest('Choose a different class to copy from.');
    const { cls: source } = await openClass(req, body.fromClassId);
    await assertEditable(user, cls);
    if (await db.assessmentItem.count({ where: { classId: cls.id } })) throw conflict('This class already has items.');
    const items = await db.assessmentItem.findMany({ where: { classId: source.id }, orderBy: { sortOrder: 'asc' } });
    if (!items.length) throw conflict('That class has no items to copy.');
    await db.assessmentItem.createMany({
      data: items.map((s) => ({ classId: cls.id, component: s.component, title: s.title, hps: s.hps, sortOrder: s.sortOrder })),
    });
    await recomputeClass(db, cls.id);
    await audit(db, req, 'ITEMS_COPIED', 'ClassAssignment', cls.id, body);
    return { copied: items.length };
  });

  /** Other classes whose items could be copied: same subject first. Used by the "copy items" picker. */
  app.get('/classes/:id/copy-sources', async (req) => {
    const { cls, user } = await openClass(req, idParam(req));
    const rows = await db.classAssignment.findMany({
      where: {
        schoolYearId: cls.schoolYearId,
        id: { not: cls.id },
        items: { some: {} },
        ...(user.role === 'TEACHER' ? { teacherId: user.id } : {}),
      },
      include: { subject: true, section: true, _count: { select: { items: true } } },
      orderBy: [{ term: 'asc' }, { subjectId: 'asc' }],
      take: 100,
    });
    return rows
      .map((r) => ({
        id: r.id,
        subject: r.subject.name,
        section: `${r.section.gradeLevel} - ${r.section.name}`,
        term: r.term,
        items: r._count.items,
        sameSubject: r.subjectId === cls.subjectId,
      }))
      .sort((a, b) => Number(b.sameSubject) - Number(a.sameSubject));
  });

  // ------------------------------------------------------------ scores

  app.put('/classes/:id/scores', async (req) => {
    const { cls, user } = await openClass(req, idParam(req));
    const body = parse(scoresBody, req.body);
    await assertEditable(user, cls);

    const [items, enrollments] = await Promise.all([
      db.assessmentItem.findMany({ where: { classId: cls.id } }),
      db.enrollment.findMany({ where: { sectionId: cls.sectionId }, select: { id: true } }),
    ]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const okEnrollments = new Set(enrollments.map((e) => e.id));

    for (const e of body.entries) {
      const item = itemById.get(e.itemId);
      if (!item) throw badRequest('One of the items does not belong to this class.');
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
    await recomputeClass(db, cls.id);

    await audit(db, req, 'SCORES_SAVED', 'ClassAssignment', cls.id, { entries: body.entries.length });
    return { saved: body.entries.length };
  });

  // ------------------------------------------------------------ workflow

  async function setStatus(classId: number, data: Record<string, unknown>) {
    return db.classWorkflow.upsert({ where: { classId }, update: data, create: { classId, ...data } });
  }

  app.post('/classes/:id/submit', async (req) => {
    const { cls, user } = await openClass(req, idParam(req));
    const state = await classState(db, cls);
    if (state.status === 'SUBMITTED') throw conflict('Already submitted.');
    if (state.status === 'APPROVED') throw conflict('Already approved.');
    if (user.role === 'TEACHER' && state.periodStatus !== 'OPEN') throw locked(`Term ${cls.term} is closed for encoding.`);

    const items = await db.assessmentItem.findMany({ where: { classId: cls.id }, include: { scores: true } });
    for (const c of COMPONENTS) {
      if (!items.some((i) => i.component === c)) {
        throw conflict(`Add at least one ${COMPONENT_LABEL[c]} item before submitting.`);
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

    await recomputeClass(db, cls.id);
    await setStatus(cls.id, { status: 'SUBMITTED', submittedAt: new Date(), submittedById: user.id, note: null });
    await audit(db, req, 'RECORD_SUBMITTED', 'ClassAssignment', cls.id, { term: cls.term });
    return { status: 'SUBMITTED' };
  });

  async function approveOne(req: FastifyRequest, classId: number) {
    const state = await db.classWorkflow.findUnique({ where: { classId } });
    if ((state?.status ?? 'DRAFT') !== 'SUBMITTED') throw conflict('Only submitted records can be approved.');
    await recomputeClass(db, classId);
    await setStatus(classId, { status: 'APPROVED', reviewedAt: new Date(), reviewedById: me(req).id, note: null });
    await audit(db, req, 'RECORD_APPROVED', 'ClassAssignment', classId);
  }

  app.post('/classes/:id/approve', { preHandler: office }, async (req) => {
    const id = idParam(req);
    await loadClass(db, id);
    await approveOne(req, id);
    return { status: 'APPROVED' };
  });

  app.post('/approvals/bulk', { preHandler: office }, async (req) => {
    const body = parse(bulkApproveBody, req.body);
    let approved = 0;
    const skipped: number[] = [];
    for (const id of body.classIds) {
      try {
        await approveOne(req, id);
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
    const wf = await db.classWorkflow.findUnique({ where: { classId: id } });
    const status = wf?.status ?? 'DRAFT';
    if (status !== 'SUBMITTED' && status !== 'APPROVED') throw conflict('Only submitted or approved records can be returned.');
    await setStatus(id, { status: 'RETURNED', reviewedAt: new Date(), reviewedById: me(req).id, note: body.note });
    await audit(db, req, status === 'APPROVED' ? 'RECORD_REOPENED' : 'RECORD_RETURNED', 'ClassAssignment', id, body);
    return { status: 'RETURNED' };
  });

  // ------------------------------------------------------------ requests to reopen an approved record

  app.post('/classes/:id/reopen-request', async (req, reply) => {
    const { cls, user } = await openClass(req, idParam(req));
    const body = parse(reopenRequestBody, req.body);
    const wf = await db.classWorkflow.findUnique({ where: { classId: cls.id } });
    if (wf?.status !== 'APPROVED') throw conflict('Only approved records need a reopen request.');
    const pending = await db.reopenRequest.count({ where: { classId: cls.id, status: 'PENDING' } });
    if (pending) throw conflict('A request for this record is already waiting.');
    const r = await db.reopenRequest.create({ data: { classId: cls.id, reason: body.reason, requestedById: user.id } });
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
      term: r.class.term,
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
      await setStatus(r.classId, {
        status: 'RETURNED',
        reviewedAt: new Date(),
        reviewedById: me(req).id,
        note: body.note || `Reopened at your request: ${r.reason}`,
      });
    }
    await audit(db, req, body.approve ? 'REOPEN_APPROVED' : 'REOPEN_DENIED', 'ClassAssignment', r.classId);
    return { ok: true };
  });

  /** For the Approvals screen: the class records of one term with their status. */
  app.get('/approvals', { preHandler: office }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const term = termSchema.parse(Number(q.term ?? 1));
    const schoolYear = q.schoolYearId
      ? await db.schoolYear.findUnique({ where: { id: Number(q.schoolYearId) } })
      : await db.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!schoolYear) return [];
    const classes = await db.classAssignment.findMany({
      where: { schoolYearId: schoolYear.id, term },
      include: {
        subject: true,
        teacher: true,
        section: { include: { strand: true } },
        workflow: true,
        _count: { select: { items: true } },
      },
      orderBy: [{ section: { gradeLevel: 'asc' } }, { section: { name: 'asc' } }, { subject: { name: 'asc' } }],
    });
    return classes.map((c) => ({
      classId: c.id,
      term,
      status: c.workflow?.status ?? 'DRAFT',
      note: c.workflow?.note ?? null,
      submittedAt: c.workflow?.submittedAt?.toISOString() ?? null,
      items: c._count.items,
      subject: c.subject.name,
      section: `${c.section.gradeLevel} - ${c.section.name}`,
      strand: c.section.strand.code,
      teacher: c.teacher?.fullName ?? null,
    }));
  });
}
