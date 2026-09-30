import { describe, expect, it } from 'vitest';
import {
  computeComponent,
  computeQuarter,
  DEFAULT_HONORS_POLICY,
  descriptorFor,
  finalGrade,
  formatLearnerName,
  generalAverage,
  honorsFor,
  isValidLrn,
  recomputedFinal,
  remarkFor,
  roundTo,
  roundWhole,
  transmute,
  transmutationTable,
  validateWeights,
} from '../src';

/** The table exactly as printed in DO 8 s. 2015: [lowest initial grade, transmuted grade]. */
const OFFICIAL: Array<[number, number]> = [
  [100, 100], [98.4, 99], [96.8, 98], [95.2, 97], [93.6, 96], [92, 95], [90.4, 94], [88.8, 93],
  [87.2, 92], [85.6, 91], [84, 90], [82.4, 89], [80.8, 88], [79.2, 87], [77.6, 86], [76, 85],
  [74.4, 84], [72.8, 83], [71.2, 82], [69.6, 81], [68, 80], [66.4, 79], [64.8, 78], [63.2, 77],
  [61.6, 76], [60, 75], [56, 74], [52, 73], [48, 72], [44, 71], [40, 70], [36, 69], [32, 68],
  [28, 67], [24, 66], [20, 65], [16, 64], [12, 63], [8, 62], [4, 61], [0, 60],
];

describe('transmute', () => {
  it('matches every row of the official table at the lower bound', () => {
    for (const [initial, grade] of OFFICIAL) expect(transmute(initial), `initial ${initial}`).toBe(grade);
  });

  it('matches the official table at the upper bound of each band', () => {
    for (let i = 0; i < OFFICIAL.length - 1; i++) {
      const [lower, grade] = OFFICIAL[i]!;
      if (lower === 100) continue;
      const nextLower = OFFICIAL[i - 1]?.[0] ?? 100;
      const upper = roundTo(nextLower - 0.01);
      expect(transmute(upper), `initial ${upper}`).toBe(grade);
    }
  });

  it('never lets a value just below a boundary through', () => {
    expect(transmute(59.99)).toBe(74);
    expect(transmute(61.59)).toBe(75);
    expect(transmute(61.6)).toBe(76);
    expect(transmute(99.99)).toBe(99);
    expect(transmute(3.99)).toBe(60);
  });

  it('clamps out-of-range input', () => {
    expect(transmute(120)).toBe(100);
    expect(transmute(-5)).toBe(60);
  });

  it('transmutationTable() reproduces the official rows', () => {
    const t = transmutationTable();
    expect(t).toHaveLength(OFFICIAL.length);
    t.forEach((row, i) => {
      expect([row.from, row.grade]).toEqual(OFFICIAL[i]);
    });
    expect(t[1]).toEqual({ from: 98.4, to: 99.99, grade: 99 });
    expect(t[25]).toEqual({ from: 60, to: 61.59, grade: 75 });
    expect(t[26]).toEqual({ from: 56, to: 59.99, grade: 74 });
  });
});

describe('computeComponent', () => {
  it('sums scores and HPS then takes the percentage and weighted score', () => {
    const r = computeComponent(
      [
        { hps: 10, score: 8 },
        { hps: 20, score: 15 },
        { hps: 20, score: 17 },
      ],
      25,
    );
    expect(r).toEqual({ total: 40, hps: 50, ps: 80, ws: 20, missing: 0 });
  });

  it('rounds the percentage score to 2 decimals', () => {
    const r = computeComponent([{ hps: 30, score: 20 }], 25);
    expect(r.ps).toBe(66.67);
    expect(r.ws).toBe(16.67);
  });

  it('treats blanks as zero but reports them as missing', () => {
    const r = computeComponent(
      [
        { hps: 10, score: 10 },
        { hps: 10, score: null },
      ],
      50,
    );
    expect(r.total).toBe(10);
    expect(r.hps).toBe(20);
    expect(r.ps).toBe(50);
    expect(r.missing).toBe(1);
  });

  it('leaves excused items out of both score and HPS', () => {
    const r = computeComponent(
      [
        { hps: 10, score: 9 },
        { hps: 90, score: null, excused: true },
      ],
      100,
    );
    expect(r).toMatchObject({ total: 9, hps: 10, ps: 90, missing: 0 });
  });

  it('has no percentage without any counted item', () => {
    expect(computeComponent([], 25).ps).toBeNull();
    expect(computeComponent([{ hps: 10, score: null, excused: true }], 25).ps).toBeNull();
  });
});

