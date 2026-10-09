import { OBSERVED_VALUES, VALUE_MARKINGS, remarkFor } from '@bnhs/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { bulkUpsert } from '../db';
import { isOffice, me } from '../auth';
import { badRequest, forbidden, notFound, parse } from '../errors';
import { buildCard, buildCards, calendarYear, loadHonorsPolicy, type Visibility } from '../services/card';
import { compareLearners } from '../services/grades';
import { briefLearner } from '../services/present';
import { idParam, iso, zOptDate } from '../util';

const termSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const attendanceBody = z.object({
  month: z.number().int().min(1).max(12),
  schoolDays: z.number().int().min(0).max(31).optional(),
  entries: z
    .array(
      z.object({
        enrollmentId: z.number().int().positive(),
        daysPresent: z.number().int().min(0).max(31),
        timesTardy: z.number().int().min(0).max(31).default(0),
      }),
    )
    .max(200),
});

const valuesBody = z.object({
  term: termSchema,
  entries: z
    .array(
      z.object({
        enrollmentId: z.number().int().positive(),
        valueKey: z.string().max(10),
        marking: z.enum(VALUE_MARKINGS).nullable(),
      }),
    )
    .min(1)
    .max(2000),
});

const remedialBody = z.object({
  subjectId: z.number().int().positive(),
  term: termSchema,
  /** null removes the remedial record */
  mark: z.number().int().min(0).max(100).nullable(),
  dateFrom: zOptDate,
  dateTo: zOptDate,
});

function visibilityFrom(raw: string | undefined, fallback: Visibility): Visibility {
  return raw === 'all' || raw === 'approved' || raw === 'released' ? raw : fallback;
}

