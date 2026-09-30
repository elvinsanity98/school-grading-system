import {
  DEFAULT_HONORS_POLICY,
  finalGrade,
  generalAverage,
  honorsFor,
  quartersOfSemester,
  recomputedFinal,
  remarkFor,
  SCHOOL_MONTHS,
  type HonorsLevel,
  type HonorsPolicy,
  type Remark,
} from '@bnhs/core';
import type { Db } from '../db';
import { notFound } from '../errors';
import { compareLearners } from './grades';

/**
 * Which quarterly grades may appear on a card.
 *   all      - everything computed so far (advisers and the office reviewing)
 *   approved - only quarters the registrar has approved (official printing)
 *   released - approved AND released to learners (student / parent portal)
 */
export type Visibility = 'all' | 'approved' | 'released';

export interface CardQuarter {
  quarter: number;
  grade: number | null;
  status: string;
  missing: number;
}

export interface CardSubject {
  classId: number;
  subjectId: number;
  code: string;
  name: string;
  type: string;
  quarters: CardQuarter[];
  finalGrade: number | null;
  remark: Remark;
  remedial: { mark: number; recomputed: number; dateFrom: string | null; dateTo: string | null; passed: boolean } | null;
}

export interface CardAttendanceMonth {
  year: number;
  month: number;
  schoolDays: number | null;
  present: number | null;
  absent: number | null;
  tardy: number | null;
}

export interface Card {
  enrollmentId: number;
  learner: {
    id: number;
    lrn: string;
    lastName: string;
    firstName: string;
    middleName: string | null;
    extName: string | null;
    sex: string;
    birthDate: string;
    address: string | null;
  };
  status: string;
  section: { id: number; name: string; gradeLevel: number; strandCode: string; strandName: string; track: string; adviser: string | null };
  schoolYear: { id: number; name: string };
  semester: number;
  quarters: [number, number];
  subjects: CardSubject[];
  generalAverage: number | null;
  complete: boolean;
  honors: HonorsLevel | null;
  attendance: CardAttendanceMonth[];
  /** values[valueKey][quarter] = AO | SO | RO | NO */
  values: Record<string, Record<number, string>>;
  /** true when some grade is hidden because its quarter is not approved / released yet */
  hasHidden: boolean;
}

const TYPE_ORDER: Record<string, number> = { CORE: 0, APPLIED: 1, SPECIALIZED: 2 };

/** Calendar year of a school month: June to December belong to the first year of the SY. */
export function calendarYear(schoolYearStart: Date, month: number): number {
  const y = schoolYearStart.getUTCFullYear();
  return month >= 6 ? y : y + 1;
}

export async function loadHonorsPolicy(db: Db): Promise<{ policy: HonorsPolicy; passing: number }> {
  const s = await db.school.findUnique({ where: { id: 1 } });
  if (!s) return { policy: DEFAULT_HONORS_POLICY, passing: 75 };
  return {
    passing: s.passingGrade,
    policy: {
      withHonors: s.honorsWith,
      withHighHonors: s.honorsHigh,
      withHighestHonors: s.honorsHighest,
      minSubjectGrade: s.honorsMinSubject,
    },
  };
}

