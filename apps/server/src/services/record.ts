import type { ComponentResult, Weights } from '@bnhs/core';
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
  termGrade: number | null;
  missing: number;
}

export interface RecordData {
  weights: Weights;
  items: RecordItem[];
  learners: RecordLearner[];
}

/** The class record of one term, computed live from the scores. */
export async function loadRecordData(db: Db, cls: LoadedClass): Promise<RecordData> {
  const weights = await classWeights(db, cls);
  const [items, enrollments] = await Promise.all([
    db.assessmentItem.findMany({
      where: { classId: cls.id },
      include: { scores: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
    db.enrollment.findMany({ where: { sectionId: cls.sectionId }, include: { learner: true } }),
  ]);

  const learners = enrollments
    .map((e): RecordLearner => {
      const detail = computeForEnrollment(items, e.id, weights);
      const scores: RecordLearner['scores'] = {};
      for (const it of items) {
        const row = it.scores.find((s) => s.enrollmentId === e.id);
        if (row) scores[it.id] = { score: row.score, excused: row.excused };
      }
      return {
        enrollmentId: e.id,
        status: e.status,
        ...briefLearner(e.learner),
        scores,
        ww: detail.ww,
        pt: detail.pt,
        qa: detail.qa,
        initialGrade: detail.initialGrade,
        termGrade: detail.termGrade,
        missing: detail.missing,
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
