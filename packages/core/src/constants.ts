export const ROLES = ['ADMIN', 'REGISTRAR', 'TEACHER', 'STUDENT', 'PARENT'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrator',
  REGISTRAR: 'Registrar',
  TEACHER: 'Teacher',
  STUDENT: 'Learner',
  PARENT: 'Parent / Guardian',
};

export const GRADE_LEVELS = [11, 12] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

/** A school year has three terms. Each term is one grading period: one grade per subject per term. */
export const TERMS = [1, 2, 3] as const;
export type Term = (typeof TERMS)[number];

export const TERM_LABEL: Record<Term, string> = { 1: 'Term 1', 2: 'Term 2', 3: 'Term 3' };

export const TRACKS = ['ACADEMIC', 'TVL', 'SPORTS', 'ARTS_DESIGN'] as const;
export type Track = (typeof TRACKS)[number];

export const TRACK_LABEL: Record<Track, string> = {
  ACADEMIC: 'Academic',
  TVL: 'Technical-Vocational-Livelihood (TVL)',
  SPORTS: 'Sports',
  ARTS_DESIGN: 'Arts and Design',
};

export const SUBJECT_TYPES = ['CORE', 'APPLIED', 'SPECIALIZED'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const SUBJECT_TYPE_LABEL: Record<SubjectType, string> = {
  CORE: 'Core',
  APPLIED: 'Applied',
  SPECIALIZED: 'Specialized',
};

export const ENROLLMENT_STATUSES = ['ENROLLED', 'LATE_ENROLLEE', 'TRANSFERRED_OUT', 'DROPPED_OUT'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const LEARNER_STATUSES = ['ACTIVE', 'TRANSFERRED_OUT', 'DROPPED_OUT', 'GRADUATED'] as const;
export type LearnerStatus = (typeof LEARNER_STATUSES)[number];

/** Class record workflow for one term. */
export const RECORD_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const RECORD_STATUS_LABEL: Record<RecordStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted for approval',
  APPROVED: 'Approved (locked)',
  RETURNED: 'Returned to teacher',
};

/** Learner Observed Values markings (SF9). */
export const VALUE_MARKINGS = ['AO', 'SO', 'RO', 'NO'] as const;
export type ValueMarking = (typeof VALUE_MARKINGS)[number];

export const VALUE_MARKING_LABEL: Record<ValueMarking, string> = {
  AO: 'Always Observed',
  SO: 'Sometimes Observed',
  RO: 'Rarely Observed',
  NO: 'Not Observed',
};

export interface CoreValueStatement {
  key: string;
  coreValue: string;
  statement: string;
}

/** Core values and behavior statements printed on the SF9 report card. */
export const OBSERVED_VALUES: readonly CoreValueStatement[] = [
  {
    key: 'MD1',
    coreValue: 'Maka-Diyos',
    statement: "Expresses one's spiritual beliefs while respecting the spiritual beliefs of others",
  },
  { key: 'MD2', coreValue: 'Maka-Diyos', statement: 'Shows adherence to ethical principles by upholding truth' },
  {
    key: 'MT1',
    coreValue: 'Makatao',
    statement: 'Is sensitive to individual, social, and cultural differences',
  },
  { key: 'MT2', coreValue: 'Makatao', statement: 'Demonstrates contributions toward solidarity' },
  {
    key: 'MK1',
    coreValue: 'Makakalikasan',
    statement: 'Cares for the environment and utilizes resources wisely, judiciously, and economically',
  },
  { key: 'MB1', coreValue: 'Makabansa', statement: 'Demonstrates pride in being a Filipino; exercises the rights and responsibilities of a Filipino citizen' },
  {
    key: 'MB2',
    coreValue: 'Makabansa',
    statement: 'Demonstrates appropriate behavior in carrying out activities in the school, community, and country',
  },
] as const;

export const SCHOOL_MONTHS = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5] as const;
export const MONTH_NAME = [
  '',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const LRN_PATTERN = /^\d{12}$/;
export function isValidLrn(lrn: string): boolean {
  return LRN_PATTERN.test(lrn);
}

/** "DELA CRUZ, Juan Santos Jr." style used on DepEd forms. */
export function formatLearnerName(p: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
  extName?: string | null;
}): string {
  const rest = [p.firstName, p.middleName, p.extName].filter((s) => s && s.trim()).join(' ');
  return `${p.lastName.toUpperCase()}, ${rest}`;
}

/** Default weight profiles (DO 8 s. 2015, Senior High School). Editable by the administrator. */
export interface WeightProfileSeed {
  code: string;
  name: string;
  ww: number;
  pt: number;
  qa: number;
}

export const DEFAULT_WEIGHT_PROFILES: readonly WeightProfileSeed[] = [
  { code: 'CORE', name: 'Core subjects (all tracks)', ww: 25, pt: 50, qa: 25 },
  { code: 'ACAD_OTHER', name: 'Academic track: applied and specialized subjects', ww: 25, pt: 45, qa: 30 },
  {
    code: 'ACAD_IMMERSION',
    name: 'Academic track: Work Immersion, Research, Business Enterprise Simulation, Exhibit, Performance',
    ww: 35,
    pt: 40,
    qa: 25,
  },
  {
    code: 'TVL_OTHER',
    name: 'TVL, Sports, Arts and Design: applied and specialized subjects (incl. Work Immersion)',
    ww: 20,
    pt: 60,
    qa: 20,
  },
] as const;

export const DEFAULT_SCHOOL = {
  schoolName: 'Balakan National High School',
  schoolId: '',
  region: '',
  division: '',
  district: '',
  address: '',
  principalName: '',
  principalTitle: 'School Head',
  registrarName: '',
} as const;