export async function buildCards(
  db: Db,
  enrollmentIds: number[],
  semester: number,
  visibility: Visibility,
): Promise<Card[]> {
  if (!enrollmentIds.length) return [];
  const enrollments = await db.enrollment.findMany({
    where: { id: { in: enrollmentIds } },
    include: { learner: true, section: { include: { strand: true, adviser: true } }, schoolYear: true },
  });
  if (!enrollments.length) throw notFound('Enrollment');

  const { policy, passing } = await loadHonorsPolicy(db);
  const sectionIds = [...new Set(enrollments.map((e) => e.sectionId))];
  const yearIds = [...new Set(enrollments.map((e) => e.schoolYearId))];
  const [classes, grades, periods, attendance, values, remedials, schoolDays] = await Promise.all([
    db.classAssignment.findMany({ where: { sectionId: { in: sectionIds }, semester }, include: { subject: true } }),
    db.quarterlyGrade.findMany({ where: { enrollmentId: { in: enrollmentIds }, semester } }),
    db.gradingPeriod.findMany({ where: { schoolYearId: { in: yearIds } } }),
    db.attendance.findMany({ where: { enrollmentId: { in: enrollmentIds } } }),
    db.observedValue.findMany({ where: { enrollmentId: { in: enrollmentIds } } }),
    db.remedial.findMany({ where: { enrollmentId: { in: enrollmentIds }, semester } }),
    db.schoolDays.findMany({ where: { schoolYearId: { in: yearIds } } }),
  ]);
  const gradeClassIds = [...new Set([...classes.map((c) => c.id), ...grades.map((g) => g.classId)])];
  const workflow = await db.classQuarter.findMany({ where: { classId: { in: gradeClassIds } } });

  const strandIds = [...new Set(enrollments.map((e) => e.section.strandId))];
  const gradeLevels = [...new Set(enrollments.map((e) => e.section.gradeLevel))];
  const curriculum = await db.curriculumSubject.findMany({
    where: { semester, gradeLevel: { in: gradeLevels }, OR: [{ strandId: null }, { strandId: { in: strandIds } }] },
  });

  const [q1, q2] = quartersOfSemester(semester);
  const out: Card[] = [];

  for (const e of enrollments) {
    const sec = e.section;
    const sortOf = new Map<number, number>();
    for (const c of curriculum) {
      if (c.gradeLevel === sec.gradeLevel && (c.strandId === null || c.strandId === sec.strandId)) {
        sortOf.set(c.subjectId, c.sortOrder);
      }
    }
    const myClasses = classes
      .filter((c) => c.sectionId === e.sectionId)
      .sort(
        (a, b) =>
          (TYPE_ORDER[a.subject.type] ?? 9) - (TYPE_ORDER[b.subject.type] ?? 9) ||
          (sortOf.get(a.subjectId) ?? 999) - (sortOf.get(b.subjectId) ?? 999) ||
          a.subject.name.localeCompare(b.subject.name),
      );
    let hasHidden = false;

    const subjects: CardSubject[] = myClasses.map((c) => {
      const quarters: CardQuarter[] = [q1, q2].map((quarter) => {
        // Prefer the row of the current class; fall back to a class the learner left.
        const rows = grades.filter((g) => g.enrollmentId === e.id && g.subjectId === c.subjectId && g.quarter === quarter);
        const row = rows.find((g) => g.classId === c.id) ?? rows[0];
        const wf = row ? workflow.find((w) => w.classId === row.classId && w.quarter === quarter) : undefined;
        const status = wf?.status ?? 'DRAFT';
        const period = periods.find((p) => p.schoolYearId === e.schoolYearId && p.quarter === quarter);
        let visible = true;
        if (visibility === 'approved') visible = status === 'APPROVED';
        if (visibility === 'released') visible = status === 'APPROVED' && Boolean(period?.released);
        const raw = row?.quarterlyGrade ?? null;
        if (!visible && raw != null) hasHidden = true;
        return { quarter, grade: visible ? raw : null, status, missing: row?.missing ?? 0 };
      });
      const fin = finalGrade(quarters[0]!.grade, quarters[1]!.grade);
      const rem = remedials.find((r) => r.enrollmentId === e.id && r.subjectId === c.subjectId);
      let remedial: CardSubject['remedial'] = null;
      let effectiveFinal = fin;
      if (rem && fin != null && fin < passing) {
        const recomputed = recomputedFinal(fin, rem.mark);
        remedial = {
          mark: rem.mark,
          recomputed,
          dateFrom: rem.dateFrom?.toISOString().slice(0, 10) ?? null,
          dateTo: rem.dateTo?.toISOString().slice(0, 10) ?? null,
          passed: recomputed >= passing,
        };
        effectiveFinal = recomputed;
      }
      return {
        classId: c.id,
        subjectId: c.subjectId,
        code: c.subject.code,
        name: c.subject.name,
        type: c.subject.type,
        quarters,
        finalGrade: fin,
        remark: remarkFor(effectiveFinal, passing),
        remedial,
      };
    });

    // The general average uses the final grades as first computed; remedial results are shown next to them.
    const ga = generalAverage(subjects.map((s) => s.finalGrade));
    const honors = honorsFor(
      ga.average,
      subjects.map((s) => s.finalGrade),
      policy,
    );

    const months: CardAttendanceMonth[] = SCHOOL_MONTHS.map((month) => {
      const year = calendarYear(e.schoolYear.startDate, month);
      const days = schoolDays.find((d) => d.schoolYearId === e.schoolYearId && d.year === year && d.month === month);
      const a = attendance.find((x) => x.enrollmentId === e.id && x.year === year && x.month === month);
      const present = a?.daysPresent ?? null;
      return {
        year,
        month,
        schoolDays: days?.days ?? null,
        present,
        absent: days && present != null ? Math.max(0, days.days - present) : null,
        tardy: a?.timesTardy ?? null,
      };
    });

    const vals: Card['values'] = {};
    for (const v of values.filter((x) => x.enrollmentId === e.id)) {
      (vals[v.valueKey] ??= {})[v.quarter] = v.marking;
    }

    out.push({
      enrollmentId: e.id,
      learner: {
        id: e.learner.id,
        lrn: e.learner.lrn,
        lastName: e.learner.lastName,
        firstName: e.learner.firstName,
        middleName: e.learner.middleName,
        extName: e.learner.extName,
        sex: e.learner.sex,
        birthDate: e.learner.birthDate.toISOString().slice(0, 10),
        address: e.learner.address,
      },
      status: e.status,
      section: {
        id: sec.id,
        name: sec.name,
        gradeLevel: sec.gradeLevel,
        strandCode: sec.strand.code,
        strandName: sec.strand.name,
        track: sec.strand.track,
        adviser: sec.adviser?.fullName ?? null,
      },
      schoolYear: { id: e.schoolYear.id, name: e.schoolYear.name },
      semester,
      quarters: [q1, q2],
      subjects,
      generalAverage: ga.average,
      complete: ga.complete,
      honors,
      attendance: months,
      values: vals,
      hasHidden,
    });
  }

  return out.sort((a, b) => compareLearners(a.learner, b.learner));
}

export async function buildCard(db: Db, enrollmentId: number, semester: number, visibility: Visibility): Promise<Card> {
  const [card] = await buildCards(db, [enrollmentId], semester, visibility);
  if (!card) throw notFound('Enrollment');
  return card;
}
