import { DEFAULT_SCHOOL, DEFAULT_WEIGHT_PROFILES } from '@bnhs/core';
import type { Db } from './db';

interface StrandSeed {
  code: string;
  name: string;
  track: 'ACADEMIC' | 'TVL' | 'SPORTS' | 'ARTS_DESIGN';
}

export const STRAND_SEEDS: StrandSeed[] = [
  { code: 'STEM', name: 'Science, Technology, Engineering and Mathematics', track: 'ACADEMIC' },
  { code: 'ABM', name: 'Accountancy, Business and Management', track: 'ACADEMIC' },
  { code: 'HUMSS', name: 'Humanities and Social Sciences', track: 'ACADEMIC' },
  { code: 'GAS', name: 'General Academic Strand', track: 'ACADEMIC' },
  { code: 'TVL-ICT', name: 'TVL - Information and Communications Technology', track: 'TVL' },
  { code: 'TVL-HE', name: 'TVL - Home Economics', track: 'TVL' },
];

type SubjectType = 'CORE' | 'APPLIED' | 'SPECIALIZED';

interface SubjectSeed {
  code: string;
  name: string;
  type: SubjectType;
  isImmersion?: boolean;
  /** Where it is offered: [gradeLevel, semester] pairs. */
  when: Array<[11 | 12, 1 | 2]>;
  /** Strand codes. Omit for every strand. */
  strands?: string[];
}

/**
 * SAMPLE program of subjects, following the K to 12 Senior High School curriculum guide.
 * Schools schedule subjects differently, so the administrator edits this list (Setup > Curriculum)
 * to match the program that Balakan National High School actually offers.
 */
