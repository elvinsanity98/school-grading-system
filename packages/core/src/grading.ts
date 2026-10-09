/**
 * DepEd grading rules for Senior High School.
 * Source: DepEd Order No. 8, s. 2015 (Policy Guidelines on Classroom Assessment
 * for the K to 12 Basic Education Program), as retained by DO 21, s. 2019.
 *
 * Steps for one learner, one subject, one term:
 *   1. Total the raw scores and the highest possible scores (HPS) of each
 *      component: Written Work (WW), Performance Tasks (PT), Term Assessment (QA).
 *   2. Percentage Score (PS)  = total score / total HPS x 100
 *   3. Weighted Score (WS)    = PS x component weight
 *   4. Initial Grade          = WS(WW) + WS(PT) + WS(QA)
 *   5. Term Grade             = Initial Grade run through the transmutation table
 *
 * Values are rounded to 2 decimals at each step, so the numbers on screen add up
 * exactly the way a teacher would check them on paper.
 */

export type Component = 'WW' | 'PT' | 'QA';
export const COMPONENTS: readonly Component[] = ['WW', 'PT', 'QA'] as const;

export const COMPONENT_LABEL: Record<Component, string> = {
  WW: 'Written Work',
  PT: 'Performance Tasks',
  QA: 'Term Assessment',
};

/** Weights in percent. Must add up to 100. */
export interface Weights {
  ww: number;
  pt: number;
  qa: number;
}

export const PASSING_GRADE = 75;

/** Round half up to `digits` decimals, safe against 1.005 style float error. */
export function roundTo(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f + 1e-9) / f;
}

/** Whole-number rounding used for final grades and general averages (0.5 rounds up). */
export function roundWhole(n: number): number {
  return Math.floor(n + 0.5 + 1e-9);
}

export function validateWeights(w: Weights): void {
  const sum = w.ww + w.pt + w.qa;
  if (w.ww < 0 || w.pt < 0 || w.qa < 0 || Math.abs(sum - 100) > 1e-6) {
    throw new Error(`Weights must be non-negative and add up to 100 (got ${w.ww}/${w.pt}/${w.qa}).`);
  }
}

/**
 * Transmutation table of DO 8 s. 2015.
 *   Initial grade 60.00 to 100  -> 75 to 100, one step for every 1.60 points
 *   Initial grade 0 to 59.99    -> 60 to 74,  one step for every 4.00 points
 * Integer hundredths keep the boundaries exact (e.g. 61.60 is 76, never 75).
 */
export function transmute(initialGrade: number): number {
  const cents = Math.round(initialGrade * 100);
  if (cents >= 10000) return 100;
  if (cents < 0) return 60;
  if (cents >= 6000) return 75 + Math.floor((cents - 6000) / 160);
  return 60 + Math.floor(cents / 400);
}

export interface TransmutationRow {
  from: number;
  to: number;
  grade: number;
}

/** The table as printed in DO 8, highest row first (for display and tests). */
export function transmutationTable(): TransmutationRow[] {
  const rows: TransmutationRow[] = [{ from: 100, to: 100, grade: 100 }];
  for (let g = 99; g >= 75; g--) {
    const from = roundTo(60 + (g - 75) * 1.6);
    rows.push({ from, to: g === 99 ? 99.99 : roundTo(from + 1.59), grade: g });
  }
  for (let g = 74; g >= 60; g--) {
    const from = (g - 60) * 4;
    rows.push({ from, to: roundTo(from + 3.99), grade: g });
  }
  return rows;
}

export interface ItemScore {
  /** Highest possible score of the item. */
  hps: number;
  /** null = not yet encoded (counts as 0 but flagged as missing). */
  score: number | null;
  /** Excused items leave both the score and the HPS out for this learner. */
  excused?: boolean;
}

export interface ComponentResult {
  total: number;
  hps: number;
  /** Percentage score, null when no item counts. */
  ps: number | null;
  /** Weighted score, null when PS is null. */
  ws: number | null;
  /** Items still blank. */
  missing: number;
}

export function computeComponent(items: ItemScore[], weightPercent: number): ComponentResult {
  let total = 0;
  let hps = 0;
  let missing = 0;
  for (const it of items) {
    if (it.excused) continue;
    hps += it.hps;
    if (it.score == null) missing++;
    else total += it.score;
  }
  total = roundTo(total);
  hps = roundTo(hps);
  if (hps <= 0) return { total, hps, ps: null, ws: null, missing };
  const ps = roundTo((total / hps) * 100);
  const ws = roundTo((ps * weightPercent) / 100);
  return { total, hps, ps, ws, missing };
}

