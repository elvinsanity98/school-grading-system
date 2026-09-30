import { descriptorFor, semesterOfQuarter, DESCRIPTORS } from '@bnhs/core';
import type { FastifyInstance } from 'fastify';
import { isFamily, isOffice, me } from '../auth';
import { forbidden } from '../errors';
import { compareLearners } from '../services/grades';
import { briefLearner } from '../services/present';

export default async function dashboardRoutes(app: FastifyInstance) {
  const db = app.db;

  async function pickYear(raw?: string) {
    return raw
      ? db.schoolYear.findUnique({ where: { id: Number(raw) }, include: { periods: true } })
      : db.schoolYear.findFirst({ where: { isCurrent: true }, include: { periods: true } });
  }

  /** The quarter being worked on now: the first open one, else the first. */
  function defaultQuarter(periods: Array<{ quarter: number; status: string }>, raw?: string): number {
    if (raw && Number(raw) >= 1 && Number(raw) <= 4) return Number(raw);
    return periods.filter((p) => p.status === 'OPEN').sort((a, b) => a.quarter - b.quarter)[0]?.quarter ?? 1;
  }

  app.get('/dashboard', async (req) => {
    const user = me(req);
    const q = req.query as Record<string, string | undefined>;
    if (isFamily(user)) return { kind: 'family' as const };

    const year = await pickYear(q.schoolYearId);
    if (!year) return { kind: user.role === 'TEACHER' ? ('teacher' as const) : ('office' as const), year: null };
    const quarter = defaultQuarter(year.periods, q.quarter);
    const semester = semesterOfQuarter(quarter);

    // ---------------------------------------------------------- teacher
    if (user.role === 'TEACHER') {
      const [classes, advisory] = await Promise.all([
        db.classAssignment.findMany({
          where: { teacherId: user.id, schoolYearId: year.id },
          include: {
            subject: true,
            section: { include: { strand: true, _count: { select: { enrollments: true } } } },
            quarters: true,
          },
          orderBy: [{ semester: 'asc' }, { section: { gradeLevel: 'asc' } }, { section: { name: 'asc' } }],
        }),
        db.section.findMany({
          where: { adviserId: user.id, schoolYearId: year.id },
          include: { strand: true, _count: { select: { enrollments: true } } },
        }),
      ]);
      const pendingRequests = await db.reopenRequest.count({ where: { requestedById: user.id, status: 'PENDING' } });
      return {
        kind: 'teacher' as const,
        year: { id: year.id, name: year.name },
        quarter,
        classes: classes.map((c) => ({
          id: c.id,
          semester: c.semester,
          subject: c.subject.name,
          section: `${c.section.gradeLevel} - ${c.section.name}`,
          strand: c.section.strand.code,
          learners: c.section._count.enrollments,
          statuses: [1, 2, 3, 4].map((n) => ({ quarter: n, status: c.quarters.find((x) => x.quarter === n)?.status ?? 'DRAFT' })),
        })),
        advisory: advisory.map((s) => ({
          id: s.id,
          name: s.name,
          gradeLevel: s.gradeLevel,
          strand: s.strand.code,
          learners: s._count.enrollments,
        })),
        openQuarters: year.periods.filter((p) => p.status === 'OPEN').map((p) => p.quarter),
        pendingRequests,
      };
    }

    // ---------------------------------------------------------- office (admin / registrar)
    if (!isOffice(user)) throw forbidden();

    const [enrolled, sections, teachers, classes, unassigned, pendingReopen, statusRows, byStrand, gradeRows] = await Promise.all([
      db.enrollment.count({ where: { schoolYearId: year.id, status: { in: ['ENROLLED', 'LATE_ENROLLEE'] } } }),
      db.section.count({ where: { schoolYearId: year.id } }),
      db.user.count({ where: { role: 'TEACHER', active: true } }),
      db.classAssignment.count({ where: { schoolYearId: year.id, semester } }),
      db.classAssignment.count({ where: { schoolYearId: year.id, semester, teacherId: null } }),
      db.reopenRequest.count({ where: { status: 'PENDING' } }),
      db.classQuarter.findMany({ where: { class: { schoolYearId: year.id } }, select: { classId: true, quarter: true, status: true } }),
      db.enrollment.findMany({
        where: { schoolYearId: year.id, status: { in: ['ENROLLED', 'LATE_ENROLLEE'] } },
        select: { section: { select: { gradeLevel: true, strand: { select: { code: true } } } } },
      }),
      db.quarterlyGrade.findMany({
        where: { quarter, quarterlyGrade: { not: null }, class: { schoolYearId: year.id } },
        select: { quarterlyGrade: true, enrollmentId: true },
      }),
    ]);

    // Progress of the class records for every quarter of the year.
    const classesBySemester = await db.classAssignment.groupBy({ by: ['semester'], where: { schoolYearId: year.id }, _count: true });
    const progress = [1, 2, 3, 4].map((n) => {
      const total = classesBySemester.find((c) => c.semester === semesterOfQuarter(n))?._count ?? 0;
      const rows = statusRows.filter((r) => r.quarter === n);
      const count = (s: string) => rows.filter((r) => r.status === s).length;
      const period = year.periods.find((p) => p.quarter === n);
      return {
        quarter: n,
        total,
        submitted: count('SUBMITTED'),
        approved: count('APPROVED'),
        returned: count('RETURNED'),
        draft: Math.max(0, total - rows.length) + count('DRAFT'),
        periodStatus: period?.status ?? 'CLOSED',
        released: period?.released ?? false,
      };
    });

    const strandCounts = new Map<string, number>();
    for (const r of byStrand) {
      const key = `${r.section.gradeLevel}|${r.section.strand.code}`;
      strandCounts.set(key, (strandCounts.get(key) ?? 0) + 1);
    }

    const distribution = DESCRIPTORS.map((d) => ({
      label: d.label,
      min: d.min,
      max: d.max,
      count: gradeRows.filter((g) => descriptorFor(g.quarterlyGrade) === d.label).length,
    }));
    const failingEnrollments = new Set(gradeRows.filter((g) => (g.quarterlyGrade ?? 100) < 75).map((g) => g.enrollmentId));

    return {
      kind: 'office' as const,
      year: { id: year.id, name: year.name },
      quarter,
      semester,
      counts: { enrolled, sections, teachers, classes, unassignedClasses: unassigned },
      enrollment: [...strandCounts.entries()]
        .map(([key, count]) => {
          const [gradeLevel, strand] = key.split('|');
          return { gradeLevel: Number(gradeLevel), strand: strand!, count };
        })
        .sort((a, b) => a.gradeLevel - b.gradeLevel || a.strand.localeCompare(b.strand)),
      progress,
      pendingApprovals: progress.reduce((s, p) => s + p.submitted, 0),
      pendingReopen,
      distribution,
      gradesRecorded: gradeRows.length,
      learnersWithFailingGrade: failingEnrollments.size,
    };
  });

  /**
   * Learners with a quarterly grade below the passing grade, so advisers and teachers
   * can act early. Office sees a chosen section; teachers see their own classes.
   */
  app.get('/at-risk', async (req) => {
    const user = me(req);
    if (isFamily(user)) throw forbidden();
    const q = req.query as Record<string, string | undefined>;
    const year = await pickYear(q.schoolYearId);
    if (!year) return [];
    const quarter = defaultQuarter(year.periods, q.quarter);
    const school = await db.school.findUnique({ where: { id: 1 } });
    const passing = school?.passingGrade ?? 75;

    let classFilter: Record<string, unknown> = { schoolYearId: year.id };
    if (q.sectionId) classFilter = { ...classFilter, sectionId: Number(q.sectionId) };
    if (user.role === 'TEACHER') {
      const advises = q.sectionId
        ? await db.section.count({ where: { id: Number(q.sectionId), adviserId: user.id } })
        : 0;
      if (!advises) classFilter = { ...classFilter, teacherId: user.id };
    }
    const rows = await db.quarterlyGrade.findMany({
      where: { quarter, quarterlyGrade: { lt: passing }, class: classFilter },
      include: {
        class: { include: { subject: true, section: true } },
        enrollment: { include: { learner: true } },
      },
    });
    const byLearner = new Map<number, { learner: ReturnType<typeof briefLearner>; section: string; subjects: Array<{ subject: string; grade: number }> }>();
    for (const r of rows) {
      const entry = byLearner.get(r.enrollmentId) ?? {
        learner: briefLearner(r.enrollment.learner),
        section: `${r.class.section.gradeLevel} - ${r.class.section.name}`,
        subjects: [],
      };
      entry.subjects.push({ subject: r.class.subject.name, grade: r.quarterlyGrade! });
      byLearner.set(r.enrollmentId, entry);
    }
    return {
      quarter,
      passing,
      learners: [...byLearner.entries()]
        .map(([enrollmentId, v]) => ({ enrollmentId, ...v }))
        .sort((a, b) => b.subjects.length - a.subjects.length || compareLearners(a.learner, b.learner)),
    };
  });
}
