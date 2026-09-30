import type { ComponentResult, HonorsLevel, Remark, Role, Weights } from '@bnhs/core';

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  email: string | null;
  employeeNo: string | null;
  active: boolean;
  mustChangePassword: boolean;
  learnerId: number | null;
  lastLoginAt: string | null;
}

export interface School {
  id: number;
  name: string;
  schoolId: string;
  region: string;
  division: string;
  district: string;
  address: string;
  principalName: string;
  principalTitle: string;
  registrarName: string;
  logo: string | null;
  passingGrade: number;
  honorsWith: number;
  honorsHigh: number;
  honorsHighest: number;
  honorsMinSubject: number;
}

export interface Period {
  id: number;
  quarter: number;
  status: 'OPEN' | 'CLOSED';
  released: boolean;
}

export interface SchoolYear {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  periods: Period[];
}

export interface SessionData {
  user: User;
  school: School;
  years: SchoolYear[];
  currentYearId: number | null;
  advisory: Array<{ id: number; name: string; gradeLevel: number; strandCode: string }>;
  teachingLoads: number;
  learner: { id: number; lrn: string; name: string } | null;
}

export interface Strand {
  id: number;
  code: string;
  name: string;
  track: string;
  active: boolean;
}

export interface WeightProfile {
  id: number;
  code: string;
  name: string;
  ww: number;
  pt: number;
  qa: number;
}

export interface Subject {
  id: number;
  code: string;
  name: string;
  type: string;
  isImmersion: boolean;
  weightProfileId: number | null;
  active: boolean;
  academicProfile?: string | null;
  tvlProfile?: string | null;
}

export interface CurriculumRow {
  id: number;
  strandId: number | null;
  gradeLevel: number;
  semester: number;
  subjectId: number;
  sortOrder: number;
  subject: Subject;
  strand: Strand | null;
}

export interface Teacher {
  id: number;
  fullName: string;
  employeeNo: string | null;
}

export interface SectionRow {
  id: number;
  schoolYearId: number;
  gradeLevel: number;
  name: string;
  room: string | null;
  strand: { id: number; code: string; name: string; track: string };
  adviser: { id: number; fullName: string } | null;
  enrolled: number;
  male: number;
  female: number;
  classes: number;
}

export interface LearnerBrief {
  id: number;
  lrn: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  extName: string | null;
  sex: string;
}

export interface Learner extends LearnerBrief {
  birthDate: string;
  birthPlace: string | null;
  address: string | null;
  religion: string | null;
  motherTongue: string | null;
  ipGroup: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianContact: string | null;
  previousSchool: string | null;
  status: string;
}

export interface LearnerListItem extends Learner {
  hasAccount: boolean;
  latest: { enrollmentId: number; schoolYear: string; gradeLevel: number; section: string; strand: string; status: string } | null;
}

export interface LearnerDetail extends Learner {
  enrollments: Array<{
    id: number;
    schoolYearId: number;
    schoolYear: string;
    status: string;
    remarks: string | null;
    section: { id: number; name: string; gradeLevel: number; strand: string; adviser: string | null };
  }>;
  externalRecords: Array<{
    id: number;
    schoolName: string;
    schoolId: string | null;
    schoolYear: string;
    semester: number;
    gradeLevel: number;
    strandName: string | null;
    sectionName: string | null;
    generalAverage: number | null;
    subjects: Array<{ subject: string; type: string; q1: number | null; q2: number | null; final: number | null; remarks: string }>;
  }>;
  accounts: Array<{ id: number; username: string; fullName: string; role: string; active: boolean }>;
}

export interface EnrollmentRow {
  id: number;
  status: string;
  remarks: string | null;
  dateEnrolled: string;
  section: { id: number; name: string; gradeLevel: number; strand: string };
  learner: LearnerBrief;
}

export interface ClassStatus {
  quarter: number;
  status: string;
}

export interface ClassRow {
  id: number;
  semester: number;
  subject: { id: number; code: string; name: string; type: string };
  section: { id: number; name: string; gradeLevel: number; strand: string; learners: number };
  teacher: { id: number; fullName: string } | null;
  statuses: ClassStatus[];
}

export interface RecordItem {
  id: number;
  component: 'WW' | 'PT' | 'QA';
  title: string;
  hps: number;
  dateGiven: string | null;
  sortOrder: number;
}

