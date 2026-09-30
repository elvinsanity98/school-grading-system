import { finalGrade, type ComponentResult, type Weights } from '@bnhs/core';
import type { Db } from '../db';
import { classWeights, compareLearners, computeForEnrollment, type LoadedClass } from './grades';
import { briefLearner } from './present';
import { iso } from '../util';

export interface RecordItem {
  id: number;
  component: string;
  title: string;
  hps: number;
  dateGiven: string | null;
  sortOrder: number;
}

export interface RecordLearner {
  enrollmentId: number;
  status: string;
  id: number;
  lrn: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  extName: string | null;
  sex: string;
  scores: Record<number, { score: number | null; excused: boolean }>;
  ww: ComponentResult;
  pt: ComponentResult;
  qa: ComponentResult;
  initialGrade: number | null;
  quarterlyGrade: number | null;
  missing: number;
  semesterView: { q1: number | null; q2: number | null; final: number | null };
}

export interface RecordData {
  weights: Weights;
  items: RecordItem[];
  learners: RecordLearner[];
}

/** The class record of one quarter, computed live from the scores. */
export async function loadRecordData(db: Db, cls: LoadedClass, quarter: number): Promise<RecordData> {
  const weights = await classWeights(db, cls);
  const [items, enrollments, stored] = await Promise.all([
    db.assessmentItem.findMany({
      where: { classId: cls.id, quarter },
      include: { scores: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
    db.enrollment.findMany({ where: { sectionId: cls.sectionId }, include: { learner: true } }),
    db.quarterlyGrade.findMany({ where: { classId: cls.id } }),
  ]);
  const [qa, qb] = cls.semester === 1 ? [1, 2] : [3, 4];

  const learners = enrollments
    .map((e): RecordLearner => {
      const detail = computeForEnrollment(items, e.id, weights);
      const scores: RecordLearner['scores'] = {};
      for (const it of items) {
        const row = it.scores.find((s) => s.enrollmentId === e.id);
        if (row) scores[it.id] = { score: row.score, excused: row.excused };
      }
      const perQuarter: Record<number, number | null> = {};
      for (const g of stored.filter((x) => x.enrollmentId === e.id)) perQuarter[g.quarter] = g.quarterlyGrade;
      perQuarter[quarter] = detail.quarterlyGrade;
      return {
        enrollmentId: e.id,
        status: e.status,
        ...briefLearner(e.learner),
        scores,
        ww: detail.ww,
        pt: detail.pt,
        qa: detail.qa,
        initialGrade: detail.initialGrade,
        quarterlyGrade: detail.quarterlyGrade,
        missing: detail.missing,
        semesterView: { q1: perQuarter[qa] ?? null, q2: perQuarter[qb] ?? null, final: finalGrade(perQuarter[qa], perQuarter[qb]) },
      };
    })
    .sort(compareLearners);

  return {
    weights,
    items: items.map((it) => ({
      id: it.id,
      component: it.component,
      title: it.title,
      hps: it.hps,
      dateGiven: iso(it.dateGiven),
      sortOrder: it.sortOrder,
    })),
    learners,
  };
}
