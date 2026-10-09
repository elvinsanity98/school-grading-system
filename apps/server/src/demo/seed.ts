/**
 * Made-up data so every screen can be tried without real learners. Used by `npm run demo`, by the
 * hosted demo (DEMO_MODE) and by its scheduled reset.
 * All names are invented and all LRNs start with 9000 (not valid DepEd LRNs).
 */
import { hashPassword } from '../auth';
import type { Db } from '../db';
import { generateClasses } from '../routes/sections';
import { createPeriods, seedBaseData } from '../seed-data';
import { buildCards } from '../services/card';
import { recomputeClass } from '../services/grades';

export const DEMO_PASSWORD = 'Demo#2026';

export interface DemoAccount {
  label: string;
  username: string;
  /** one line shown under the button */
  hint: string;
}

/** Offered as one-click sign-ins on the demo's login page. */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { label: 'Administrator', username: 'admin', hint: 'Setup, users, curriculum, audit log' },
  { label: 'Registrar', username: 'registrar', hint: 'Learners, sections, approvals, SF10' },
  { label: 'Class adviser', username: 'teacher1', hint: 'Teaches 11-Newton, advises it, prints SF9' },
  { label: 'Subject teacher', username: 'teacher2', hint: 'Encodes scores, has a class record to finish' },
  { label: 'Learner', username: '900000000001', hint: 'Sees released grades and the report card' },
  { label: 'Parent', username: 'p1-900000000001', hint: 'Sees the same learner, nothing else' },
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MALE = ['Juan', 'Jose', 'Mark', 'John Paul', 'Carlo', 'Miguel', 'Rey', 'Ramon', 'Paolo', 'Daniel', 'Christian', 'Joshua', 'Angelo', 'Kevin', 'Nathaniel', 'Emmanuel'];
const FEMALE = ['Maria', 'Ana', 'Grace', 'Kristine', 'Angela', 'Jasmine', 'Rose Ann', 'Mary Joy', 'Camille', 'Bianca', 'Trisha', 'Lovely', 'Sheila', 'Patricia', 'Jenny', 'Althea'];
const SURNAMES = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Flores', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Rivera', 'Domingo', 'Navarro', 'Soriano', 'Pascual', 'Salazar', 'Valdez', 'Lim', 'Tan', 'Dizon', 'Manalo'];
const MIDDLE = ['Dela Cruz', 'Santos', 'Reyes', 'Lopez', 'Perez', 'Gonzales', 'Rodriguez', 'Fernandez', 'Bautista', 'Alvarez'];
const TEACHERS = ['Elena Marquez', 'Roberto Alcantara', 'Josefina Padilla', 'Antonio Belmonte', 'Cecilia Dumalag', 'Ferdinand Gutierrez', 'Marites Lacson', 'Victor Sumaya'];

/** How far a term got in a section. */
type Stage = 'approved' | 'submitted' | 'partial' | 'none';

interface SectionPlan {
  grade: 11 | 12;
  strand: string;
  name: string;
  size: number;
  t1: Stage;
  t2: Stage;
  t3: Stage;
}

const PLAN: SectionPlan[] = [
  { grade: 11, strand: 'STEM', name: 'Newton', size: 16, t1: 'approved', t2: 'approved', t3: 'none' }, // two finished terms: cards, honors, SF10
  { grade: 11, strand: 'ABM', name: 'Adam Smith', size: 14, t1: 'approved', t2: 'submitted', t3: 'none' }, // waiting in Approvals
  { grade: 11, strand: 'HUMSS', name: 'Rizal', size: 14, t1: 'approved', t2: 'partial', t3: 'none' }, // teachers still encoding
  { grade: 12, strand: 'STEM', name: 'Curie', size: 12, t1: 'approved', t2: 'approved', t3: 'none' },
  { grade: 12, strand: 'TVL-ICT', name: 'Turing', size: 12, t1: 'submitted', t2: 'none', t3: 'none' },
];

const ITEM_SPEC: Array<[string, string, number]> = [
  ['WW', 'Quiz 1', 20],
  ['WW', 'Quiz 2', 25],
  ['WW', 'Seatwork', 15],
  ['PT', 'Activity 1', 50],
  ['PT', 'Group project', 100],
  ['QA', 'Term exam', 50],
];

/** Removes everything, children before parents. Used by the demo reset. */
export async function wipeAllData(db: Db): Promise<void> {
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.remedial.deleteMany(),
    db.observedValue.deleteMany(),
    db.attendance.deleteMany(),
    db.termGrade.deleteMany(),
    db.score.deleteMany(),
    db.assessmentItem.deleteMany(),
    db.reopenRequest.deleteMany(),
    db.classWorkflow.deleteMany(),
    db.classAssignment.deleteMany(),
    db.externalRecord.deleteMany(),
    db.enrollment.deleteMany(),
    db.section.deleteMany(),
    db.user.deleteMany(),
    db.learner.deleteMany(),
    db.curriculumSubject.deleteMany(),
    db.subject.deleteMany(),
    db.strand.deleteMany(),
    db.weightProfile.deleteMany(),
    db.gradingPeriod.deleteMany(),
    db.schoolDays.deleteMany(),
    db.schoolYear.deleteMany(),
    db.school.deleteMany(),
  ]);
}