export const SUBJECT_SEEDS: SubjectSeed[] = [
  // ---- core (every strand)
  { code: 'ORALCOM', name: 'Oral Communication', type: 'CORE', when: [[11, 1]] },
  { code: 'KOMPAN', name: 'Komunikasyon at Pananaliksik sa Wika at Kulturang Filipino', type: 'CORE', when: [[11, 1]] },
  { code: 'GENMATH', name: 'General Mathematics', type: 'CORE', when: [[11, 1]] },
  { code: 'EARTHLIFE', name: 'Earth and Life Science', type: 'CORE', when: [[11, 1]] },
  { code: 'UCSP', name: 'Understanding Culture, Society and Politics', type: 'CORE', when: [[11, 1]] },
  { code: 'PEH1', name: 'Physical Education and Health 1', type: 'CORE', when: [[11, 1]] },
  { code: 'READWRITE', name: 'Reading and Writing Skills', type: 'CORE', when: [[11, 2]] },
  {
    code: 'PAGBASA',
    name: "Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik",
    type: 'CORE',
    when: [[11, 2]],
  },
  { code: 'STATPROB', name: 'Statistics and Probability', type: 'CORE', when: [[11, 2]] },
  { code: 'PHYSCI', name: 'Physical Science', type: 'CORE', when: [[11, 2]] },
  { code: 'PERDEV', name: 'Personal Development', type: 'CORE', when: [[11, 2]] },
  { code: 'PEH2', name: 'Physical Education and Health 2', type: 'CORE', when: [[11, 2]] },
  { code: 'LIT21', name: '21st Century Literature from the Philippines and the World', type: 'CORE', when: [[12, 1]] },
  { code: 'CPAR', name: 'Contemporary Philippine Arts from the Regions', type: 'CORE', when: [[12, 1]] },
  { code: 'MIL', name: 'Media and Information Literacy', type: 'CORE', when: [[12, 1]] },
  { code: 'PEH3', name: 'Physical Education and Health 3', type: 'CORE', when: [[12, 1]] },
  { code: 'PHILO', name: 'Introduction to the Philosophy of the Human Person', type: 'CORE', when: [[12, 2]] },
  { code: 'PEH4', name: 'Physical Education and Health 4', type: 'CORE', when: [[12, 2]] },

  // ---- applied (every strand)
  { code: 'EAPP', name: 'English for Academic and Professional Purposes', type: 'APPLIED', when: [[11, 1]] },
  { code: 'EMPTECH', name: 'Empowerment Technologies', type: 'APPLIED', when: [[11, 2]] },
  { code: 'RESEARCH1', name: 'Practical Research 1', type: 'APPLIED', when: [[11, 2]] },
  { code: 'RESEARCH2', name: 'Practical Research 2', type: 'APPLIED', when: [[12, 1]] },
  { code: 'ENTREP', name: 'Entrepreneurship', type: 'APPLIED', when: [[12, 1]] },
  { code: 'FILPILING', name: 'Filipino sa Piling Larang', type: 'APPLIED', when: [[12, 2]] },
  {
    code: 'WORKIMM',
    name: 'Work Immersion',
    type: 'APPLIED',
    isImmersion: true,
    when: [[12, 2]],
  },

  // ---- STEM
  { code: 'PRECAL', name: 'Pre-Calculus', type: 'SPECIALIZED', when: [[11, 1]], strands: ['STEM'] },
  { code: 'GENBIO1', name: 'General Biology 1', type: 'SPECIALIZED', when: [[11, 1]], strands: ['STEM'] },
  { code: 'BASCAL', name: 'Basic Calculus', type: 'SPECIALIZED', when: [[11, 2]], strands: ['STEM'] },
  { code: 'GENBIO2', name: 'General Biology 2', type: 'SPECIALIZED', when: [[11, 2]], strands: ['STEM'] },
  { code: 'GENPHYS1', name: 'General Physics 1', type: 'SPECIALIZED', when: [[12, 1]], strands: ['STEM'] },
  { code: 'GENCHEM1', name: 'General Chemistry 1', type: 'SPECIALIZED', when: [[12, 1]], strands: ['STEM'] },
  { code: 'GENPHYS2', name: 'General Physics 2', type: 'SPECIALIZED', when: [[12, 2]], strands: ['STEM'] },
  { code: 'GENCHEM2', name: 'General Chemistry 2', type: 'SPECIALIZED', when: [[12, 2]], strands: ['STEM'] },

  // ---- ABM
  { code: 'BUSMATH', name: 'Business Math', type: 'SPECIALIZED', when: [[11, 1]], strands: ['ABM'] },
  {
    code: 'FABM1',
    name: 'Fundamentals of Accountancy, Business and Management 1',
    type: 'SPECIALIZED',
    when: [[11, 1]],
    strands: ['ABM'],
  },
  { code: 'ORGMAN', name: 'Organization and Management', type: 'SPECIALIZED', when: [[11, 2]], strands: ['ABM'] },
  {
    code: 'FABM2',
    name: 'Fundamentals of Accountancy, Business and Management 2',
    type: 'SPECIALIZED',
    when: [[11, 2]],
    strands: ['ABM'],
  },
  { code: 'BUSFIN', name: 'Business Finance', type: 'SPECIALIZED', when: [[12, 1]], strands: ['ABM'] },
  { code: 'APPECON', name: 'Applied Economics', type: 'SPECIALIZED', when: [[12, 1]], strands: ['ABM', 'GAS'] },
  {
    code: 'BUSETHICS',
    name: 'Business Ethics and Social Responsibility',
    type: 'SPECIALIZED',
    when: [[12, 2]],
    strands: ['ABM'],
  },
  {
    code: 'BES',
    name: 'Business Enterprise Simulation',
    type: 'SPECIALIZED',
    isImmersion: true,
    when: [[12, 2]],
    strands: ['ABM'],
  },

  // ---- HUMSS
  {
    code: 'WORLDREL',
    name: 'Introduction to World Religions and Belief Systems',
    type: 'SPECIALIZED',
    when: [[11, 1]],
    strands: ['HUMSS'],
  },
  { code: 'CREATIVEWRIT', name: 'Creative Writing', type: 'SPECIALIZED', when: [[11, 1]], strands: ['HUMSS'] },
  {
    code: 'DISS',
    name: 'Disciplines and Ideas in the Social Sciences',
    type: 'SPECIALIZED',
    when: [[11, 2]],
    strands: ['HUMSS'],
  },
  { code: 'POLGOV', name: 'Philippine Politics and Governance', type: 'SPECIALIZED', when: [[11, 2]], strands: ['HUMSS'] },
  {
    code: 'DIASS',
    name: 'Disciplines and Ideas in the Applied Social Sciences',
    type: 'SPECIALIZED',
    when: [[12, 1]],
    strands: ['HUMSS'],
  },
  { code: 'CREATIVENF', name: 'Creative Nonfiction', type: 'SPECIALIZED', when: [[12, 1]], strands: ['HUMSS'] },
  {
    code: 'CESC',
    name: 'Community Engagement, Solidarity and Citizenship',
    type: 'SPECIALIZED',
    when: [[12, 2]],
    strands: ['HUMSS'],
  },
  {
    code: 'TRENDS',
    name: 'Trends, Networks, and Critical Thinking in the 21st Century Culture',
    type: 'SPECIALIZED',
    when: [[12, 2]],
    strands: ['HUMSS'],
  },

  // ---- GAS
  { code: 'HUMANITIES1', name: 'Humanities 1', type: 'SPECIALIZED', when: [[11, 1]], strands: ['GAS'] },
  { code: 'SOCSCI1', name: 'Social Sciences 1', type: 'SPECIALIZED', when: [[11, 2]], strands: ['GAS'] },
  { code: 'HUMANITIES2', name: 'Humanities 2', type: 'SPECIALIZED', when: [[12, 1]], strands: ['GAS'] },
  {
    code: 'DRRR',
    name: 'Disaster Readiness and Risk Reduction',
    type: 'SPECIALIZED',
    when: [[12, 2]],
    strands: ['GAS'],
  },

  // ---- TVL sample (rename to the specializations BNHS offers)
  { code: 'ICT1', name: 'Computer Systems Servicing 1', type: 'SPECIALIZED', when: [[11, 1]], strands: ['TVL-ICT'] },
  { code: 'ICT2', name: 'Computer Systems Servicing 2', type: 'SPECIALIZED', when: [[11, 2]], strands: ['TVL-ICT'] },
  { code: 'ICT3', name: 'Computer Systems Servicing 3', type: 'SPECIALIZED', when: [[12, 1]], strands: ['TVL-ICT'] },
  { code: 'ICT4', name: 'Computer Systems Servicing 4', type: 'SPECIALIZED', when: [[12, 2]], strands: ['TVL-ICT'] },
  { code: 'HE1', name: 'Cookery 1', type: 'SPECIALIZED', when: [[11, 1]], strands: ['TVL-HE'] },
  { code: 'HE2', name: 'Cookery 2', type: 'SPECIALIZED', when: [[11, 2]], strands: ['TVL-HE'] },
  { code: 'HE3', name: 'Cookery 3', type: 'SPECIALIZED', when: [[12, 1]], strands: ['TVL-HE'] },
  { code: 'HE4', name: 'Cookery 4', type: 'SPECIALIZED', when: [[12, 2]], strands: ['TVL-HE'] },
];

