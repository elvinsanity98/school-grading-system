import { descriptorFor, DESCRIPTORS } from '@bnhs/core';
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

  /** The term being worked on now: the first open one, else the first. */
  function defaultTerm(periods: Array<{ term: number; status: string }>, raw?: string): number {
    if (raw && Number(raw) >= 1 && Number(raw) <= 3) return Number(raw);
    return periods.filter((p) => p.status === 'OPEN').sort((a, b) => a.term - b.term)[0]?.term ?? 1;
  }

  app.get('/dashboard', async (req) => {
    const user = me(req);
    const q = req.query as Record<string, string | undefined>;
    if (isFamily(user)) return { kind: 'family' as const };

    const year = await pickYear(q.schoolYearId);
    if (!year) return { kind: user.role === 'TEACHER' ? ('teacher' as const) : ('office' as const), year: null };
    const term = defaultTerm(year.periods, q.term);

    // ---------------------------------------------------------- teacher
    if (user.role === 'TEACHER') {
      const [classes, advisory] = await Promise.all([
        db.classAssignment.findMany({
          where: { teacherId: user.id, schoolYearId: year.id },
          include: {
            subject: true,
            section: { include: { strand: true, _count: { select: { enrollments: true } } } },
            workflow: true,
          },
          orderBy: [{ term: 'asc' }, { section: { gradeLevel: 'asc' } }, { section: { name: 'asc' } }],
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
        term,
        classes: classes.map((c) => ({
          id: c.id,
          term: c.term,
          subject: c.subject.name,
          section: `${c.section.gradeLevel} - ${c.section.name}`,
          strand: c.section.strand.code,
          learners: c.section._count.enrollments,
          status: c.workflow?.status ?? 'DRAFT',
        })),
        advisory: advisory.map((s) => ({
          id: s.id,
          name: s.name,
          gradeLevel: s.gradeLevel,
          strand: s.strand.code,
          learners: s._count.enrollments,
        })),
        openTerms: year.periods.filter((p) => p.status === 'OPEN').map((p) => p.term),
        pendingRequests,
      };
    }

    // ---------------------------------------------------------- office (admin / registrar)
    if (!isOffice(user)) throw forbidden();

    const [enrolled, sections, teachers, classes, unassigned, pendingReopen, workflowRows, byStrand, gradeRows, classesByTerm] = await Promise.all([
      db.enrollment.count({ where: { schoolYearId: year.id, status: { in: ['ENROLLED', 'LATE_ENROLLEE'] } } }),
      db.section.count({ where: { schoolYearId: year.id } }),
      db.user.count({ where: { role: 'TEACHER', active: true } }),
      db.classAssignment.count({ where: { schoolYearId: year.id, term } }),
      db.classAssignment.count({ where: { schoolYearId: year.id, term, teacherId: null } }),
      db.reopenRequest.count({ where: { status: 'PENDING' } }),
      db.classWorkflow.findMany({ where: { class: { schoolYearId: year.id } }, select: { status: true, class: { select: { term: true } } } }),
      db.enrollment.findMany({
        where: { schoolYearId: year.id, status: { in: ['ENROLLED', 'LATE_ENROLLEE'] } },
        select: { section: { select: { gradeLevel: true, strand: { select: { code: true } } } } },
      }),
      db.termGrade.findMany({
        where: { term, termGrade: { not: null }, class: { schoolYearId: year.id } },
        select: { termGrade: true, enrollmentId: true },
      }),
      db.classAssignment.groupBy({ by: ['term'], where: { schoolYearId: year.id }, _count: true }),
    ]);

    // Progress of the class records for every term of the year.
    const progress = [1, 2, 3].map((n) => {
      const total = classesByTerm.find((c) => c.term === n)?._count ?? 0;
      const rows = workflowRows.filter((r) => r.class.term === n);
      const count = (s: string) => rows.filter((r) => r.status === s).length;
      const period = year.periods.find((p) => p.term === n);
      return {
        term: n,
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
      count: gradeRows.filter((g) => descriptorFor(g.termGrade) === d.label).length,
    }));
    const failingEnrollments = new Set(gradeRows.filter((g) => (g.termGrade ?? 100) < 75).map((g) => g.enrollmentId));

    return {
      kind: 'office' as const,
      year: { id: year.id, name: year.name },
      term,
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
   * Learners with a term grade below the passing grade, so advisers and teachers
   * can act early. Office sees a chosen section; teachers see their own classes.
   */
  app.get('/at-risk', async (req) => {
    const user = me(req);
    if (isFamily(user)) throw forbidden();
    const q = req.query as Record<string, string | undefined>;
    const year = await pickYear(q.schoolYearId);
    if (!year) return [];
    const term = defaultTerm(year.periods, q.term);
    const school = await db.school.findUnique({ where: { id: 1 } });
    const passing = school?.passingGrade ?? 75;

    let classFilter: Record<string, unknown> = { schoolYearId: year.id };
    if (q.sectionId) classFilter = { ...classFilter, sectionId: Number(q.sectionId) };
    if (user.role === 'TEACHER') {
      const advises = q.sectionId ? await db.section.count({ where: { id: Number(q.sectionId), adviserId: user.id } }) : 0;
      if (!advises) classFilter = { ...classFilter, teacherId: user.id };
    }
    const rows = await db.termGrade.findMany({
      where: { term, termGrade: { lt: passing }, class: classFilter },
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
      entry.subjects.push({ subject: r.class.subject.name, grade: r.termGrade! });
      byLearner.set(r.enrollmentId, entry);
    }
    return {
      term,
      passing,
      learners: [...byLearner.entries()]
        .map(([enrollmentId, v]) => ({ enrollmentId, ...v }))
        .sort((a, b) => b.subjects.length - a.subjects.length || compareLearners(a.learner, b.learner)),
    };
  });
}