export interface DemoSummary {
  learners: number;
  sections: number;
}

/** Loads the demo into an EMPTY database. */
export async function seedDemo(db: Db): Promise<DemoSummary> {
  const rand = rng(20260930);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

  await seedBaseData(db, { schoolName: 'Balakan National High School', sampleCurriculum: true });
  await db.school.update({
    where: { id: 1 },
    data: { principalName: 'Demo School Head', registrarName: 'Demo Registrar', address: 'Sample address (edit in Setup, School profile)' },
  });

  const year = await db.schoolYear.create({
    data: { name: '2026-2027', startDate: new Date('2026-06-08T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), isCurrent: true },
  });
  await createPeriods(db, year.id);
  // term 1 is done and released; term 2 is still open for the teachers who are not finished; term 3 has not started
  await db.gradingPeriod.updateMany({ where: { schoolYearId: year.id, term: 1 }, data: { status: 'CLOSED', released: true } });
  await db.gradingPeriod.updateMany({ where: { schoolYearId: year.id, term: 2 }, data: { status: 'OPEN', released: true } });
  await db.schoolDays.createMany({
    data: ([[2026, 6, 16], [2026, 7, 23], [2026, 8, 21], [2026, 9, 22], [2026, 10, 22], [2026, 11, 20]] as const).map(([y, m, d]) => ({ schoolYearId: year.id, year: y, month: m, days: d })),
  });

  const hash = await hashPassword(DEMO_PASSWORD);
  const mk = (username: string, fullName: string, role: string, extra: object = {}) =>
    db.user.create({ data: { username, fullName, role, passwordHash: hash, mustChangePassword: false, ...extra } });
  await mk('admin', 'Demo Administrator', 'ADMIN');
  await mk('registrar', 'Demo Registrar', 'REGISTRAR');
  const teachers = [];
  for (const [i, name] of TEACHERS.entries()) teachers.push(await mk(`teacher${i + 1}`, name, 'TEACHER', { employeeNo: `T-${1000 + i}` }));

  const strands = new Map((await db.strand.findMany()).map((s) => [s.code, s]));
  let lrn = 900000000000;
  let firstLearnerId = 0;
  let curieFirstLearnerId = 0;
  let newtonEnrollmentIds: number[] = [];
  let learnerCount = 0;

  for (const [si, plan] of PLAN.entries()) {
    const section = await db.section.create({
      data: { schoolYearId: year.id, gradeLevel: plan.grade, strandId: strands.get(plan.strand)!.id, name: plan.name, adviserId: teachers[si]!.id, room: `Rm ${101 + si}` },
    });
    await generateClasses(db, section.id);

    const enrollmentIds: number[] = [];
    const ability: number[] = [];
    for (let i = 0; i < plan.size; i++) {
      const male = i % 2 === 0;
      lrn += 1;
      const learner = await db.learner.create({
        data: {
          lrn: String(lrn),
          lastName: pick(SURNAMES),
          firstName: pick(male ? MALE : FEMALE),
          middleName: pick(MIDDLE),
          sex: male ? 'M' : 'F',
          birthDate: new Date(Date.UTC(plan.grade === 11 ? 2010 : 2009, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27))),
          address: 'Sample barangay, Sample municipality',
          guardianName: `${pick(MIDDLE)} ${pick(SURNAMES)}`,
          guardianRelation: 'Parent',
          guardianContact: `09${String(100000000 + Math.floor(rand() * 899999999)).slice(0, 9)}`,
        },
      });
      learnerCount++;
      if (!firstLearnerId) firstLearnerId = learner.id;
      if (plan.name === 'Curie' && !curieFirstLearnerId) curieFirstLearnerId = learner.id;
      const e = await db.enrollment.create({ data: { learnerId: learner.id, schoolYearId: year.id, sectionId: section.id } });
      enrollmentIds.push(e.id);
      // most learners do well, a few struggle, a few excel
      ability.push(Math.min(99, Math.max(50, Math.round(80 + (rand() - 0.5) * 26 + (i % 7 === 0 ? -16 : 0) + (i % 5 === 0 ? 6 : 0) + (i % 6 === 1 ? 12 : 0)))));
    }
    if (plan.name === 'Newton') {
      newtonEnrollmentIds = enrollmentIds;
      ability[0] = 94; // the learner used for the learner and parent logins: a strong student with an honors award
    }

    const stageOf = (term: number): Stage => (term === 1 ? plan.t1 : term === 2 ? plan.t2 : plan.t3);
    const classes = await db.classAssignment.findMany({ where: { sectionId: section.id }, orderBy: [{ term: 'asc' }, { id: 'asc' }] });
    const indexInTerm = new Map<number, number>();
    for (const [ci, cls] of classes.entries()) {
      const k = indexInTerm.get(cls.term) ?? 0;
      indexInTerm.set(cls.term, k + 1);
      await db.classAssignment.update({ where: { id: cls.id }, data: { teacherId: teachers[(si + ci) % teachers.length]!.id } });

      const stage = stageOf(cls.term);
      if (stage === 'none') continue;
      const items = [];
      for (const [n, [component, title, hps]] of ITEM_SPEC.entries()) {
        items.push(await db.assessmentItem.create({ data: { classId: cls.id, component, title, hps, sortOrder: n + 1 } }));
      }
      // a term that is only partly encoded has the written work and nothing else
      const encode = stage === 'partial' ? items.filter((it) => it.component === 'WW') : items;
      const rows: Array<{ itemId: number; enrollmentId: number; score: number; excused: boolean }> = [];
      for (const [li, enrollmentId] of enrollmentIds.entries()) {
        for (const it of encode) {
          // one learner of 11-Newton does badly in one subject of term 1, so there is a failed subject to show
          const slump = plan.name === 'Newton' && cls.term === 1 && li === 3 && k === 2 ? 40 : 0;
          const raw = ability[li]! + (rand() - 0.5) * 16 + (cls.term - 1) * 1.2 - slump;
          rows.push({ itemId: it.id, enrollmentId, score: Math.max(0, Math.min(it.hps, Math.round((raw / 100) * it.hps))), excused: false });
        }
      }
      await db.score.createMany({ data: rows });
      await recomputeClass(db, cls.id);
      if (stage === 'approved' || stage === 'submitted') {
        await db.classWorkflow.create({
          data: { classId: cls.id, status: stage === 'approved' ? 'APPROVED' : 'SUBMITTED', submittedAt: new Date(), reviewedAt: stage === 'approved' ? new Date() : null },
        });
      }
    }

    if (plan.name === 'Newton' || plan.name === 'Curie') {
      const months = [[2026, 6], [2026, 7], [2026, 8], [2026, 9], [2026, 10], [2026, 11]] as const;
      const days = new Map((await db.schoolDays.findMany({ where: { schoolYearId: year.id } })).map((d) => [`${d.year}-${d.month}`, d.days]));
      await db.attendance.createMany({
        data: enrollmentIds.flatMap((enrollmentId) =>
          months.map(([y, m]) => ({ enrollmentId, year: y, month: m, daysPresent: Math.max(0, days.get(`${y}-${m}`)! - Math.floor(rand() * 4)), timesTardy: Math.floor(rand() * 3) })),
        ),
      });
      await db.observedValue.createMany({
        data: enrollmentIds.flatMap((enrollmentId) =>
          [1, 2].flatMap((term) => ['MD1', 'MD2', 'MT1', 'MT2', 'MK1', 'MB1', 'MB2'].map((valueKey) => ({ enrollmentId, term, valueKey, marking: pick(['AO', 'AO', 'AO', 'SO']) }))),
        ),
      });
    }
  }

  // a learner who failed a subject and took the remedial class
  const cards = await buildCards(db, newtonEnrollmentIds, 1, 'approved');
  for (const card of cards) {
    const failed = card.subjects.find((s) => s.grade != null && s.grade < 75);
    if (failed) {
      await db.remedial.create({
        data: { enrollmentId: card.enrollmentId, subjectId: failed.subjectId, term: 1, mark: 80, dateFrom: new Date('2026-10-26T00:00:00Z'), dateTo: new Date('2026-11-06T00:00:00Z') },
      });
      break;
    }
  }

  // a transferee: his earlier grades come from another school and print on the SF10
  if (curieFirstLearnerId) {
    await db.externalRecord.create({
      data: {
        learnerId: curieFirstLearnerId,
        schoolName: 'Sample Integrated School',
        schoolId: '000000',
        schoolYear: '2025-2026',
        period: '2nd Semester',
        gradeLevel: 11,
        strandName: 'Science, Technology, Engineering and Mathematics',
        sectionName: 'Galileo',
        generalAverage: 88,
        subjects: JSON.stringify([
          { subject: 'Reading and Writing Skills', type: 'Core', q1: 88, q2: 89, final: 89, remarks: 'Passed' },
          { subject: 'Statistics and Probability', type: 'Core', q1: 86, q2: 88, final: 87, remarks: 'Passed' },
          { subject: 'Basic Calculus', type: 'Specialized', q1: 90, q2: 88, final: 89, remarks: 'Passed' },
          { subject: 'General Biology 2', type: 'Specialized', q1: 87, q2: 87, final: 87, remarks: 'Passed' },
        ]),
      },
    });
  }

  // portal accounts for the first learner of 11-Newton
  const first = await db.learner.findUniqueOrThrow({ where: { id: firstLearnerId } });
  await db.user.create({
    data: { username: first.lrn, fullName: `${first.firstName} ${first.lastName}`, role: 'STUDENT', learnerId: first.id, passwordHash: hash, mustChangePassword: false },
  });
  await db.user.create({
    data: { username: `p1-${first.lrn}`, fullName: `Parent of ${first.firstName} ${first.lastName}`, role: 'PARENT', learnerId: first.id, passwordHash: hash, mustChangePassword: false },
  });

  return { learners: learnerCount, sections: PLAN.length };
}