export interface BaseSeedOptions {
  schoolName?: string;
  /** Load the sample strands, subjects and curriculum. */
  sampleCurriculum?: boolean;
}

/**
 * Idempotent: safe to run on an existing database. Written with a few bulk statements rather than a
 * loop of upserts, because on a hosted database every statement costs a network round trip.
 */
export async function seedBaseData(db: Db, opts: BaseSeedOptions = {}): Promise<void> {
  await db.school.upsert({
    where: { id: 1 },
    update: opts.schoolName ? { name: opts.schoolName } : {},
    create: { id: 1, name: opts.schoolName || DEFAULT_SCHOOL.schoolName, principalTitle: DEFAULT_SCHOOL.principalTitle },
  });

  const haveProfiles = new Set((await db.weightProfile.findMany({ select: { code: true } })).map((p) => p.code));
  const newProfiles = DEFAULT_WEIGHT_PROFILES.filter((w) => !haveProfiles.has(w.code)).map((w) => ({ code: w.code, name: w.name, ww: w.ww, pt: w.pt, qa: w.qa }));
  if (newProfiles.length) await db.weightProfile.createMany({ data: newProfiles });

  if (!opts.sampleCurriculum) return;

  const haveStrands = new Set((await db.strand.findMany({ select: { code: true } })).map((x) => x.code));
  const newStrands = STRAND_SEEDS.filter((x) => !haveStrands.has(x.code));
  if (newStrands.length) await db.strand.createMany({ data: newStrands });
  const strandByCode = new Map((await db.strand.findMany()).map((x) => [x.code, x.id]));

  const haveSubjects = new Set((await db.subject.findMany({ select: { code: true } })).map((x) => x.code));
  const newSubjects = SUBJECT_SEEDS.filter((x) => !haveSubjects.has(x.code)).map((x) => ({ code: x.code, name: x.name, type: x.type, isImmersion: x.isImmersion ?? false }));
  if (newSubjects.length) await db.subject.createMany({ data: newSubjects });
  const subjectByCode = new Map((await db.subject.findMany()).map((x) => [x.code, x.id]));

  const slot = (strandId: number | null, gradeLevel: number, semester: number, subjectId: number) => `${strandId ?? 'all'}|${gradeLevel}|${semester}|${subjectId}`;
  const haveSlots = new Set((await db.curriculumSubject.findMany()).map((c) => slot(c.strandId, c.gradeLevel, c.semester, c.subjectId)));
  const rows: Array<{ strandId: number | null; gradeLevel: number; semester: number; subjectId: number; sortOrder: number }> = [];
  SUBJECT_SEEDS.forEach((seed, index) => {
    const subjectId = subjectByCode.get(seed.code)!;
    // Subjects every strand takes (core and applied) are stored once with strandId = null.
    const targets: Array<number | null> = seed.strands ? seed.strands.map((c) => strandByCode.get(c)!) : [null];
    for (const [gradeLevel, semester] of seed.when) {
      for (const strandId of targets) {
        if (haveSlots.has(slot(strandId, gradeLevel, semester, subjectId))) continue;
        haveSlots.add(slot(strandId, gradeLevel, semester, subjectId));
        rows.push({ strandId, gradeLevel, semester, subjectId, sortOrder: index + 1 });
      }
    }
  });
  if (rows.length) await db.curriculumSubject.createMany({ data: rows });
}

/** Creates the four grading periods of a school year (all closed) unless they already exist. */
export async function createPeriods(db: Db, schoolYearId: number): Promise<void> {
  const have = new Set((await db.gradingPeriod.findMany({ where: { schoolYearId }, select: { quarter: true } })).map((p) => p.quarter));
  const missing = [1, 2, 3, 4].filter((q) => !have.has(q)).map((quarter) => ({ schoolYearId, quarter, status: 'CLOSED', released: false }));
  if (missing.length) await db.gradingPeriod.createMany({ data: missing });
}