describe('computeQuarter', () => {
  it('worked example: core subject 25/50/25', () => {
    const r = computeQuarter({
      weights: { ww: 25, pt: 50, qa: 25 },
      ww: [{ hps: 50, score: 40 }],
      pt: [{ hps: 100, score: 90 }],
      qa: [{ hps: 60, score: 45 }],
    });
    // WS: 80 x .25 = 20 ; 90 x .50 = 45 ; 75 x .25 = 18.75
    expect(r.ww.ws).toBe(20);
    expect(r.pt.ws).toBe(45);
    expect(r.qa.ws).toBe(18.75);
    expect(r.initialGrade).toBe(83.75);
    expect(r.quarterlyGrade).toBe(89);
  });

  it('worked example: TVL 20/60/20 with a low performer', () => {
    const r = computeQuarter({
      weights: { ww: 20, pt: 60, qa: 20 },
      ww: [{ hps: 20, score: 10 }],
      pt: [{ hps: 50, score: 20 }],
      qa: [{ hps: 40, score: 16 }],
    });
    // 50 x .2 = 10 ; 40 x .6 = 24 ; 40 x .2 = 8 => 42.00
    expect(r.initialGrade).toBe(42);
    expect(r.quarterlyGrade).toBe(70);
  });

  it('perfect scores give 100', () => {
    const r = computeQuarter({
      weights: { ww: 35, pt: 40, qa: 25 },
      ww: [{ hps: 10, score: 10 }],
      pt: [{ hps: 10, score: 10 }],
      qa: [{ hps: 10, score: 10 }],
    });
    expect(r.initialGrade).toBe(100);
    expect(r.quarterlyGrade).toBe(100);
  });

  it('is incomplete while a component has no items', () => {
    const r = computeQuarter({
      weights: { ww: 25, pt: 50, qa: 25 },
      ww: [{ hps: 10, score: 10 }],
      pt: [{ hps: 10, score: 10 }],
      qa: [],
    });
    expect(r.initialGrade).toBeNull();
    expect(r.quarterlyGrade).toBeNull();
  });

  it('rejects weights that do not add up to 100', () => {
    expect(() => validateWeights({ ww: 25, pt: 50, qa: 30 })).toThrow();
    expect(() => validateWeights({ ww: -5, pt: 55, qa: 50 })).toThrow();
    expect(() => validateWeights({ ww: 25, pt: 50, qa: 25 })).not.toThrow();
  });
});

describe('final grade and general average', () => {
  it('averages two quarters and rounds half up', () => {
    expect(finalGrade(80, 85)).toBe(83); // 82.5 -> 83
    expect(finalGrade(75, 76)).toBe(76); // 75.5 -> 76
    expect(finalGrade(90, 90)).toBe(90);
  });

  it('needs both quarters', () => {
    expect(finalGrade(90, null)).toBeNull();
    expect(finalGrade(undefined, 90)).toBeNull();
  });

  it('general average is the mean of final grades, whole number', () => {
    expect(generalAverage([85, 86, 90])).toEqual({ average: 87, complete: true, count: 3 });
    expect(generalAverage([80, 81])).toEqual({ average: 81, complete: true, count: 2 }); // 80.5 -> 81
  });

  it('general average waits for every subject', () => {
    expect(generalAverage([85, null, 90])).toEqual({ average: null, complete: false, count: 2 });
    expect(generalAverage([])).toEqual({ average: null, complete: false, count: 0 });
  });

  it('recomputed final for remedial classes', () => {
    expect(recomputedFinal(72, 80)).toBe(76);
    expect(recomputedFinal(70, 75)).toBe(73); // 72.5 -> 73
  });
});

describe('descriptors and remarks', () => {
  it('follows DO 8 scale', () => {
    expect(descriptorFor(100)).toBe('Outstanding');
    expect(descriptorFor(90)).toBe('Outstanding');
    expect(descriptorFor(89)).toBe('Very Satisfactory');
    expect(descriptorFor(85)).toBe('Very Satisfactory');
    expect(descriptorFor(84)).toBe('Satisfactory');
    expect(descriptorFor(80)).toBe('Satisfactory');
    expect(descriptorFor(79)).toBe('Fairly Satisfactory');
    expect(descriptorFor(75)).toBe('Fairly Satisfactory');
    expect(descriptorFor(74)).toBe('Did Not Meet Expectations');
    expect(descriptorFor(null)).toBe('');
  });

  it('remarks', () => {
    expect(remarkFor(75)).toBe('PASSED');
    expect(remarkFor(74)).toBe('FAILED');
    expect(remarkFor(null)).toBe('INCOMPLETE');
  });
});

describe('honors (DO 36 s. 2016)', () => {
  it('awards by general average when no subject is below 85', () => {
    expect(honorsFor(90, [90, 90, 90])).toBe('WITH_HONORS');
    expect(honorsFor(94, [90, 98])).toBe('WITH_HONORS');
    expect(honorsFor(95, [95, 95])).toBe('WITH_HIGH_HONORS');
    expect(honorsFor(98, [98, 99])).toBe('WITH_HIGHEST_HONORS');
  });

  it('blocks the award if any subject is under 85 or missing', () => {
    expect(honorsFor(95, [100, 84, 100])).toBeNull();
    expect(honorsFor(95, [100, null])).toBeNull();
    expect(honorsFor(null, [])).toBeNull();
    expect(honorsFor(89, [89, 89])).toBeNull();
  });

  it('policy is adjustable', () => {
    expect(honorsFor(88, [86, 90], { ...DEFAULT_HONORS_POLICY, withHonors: 88 })).toBe('WITH_HONORS');
  });
});

describe('helpers', () => {
  it('rounding', () => {
    expect(roundTo(1.005)).toBe(1.01);
    expect(roundTo(2.675)).toBe(2.68);
    expect(roundWhole(82.5)).toBe(83);
    expect(roundWhole(82.4999)).toBe(82);
  });

  it('LRN must be 12 digits', () => {
    expect(isValidLrn('123456789012')).toBe(true);
    expect(isValidLrn('12345678901')).toBe(false);
    expect(isValidLrn('12345678901a')).toBe(false);
  });

  it('formats names like DepEd forms', () => {
    expect(formatLearnerName({ lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr.' })).toBe(
      'DELA CRUZ, Juan Santos Jr.',
    );
    expect(formatLearnerName({ lastName: 'Reyes', firstName: 'Ana' })).toBe('REYES, Ana');
  });
});