export interface TermGradeInput {
  ww: ItemScore[];
  pt: ItemScore[];
  qa: ItemScore[];
  weights: Weights;
}

export interface TermGradeResult {
  ww: ComponentResult;
  pt: ComponentResult;
  qa: ComponentResult;
  /** null until all three components have at least one counted item. */
  initialGrade: number | null;
  termGrade: number | null;
  /** Items still blank across the three components. */
  missing: number;
}

export function computeTermGrade(input: TermGradeInput): TermGradeResult {
  validateWeights(input.weights);
  const ww = computeComponent(input.ww, input.weights.ww);
  const pt = computeComponent(input.pt, input.weights.pt);
  const qa = computeComponent(input.qa, input.weights.qa);
  const missing = ww.missing + pt.missing + qa.missing;
  if (ww.ws == null || pt.ws == null || qa.ws == null) {
    return { ww, pt, qa, initialGrade: null, termGrade: null, missing };
  }
  const initialGrade = roundTo(ww.ws + pt.ws + qa.ws);
  return { ww, pt, qa, initialGrade, termGrade: transmute(initialGrade), missing };
}

export interface GeneralAverageResult {
  average: number | null;
  /** True when every subject has a final grade. */
  complete: boolean;
  count: number;
}

/** General average for a term: every subject counts equally. */
export function generalAverage(finals: Array<number | null | undefined>): GeneralAverageResult {
  const have = finals.filter((f): f is number => f != null);
  const complete = finals.length > 0 && have.length === finals.length;
  if (!complete) return { average: null, complete: false, count: have.length };
  return { average: roundWhole(have.reduce((a, b) => a + b, 0) / have.length), complete: true, count: have.length };
}

export function isPassing(grade: number | null | undefined, passing = PASSING_GRADE): boolean {
  return grade != null && grade >= passing;
}

export type Remark = 'PASSED' | 'FAILED' | 'INCOMPLETE';

export function remarkFor(grade: number | null | undefined, passing = PASSING_GRADE): Remark {
  if (grade == null) return 'INCOMPLETE';
  return grade >= passing ? 'PASSED' : 'FAILED';
}

export interface Descriptor {
  label: string;
  min: number;
  max: number;
}

/** Descriptors and grading scale from DO 8 s. 2015. */
export const DESCRIPTORS: readonly Descriptor[] = [
  { label: 'Outstanding', min: 90, max: 100 },
  { label: 'Very Satisfactory', min: 85, max: 89 },
  { label: 'Satisfactory', min: 80, max: 84 },
  { label: 'Fairly Satisfactory', min: 75, max: 79 },
  { label: 'Did Not Meet Expectations', min: 0, max: 74 },
] as const;

export function descriptorFor(grade: number | null | undefined): string {
  if (grade == null) return '';
  return DESCRIPTORS.find((d) => grade >= d.min)?.label ?? '';
}

/** Remedial classes (DO 8): recomputed final grade = average of final grade and remedial mark. */
export function recomputedFinal(finalGradeValue: number, remedialMark: number): number {
  return roundWhole((finalGradeValue + remedialMark) / 2);
}

export interface HonorsPolicy {
  /** Minimum general average for "With Honors". */
  withHonors: number;
  withHighHonors: number;
  withHighestHonors: number;
  /** No subject final grade may be below this (DO 36 s. 2016). */
  minSubjectGrade: number;
}

export const DEFAULT_HONORS_POLICY: HonorsPolicy = {
  withHonors: 90,
  withHighHonors: 95,
  withHighestHonors: 98,
  minSubjectGrade: 85,
};

export type HonorsLevel = 'WITH_HIGHEST_HONORS' | 'WITH_HIGH_HONORS' | 'WITH_HONORS';

export const HONORS_LABEL: Record<HonorsLevel, string> = {
  WITH_HIGHEST_HONORS: 'With Highest Honors',
  WITH_HIGH_HONORS: 'With High Honors',
  WITH_HONORS: 'With Honors',
};

/**
 * Academic excellence award (DO 36 s. 2016). Conduct is not checked here: the
 * adviser confirms that separately.
 */
export function honorsFor(
  generalAvg: number | null,
  finals: Array<number | null | undefined>,
  policy: HonorsPolicy = DEFAULT_HONORS_POLICY,
): HonorsLevel | null {
  if (generalAvg == null) return null;
  if (finals.some((f) => f == null || f < policy.minSubjectGrade)) return null;
  if (generalAvg >= policy.withHighestHonors) return 'WITH_HIGHEST_HONORS';
  if (generalAvg >= policy.withHighHonors) return 'WITH_HIGH_HONORS';
  if (generalAvg >= policy.withHonors) return 'WITH_HONORS';
  return null;
}