export interface RecordLearner extends LearnerBrief {
  enrollmentId: number;
  status: string;
  scores: Record<string, { score: number | null; excused: boolean }>;
  ww: ComponentResult;
  pt: ComponentResult;
  qa: ComponentResult;
  initialGrade: number | null;
  quarterlyGrade: number | null;
  missing: number;
  semesterView: { q1: number | null; q2: number | null; final: number | null };
}

export interface WorkflowState {
  quarter: number;
  status: string;
  note: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  periodStatus: string;
  released: boolean;
}

export interface RecordPayload {
  class: {
    id: number;
    semester: number;
    schoolYear: string;
    subject: { id: number; code: string; name: string; type: string };
    section: { id: number; name: string; gradeLevel: number; strand: string; track: string };
    teacher: { id: number; fullName: string } | null;
    weights: Weights;
  };
  quarter: number;
  workflow: WorkflowState;
  canEdit: boolean;
  lockedReason: string | null;
  items: RecordItem[];
  learners: RecordLearner[];
}

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

export interface Card {
  enrollmentId: number;
  learner: LearnerBrief & { birthDate: string; address: string | null };
  status: string;
  section: { id: number; name: string; gradeLevel: number; strandCode: string; strandName: string; track: string; adviser: string | null };
  schoolYear: { id: number; name: string };
  semester: number;
  quarters: [number, number];
  subjects: CardSubject[];
  generalAverage: number | null;
  complete: boolean;
  honors: HonorsLevel | null;
  attendance: Array<{ year: number; month: number; schoolDays: number | null; present: number | null; absent: number | null; tardy: number | null }>;
  values: Record<string, Record<number, string>>;
  hasHidden: boolean;
}

export interface SummaryPayload {
  section: { id: number; name: string; gradeLevel: number; strand: string; adviser: string | null; schoolYear: string };
  semester: number;
  quarters: [number, number];
  visibility: string;
  passing: number;
  subjects: Array<{ classId: number; subjectId: number; name: string; type: string; teacher: string | null; statuses: ClassStatus[] }>;
  learners: Array<{
    enrollmentId: number;
    status: string;
    learner: LearnerBrief;
    grades: Record<string, { q1: number | null; q2: number | null; final: number | null; remark: Remark; remedial: CardSubject['remedial'] }>;
    generalAverage: number | null;
    complete: boolean;
    honors: HonorsLevel | null;
    remark: Remark;
    failed: number;
  }>;
  hasHidden: boolean;
}

export interface ApprovalRow {
  classId: number;
  quarter: number;
  status: string;
  note: string | null;
  submittedAt: string | null;
  items: number;
  subject: string;
  section: string;
  strand: string;
  teacher: string | null;
}

export interface ReopenRow {
  id: number;
  classId: number;
  quarter: number;
  reason: string;
  status: string;
  createdAt: string;
  subject: string;
  section: string;
  teacher: string | null;
}

export type Dashboard =
  | { kind: 'family' }
  | { kind: 'office' | 'teacher'; year: null }
  | {
      kind: 'office';
      year: { id: number; name: string };
      quarter: number;
      semester: number;
      counts: { enrolled: number; sections: number; teachers: number; classes: number; unassignedClasses: number };
      enrollment: Array<{ gradeLevel: number; strand: string; count: number }>;
      progress: Array<{ quarter: number; total: number; submitted: number; approved: number; returned: number; draft: number; periodStatus: string; released: boolean }>;
      pendingApprovals: number;
      pendingReopen: number;
      distribution: Array<{ label: string; min: number; max: number; count: number }>;
      gradesRecorded: number;
      learnersWithFailingGrade: number;
    }
  | {
      kind: 'teacher';
      year: { id: number; name: string };
      quarter: number;
      classes: Array<{ id: number; semester: number; subject: string; section: string; strand: string; learners: number; statuses: ClassStatus[] }>;
      advisory: Array<{ id: number; name: string; gradeLevel: number; strand: string; learners: number }>;
      openQuarters: number[];
      pendingRequests: number;
    };

export interface AtRisk {
  quarter: number;
  passing: number;
  learners: Array<{ enrollmentId: number; learner: LearnerBrief; section: string; subjects: Array<{ subject: string; grade: number }> }>;
}

export interface AuditRow {
  id: number;
  at: string;
  username: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  detail: string | null;
  ip: string | null;
}

export interface AdminUserRow extends User {}
