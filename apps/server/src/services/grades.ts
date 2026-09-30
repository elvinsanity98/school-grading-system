import {
  computeQuarter,
  semesterOfQuarter,
  type Component,
  type ItemScore,
  type QuarterResult,
  type Weights,
} from '@bnhs/core';
import type { Db, Tx } from '../db';
import { notFound } from '../errors';

// ------------------------------------------------------------------ weights

/**
 * DO 8 s. 2015: the weights depend on the kind of subject and on the track of the strand.
 *   core                          -> CORE
 *   immersion, academic track     -> ACAD_IMMERSION
 *   other, academic track         -> ACAD_OTHER
 *   anything in TVL/Sports/Arts   -> TVL_OTHER
 */
export function profileCodeFor(subject: { type: string; isImmersion: boolean }, track: string): string {
  if (subject.type === 'CORE') return 'CORE';
  const academic = track === 'ACADEMIC';
  if (subject.isImmersion) return academic ? 'ACAD_IMMERSION' : 'TVL_OTHER';
  return academic ? 'ACAD_OTHER' : 'TVL_OTHER';
}

interface ProfileRow {
  code: string;
  ww: number;
  pt: number;
  qa: number;
}

export async function loadProfiles(db: Db | Tx): Promise<Map<string, ProfileRow>> {
  const rows = await db.weightProfile.findMany();
  return new Map(rows.map((r) => [r.code, r]));
}

export function weightsFor(
  subject: { type: string; isImmersion: boolean; weightProfile?: ProfileRow | null },
  track: string,
  profiles: Map<string, ProfileRow>,
): Weights {
  const p = subject.weightProfile ?? profiles.get(profileCodeFor(subject, track));
  if (!p) throw new Error(`No weight profile for ${subject.type} subject in ${track} track.`);
  return { ww: p.ww, pt: p.pt, qa: p.qa };
}

// ------------------------------------------------------------------ class context

export const classInclude = {
  subject: { include: { weightProfile: true } },
  section: { include: { strand: true, adviser: true } },
  teacher: true,
  schoolYear: true,
} as const;

export async function loadClass(db: Db | Tx, id: number) {
  const cls = await db.classAssignment.findUnique({ where: { id }, include: classInclude });
  if (!cls) throw notFound('Class');
  return cls;
}

export type LoadedClass = Awaited<ReturnType<typeof loadClass>>;

export async function classWeights(db: Db | Tx, cls: LoadedClass): Promise<Weights> {
  return weightsFor(cls.subject, cls.section.strand.track, await loadProfiles(db));
}

// ------------------------------------------------------------------ computation

export interface GradeDetail extends QuarterResult {
  weights: Weights;
}

type ItemWithScores = {
  id: number;
  component: string;
  hps: number;
  scores: Array<{ enrollmentId: number; score: number | null; excused: boolean }>;
};

/** Builds the per-component score lists for one learner and runs the DepEd computation. */
export function computeForEnrollment(items: ItemWithScores[], enrollmentId: number, weights: Weights): GradeDetail {
  const byComponent: Record<Component, ItemScore[]> = { WW: [], PT: [], QA: [] };
  for (const item of items) {
    const row = item.scores.find((s) => s.enrollmentId === enrollmentId);
    const bucket = byComponent[item.component as Component];
    if (!bucket) continue;
    bucket.push({ hps: item.hps, score: row?.score ?? null, excused: row?.excused ?? false });
  }
  const result = computeQuarter({ ww: byComponent.WW, pt: byComponent.PT, qa: byComponent.QA, weights });
  return { ...result, weights };
}

/**
 * Recomputes and stores the quarterly grade of every learner in the class for one quarter.
 * Call after any change to items, scores, weights or enrollment.
 */
export async function recomputeClassQuarter(db: Db, classId: number, quarter: number): Promise<void> {
  const cls = await loadClass(db, classId);
  const weights = await classWeights(db, cls);
  const items = await db.assessmentItem.findMany({
    where: { classId, quarter },
    include: { scores: { select: { enrollmentId: true, score: true, excused: true } } },
  });
  const enrollments = await db.enrollment.findMany({ where: { sectionId: cls.sectionId }, select: { id: true } });
  const semester = semesterOfQuarter(quarter);
  const now = new Date();

  const rows = enrollments.map((e) => {
    const detail = computeForEnrollment(items, e.id, weights);
    return {
      classId,
      enrollmentId: e.id,
      quarter,
      subjectId: cls.subjectId,
      semester,
      detail: JSON.stringify(detail),
      initialGrade: detail.initialGrade,
      quarterlyGrade: detail.quarterlyGrade,
      missing: detail.missing,
      computedAt: now,
    };
  });
  // Replace the whole quarter in two statements. One upsert per learner would be dozens of round
  // trips, which is slow on a hosted database.
  await db.$transaction([
    db.quarterlyGrade.deleteMany({ where: { classId, quarter } }),
    db.quarterlyGrade.createMany({ data: rows }),
  ]);
}

/** After a learner joins or changes section, bring the stored grades of that section up to date. */
export async function recomputeSection(db: Db, sectionId: number): Promise<void> {
  const quarters = await db.assessmentItem.findMany({
    where: { class: { sectionId } },
    select: { classId: true, quarter: true },
    distinct: ['classId', 'quarter'],
  });
  for (const q of quarters) await recomputeClassQuarter(db, q.classId, q.quarter);
}

// ------------------------------------------------------------------ workflow

export interface QuarterState {
  quarter: number;
  status: string;
  note: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  periodStatus: string;
  released: boolean;
}

/** Workflow status of a class for all four quarters (DRAFT when never touched). */
export async function quarterStates(db: Db, cls: { id: number; schoolYearId: number }): Promise<QuarterState[]> {
  const [rows, periods] = await Promise.all([
    db.classQuarter.findMany({ where: { classId: cls.id } }),
    db.gradingPeriod.findMany({ where: { schoolYearId: cls.schoolYearId } }),
  ]);
  return [1, 2, 3, 4].map((quarter) => {
    const r = rows.find((x) => x.quarter === quarter);
    const p = periods.find((x) => x.quarter === quarter);
    return {
      quarter,
      status: r?.status ?? 'DRAFT',
      note: r?.note ?? null,
      submittedAt: r?.submittedAt ?? null,
      reviewedAt: r?.reviewedAt ?? null,
      periodStatus: p?.status ?? 'CLOSED',
      released: p?.released ?? false,
    };
  });
}

/** Sort used on DepEd class records: males first, then females, each alphabetical. */
export function compareLearners(
  a: { sex: string; lastName: string; firstName: string; middleName?: string | null },
  b: { sex: string; lastName: string; firstName: string; middleName?: string | null },
): number {
  if (a.sex !== b.sex) return a.sex === 'M' ? -1 : 1;
  return (
    a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) ||
    a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' }) ||
    (a.middleName ?? '').localeCompare(b.middleName ?? '', 'en', { sensitivity: 'base' })
  );
}
