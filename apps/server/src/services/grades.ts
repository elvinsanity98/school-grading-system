import { computeTermGrade, type Component, type ItemScore, type TermGradeResult, type Weights } from '@bnhs/core';
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

export interface GradeDetail extends TermGradeResult {
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
  const result = computeTermGrade({ ww: byComponent.WW, pt: byComponent.PT, qa: byComponent.QA, weights });
  return { ...result, weights };
}

/**
 * Recomputes and stores the term grade of every learner in the class.
 * Call after any change to items, scores, weights or enrollment.
 */
export async function recomputeClass(db: Db, classId: number): Promise<void> {
  const cls = await loadClass(db, classId);
  const weights = await classWeights(db, cls);
  const items = await db.assessmentItem.findMany({
    where: { classId },
    include: { scores: { select: { enrollmentId: true, score: true, excused: true } } },
  });
  const enrollments = await db.enrollment.findMany({ where: { sectionId: cls.sectionId }, select: { id: true } });
  const now = new Date();

  const rows = enrollments.map((e) => {
    const detail = computeForEnrollment(items, e.id, weights);
    return {
      classId,
      enrollmentId: e.id,
      subjectId: cls.subjectId,
      term: cls.term,
      detail: JSON.stringify(detail),
      initialGrade: detail.initialGrade,
      termGrade: detail.termGrade,
      missing: detail.missing,
      computedAt: now,
    };
  });
  // Replace the whole class in two statements. One upsert per learner would be dozens of round
  // trips, which is slow on a hosted database.
  await db.$transaction([db.termGrade.deleteMany({ where: { classId } }), db.termGrade.createMany({ data: rows })]);
}

/** After a learner joins or changes section, bring the stored grades of that section up to date. */
export async function recomputeSection(db: Db, sectionId: number): Promise<void> {
  const classes = await db.assessmentItem.findMany({
    where: { class: { sectionId } },
    select: { classId: true },
    distinct: ['classId'],
  });
  for (const c of classes) await recomputeClass(db, c.classId);
}

// ------------------------------------------------------------------ workflow

export interface ClassState {
  status: string;
  note: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  /** The term's grading period: OPEN or CLOSED for encoding. */
  periodStatus: string;
  released: boolean;
}

/** Approval status of a class record (DRAFT when nobody has touched it) and the state of its term. */
export async function classState(db: Db, cls: { id: number; schoolYearId: number; term: number }): Promise<ClassState> {
  const [wf, period] = await Promise.all([
    db.classWorkflow.findUnique({ where: { classId: cls.id } }),
    db.gradingPeriod.findUnique({ where: { schoolYearId_term: { schoolYearId: cls.schoolYearId, term: cls.term } } }),
  ]);
  return {
    status: wf?.status ?? 'DRAFT',
    note: wf?.note ?? null,
    submittedAt: wf?.submittedAt ?? null,
    reviewedAt: wf?.reviewedAt ?? null,
    periodStatus: period?.status ?? 'CLOSED',
    released: period?.released ?? false,
  };
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