export default async function advisoryRoutes(app: FastifyInstance) {
  const db = app.db;
  const validKeys = new Set(OBSERVED_VALUES.map((v) => v.key));

  /** The adviser of a section, or the office, may work on the advisory tables. */
  async function openSection(req: FastifyRequest, sectionId: number) {
    const user = me(req);
    const section = await db.section.findUnique({
      where: { id: sectionId },
      include: { strand: true, adviser: true, schoolYear: true },
    });
    if (!section) throw notFound('Section');
    if (!isOffice(user) && section.adviserId !== user.id) throw forbidden('Only the class adviser can do that.');
    return section;
  }

  // ------------------------------------------------------------ summary of grades for a section

  app.get('/sections/:id/summary', async (req) => {
    const section = await openSection(req, idParam(req));
    const q = req.query as Record<string, string | undefined>;
    const term = termSchema.parse(Number(q.term ?? 1));
    const visibility = visibilityFrom(q.visibility, 'all');
    const enrollments = await db.enrollment.findMany({ where: { sectionId: section.id }, select: { id: true } });
    const cards = await buildCards(db, enrollments.map((e) => e.id), term, visibility);
    const classes = await db.classAssignment.findMany({
      where: { sectionId: section.id, term },
      include: { subject: true, teacher: true, workflow: true },
    });
    const { passing } = await loadHonorsPolicy(db);

    // Subjects in card order (same for every learner of the section)
    const subjects = (cards[0]?.subjects ?? []).map((s) => {
      const cls = classes.find((c) => c.id === s.classId);
      return {
        classId: s.classId,
        subjectId: s.subjectId,
        name: s.name,
        type: s.type,
        teacher: cls?.teacher?.fullName ?? null,
        status: cls?.workflow?.status ?? 'DRAFT',
      };
    });

    const rows = cards.map((c) => ({
      enrollmentId: c.enrollmentId,
      status: c.status,
      learner: briefLearner(c.learner),
      grades: Object.fromEntries(c.subjects.map((s) => [s.subjectId, { grade: s.grade, remark: s.remark, remedial: s.remedial }])),
      generalAverage: c.generalAverage,
      complete: c.complete,
      honors: c.honors,
      remark: c.complete ? remarkFor(c.generalAverage, passing) : 'INCOMPLETE',
      failed: c.subjects.filter((s) => s.grade != null && s.grade < passing).length,
    }));

    return {
      section: {
        id: section.id,
        name: section.name,
        gradeLevel: section.gradeLevel,
        strand: section.strand.code,
        adviser: section.adviser?.fullName ?? null,
        schoolYear: section.schoolYear.name,
      },
      term,
      visibility,
      passing,
      subjects,
      learners: rows,
      hasHidden: cards.some((c) => c.hasHidden),
    };
  });

  app.get('/enrollments/:id/card', async (req) => {
    const id = idParam(req);
    const e = await db.enrollment.findUnique({ where: { id } });
    if (!e) throw notFound('Enrollment');
    await openSection(req, e.sectionId);
    const q = req.query as Record<string, string | undefined>;
    return buildCard(db, id, termSchema.parse(Number(q.term ?? 1)), visibilityFrom(q.visibility, 'all'));
  });

  // ------------------------------------------------------------ attendance

  app.get('/sections/:id/attendance', async (req) => {
    const section = await openSection(req, idParam(req));
    const month = z.coerce.number().int().min(1).max(12).parse((req.query as { month?: string }).month ?? 6);
    const year = calendarYear(section.schoolYear.startDate, month);
    const [days, enrollments, rows] = await Promise.all([
      db.schoolDays.findUnique({ where: { schoolYearId_year_month: { schoolYearId: section.schoolYearId, year, month } } }),
      db.enrollment.findMany({ where: { sectionId: section.id }, include: { learner: true } }),
      db.attendance.findMany({ where: { year, month, enrollment: { sectionId: section.id } } }),
    ]);
    return {
      month,
      year,
      schoolDays: days?.days ?? null,
      learners: enrollments
        .map((e) => {
          const a = rows.find((r) => r.enrollmentId === e.id);
          return {
            enrollmentId: e.id,
            status: e.status,
            ...briefLearner(e.learner),
            daysPresent: a?.daysPresent ?? null,
            timesTardy: a?.timesTardy ?? null,
          };
        })
        .sort(compareLearners),
    };
  });

  app.put('/sections/:id/attendance', async (req) => {
    const section = await openSection(req, idParam(req));
    const body = parse(attendanceBody, req.body);
    const year = calendarYear(section.schoolYear.startDate, body.month);
    let schoolDays = body.schoolDays;
    if (schoolDays !== undefined) {
      await db.schoolDays.upsert({
        where: { schoolYearId_year_month: { schoolYearId: section.schoolYearId, year, month: body.month } },
        update: { days: schoolDays },
        create: { schoolYearId: section.schoolYearId, year, month: body.month, days: schoolDays },
      });
    } else {
      schoolDays = (
        await db.schoolDays.findUnique({
          where: { schoolYearId_year_month: { schoolYearId: section.schoolYearId, year, month: body.month } },
        })
      )?.days;
    }
    if (schoolDays == null) throw badRequest('Enter the number of school days for this month first.');
    const ids = new Set((await db.enrollment.findMany({ where: { sectionId: section.id }, select: { id: true } })).map((e) => e.id));
    for (const e of body.entries) {
      if (!ids.has(e.enrollmentId)) throw badRequest('A learner in the list is not in this section.');
      if (e.daysPresent > schoolDays) throw badRequest(`Days present cannot be more than the ${schoolDays} school days.`);
    }
    await bulkUpsert(db, {
      table: 'Attendance',
      columns: ['enrollmentId', 'year', 'month', 'daysPresent', 'timesTardy'],
      key: ['enrollmentId', 'year', 'month'],
      rows: [...new Map(body.entries.map((e) => [e.enrollmentId, e])).values()].map((e) => [e.enrollmentId, year, body.month, e.daysPresent, e.timesTardy]),
    });
    await audit(db, req, 'ATTENDANCE_SAVED', 'Section', section.id, { month: body.month, entries: body.entries.length });
    return { saved: body.entries.length };
  });

  // ------------------------------------------------------------ learner observed values

  app.get('/sections/:id/values', async (req) => {
    const section = await openSection(req, idParam(req));
    const term = termSchema.parse(Number((req.query as { term?: string }).term ?? 1));
    const [enrollments, rows] = await Promise.all([
      db.enrollment.findMany({ where: { sectionId: section.id }, include: { learner: true } }),
      db.observedValue.findMany({ where: { term, enrollment: { sectionId: section.id } } }),
    ]);
    return {
      term,
      statements: OBSERVED_VALUES,
      learners: enrollments
        .map((e) => ({
          enrollmentId: e.id,
          status: e.status,
          ...briefLearner(e.learner),
          marks: Object.fromEntries(rows.filter((r) => r.enrollmentId === e.id).map((r) => [r.valueKey, r.marking])),
        }))
        .sort(compareLearners),
    };
  });

  app.put('/sections/:id/values', async (req) => {
    const section = await openSection(req, idParam(req));
    const body = parse(valuesBody, req.body);
    const ids = new Set((await db.enrollment.findMany({ where: { sectionId: section.id }, select: { id: true } })).map((e) => e.id));
    for (const e of body.entries) {
      if (!ids.has(e.enrollmentId)) throw badRequest('A learner in the list is not in this section.');
      if (!validKeys.has(e.valueKey)) throw badRequest(`Unknown behavior statement "${e.valueKey}".`);
    }
    // Last entry per statement wins; blank markings remove the mark. Few statements, not one per cell.
    const latest = new Map<string, (typeof body.entries)[number]>();
    for (const e of body.entries) latest.set(`${e.enrollmentId}:${e.valueKey}`, e);
    const cleared = [...latest.values()].filter((e) => !e.marking);
    const marked = [...latest.values()].filter((e) => e.marking);
    await db.$transaction(async (tx) => {
      for (let i = 0; i < cleared.length; i += 300) {
        await tx.observedValue.deleteMany({
          where: { term: body.term, OR: cleared.slice(i, i + 300).map((e) => ({ enrollmentId: e.enrollmentId, valueKey: e.valueKey })) },
        });
      }
      await bulkUpsert(tx, {
        table: 'ObservedValue',
        columns: ['enrollmentId', 'term', 'valueKey', 'marking'],
        key: ['enrollmentId', 'term', 'valueKey'],
        rows: marked.map((e) => [e.enrollmentId, body.term, e.valueKey, e.marking]),
      });
    });
    await audit(db, req, 'VALUES_SAVED', 'Section', section.id, { term: body.term, entries: body.entries.length });
    return { saved: body.entries.length };
  });

  // ------------------------------------------------------------ remedial classes

  /** Learners with a failed subject, with any remedial mark already recorded. */
  app.get('/sections/:id/remedial', async (req) => {
    const section = await openSection(req, idParam(req));
    const term = termSchema.parse(Number((req.query as { term?: string }).term ?? 1));
    const enrollments = await db.enrollment.findMany({ where: { sectionId: section.id }, select: { id: true } });
    const cards = await buildCards(db, enrollments.map((e) => e.id), term, 'approved');
    const { passing } = await loadHonorsPolicy(db);
    const remedials = await db.remedial.findMany({ where: { term, enrollment: { sectionId: section.id } } });
    const items: Array<{
      enrollmentId: number;
      learner: ReturnType<typeof briefLearner>;
      subjectId: number;
      subject: string;
      termGrade: number;
      mark: number | null;
      dateFrom: string | null;
      dateTo: string | null;
      recomputed: number | null;
    }> = [];
    for (const c of cards) {
      for (const s of c.subjects) {
        if (s.grade == null || s.grade >= passing) continue;
        const r = remedials.find((x) => x.enrollmentId === c.enrollmentId && x.subjectId === s.subjectId);
        items.push({
          enrollmentId: c.enrollmentId,
          learner: briefLearner(c.learner),
          subjectId: s.subjectId,
          subject: s.name,
          termGrade: s.grade,
          mark: r?.mark ?? null,
          dateFrom: iso(r?.dateFrom),
          dateTo: iso(r?.dateTo),
          recomputed: s.remedial?.recomputed ?? null,
        });
      }
    }
    return { term, passing, items };
  });

  app.put('/enrollments/:id/remedial', async (req) => {
    const id = idParam(req);
    const e = await db.enrollment.findUnique({ where: { id } });
    if (!e) throw notFound('Enrollment');
    await openSection(req, e.sectionId);
    const body = parse(remedialBody, req.body);
    if (body.mark == null) {
      await db.remedial.deleteMany({ where: { enrollmentId: id, subjectId: body.subjectId, term: body.term } });
    } else {
      await db.remedial.upsert({
        where: { enrollmentId_subjectId_term: { enrollmentId: id, subjectId: body.subjectId, term: body.term } },
        update: { mark: body.mark, dateFrom: body.dateFrom ?? null, dateTo: body.dateTo ?? null },
        create: { enrollmentId: id, subjectId: body.subjectId, term: body.term, mark: body.mark, dateFrom: body.dateFrom ?? null, dateTo: body.dateTo ?? null },
      });
    }
    await audit(db, req, 'REMEDIAL_SAVED', 'Enrollment', id, body);
    return { ok: true };
  });
}
