/**
 * npm run db:demo
 *
 * Fills the database with made-up learners, teachers and scores so every screen can be tried out.
 * Refuses to run in production or when the database already has users.
 * All names are invented and all LRNs start with 9000 (not valid DepEd LRNs).
 */
import { hashPassword } from '../auth';
import { isProd } from '../config';
import { createDb, tuneSqlite, type Db } from '../db';
import { createPeriods, seedBaseData } from '../seed-data';
import { generateClasses } from '../routes/sections';
import { recomputeClassQuarter } from '../services/grades';

if (isProd) {
  console.error('Refusing to load demo data in production.');
  process.exit(1);
}

const DEMO_PASSWORD = 'Demo#2026';

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
const rand = rng(20260930);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

const MALE = ['Juan', 'Jose', 'Mark', 'John Paul', 'Carlo', 'Miguel', 'Rey', 'Ramon', 'Paolo', 'Daniel', 'Christian', 'Joshua', 'Angelo', 'Kevin', 'Nathaniel', 'Emmanuel'];
const FEMALE = ['Maria', 'Ana', 'Grace', 'Kristine', 'Angela', 'Jasmine', 'Rose Ann', 'Mary Joy', 'Camille', 'Bianca', 'Trisha', 'Lovely', 'Sheila', 'Patricia', 'Jenny', 'Althea'];
const SURNAMES = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Flores', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Rivera', 'Domingo', 'Navarro', 'Soriano', 'Pascual', 'Salazar', 'Valdez', 'Lim', 'Tan', 'Dizon', 'Manalo'];
const MIDDLE = ['Dela Cruz', 'Santos', 'Reyes', 'Lopez', 'Perez', 'Gonzales', 'Rodriguez', 'Fernandez', 'Bautista', 'Alvarez'];

const TEACHERS = ['Elena Marquez', 'Roberto Alcantara', 'Josefina Padilla', 'Antonio Belmonte', 'Cecilia Dumalag', 'Ferdinand Gutierrez', 'Marites Lacson', 'Victor Sumaya'];

interface SectionPlan {
  grade: 11 | 12;
  strand: string;
  name: string;
  size: number;
  /** how far the first quarter got: 3 = approved, 2 = submitted, 1 = partly encoded, 0 = nothing */
  progress: 0 | 1 | 2 | 3;
}

const PLAN: SectionPlan[] = [
  { grade: 11, strand: 'STEM', name: 'Newton', size: 16, progress: 3 },
  { grade: 11, strand: 'ABM', name: 'Adam Smith', size: 14, progress: 2 },
  { grade: 11, strand: 'HUMSS', name: 'Rizal', size: 14, progress: 1 },
  { grade: 12, strand: 'STEM', name: 'Curie', size: 12, progress: 3 },
  { grade: 12, strand: 'TVL-ICT', name: 'Turing', size: 12, progress: 0 },
];

async function main(db: Db) {
  if ((await db.user.count()) > 0) {
    console.error('The database already has users. Demo data is only loaded into an empty database.');
    process.exit(1);
  }

  await seedBaseData(db, { schoolName: 'Balakan National High School', sampleCurriculum: true });
  await db.school.update({
    where: { id: 1 },
    data: { principalName: 'Demo School Head', registrarName: 'Demo Registrar', address: 'Sample address (edit in Setup > School profile)' },
  });

  const year = await db.schoolYear.create({
    data: { name: '2026-2027', startDate: new Date('2026-06-08T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), isCurrent: true },
  });
  await createPeriods(db, year.id);
  await db.gradingPeriod.updateMany({ where: { schoolYearId: year.id, quarter: 1 }, data: { status: 'OPEN' } });
  for (const [y, m, d] of [[2026, 6, 16], [2026, 7, 23], [2026, 8, 21], [2026, 9, 22], [2026, 10, 22], [2026, 11, 20]] as const) {
    await db.schoolDays.create({ data: { schoolYearId: year.id, year: y, month: m, days: d } });
  }

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
      if (!firstLearnerId) firstLearnerId = learner.id;
      const e = await db.enrollment.create({ data: { learnerId: learner.id, schoolYearId: year.id, sectionId: section.id } });
      enrollmentIds.push(e.id);
      // a few learners struggle, a few excel
      ability.push(Math.min(99, Math.max(48, Math.round(82 + (rand() - 0.5) * 30 + (i % 7 === 0 ? -14 : 0) + (i % 5 === 0 ? 8 : 0)))));
    }

    const classes = await db.classAssignment.findMany({ where: { sectionId: section.id, semester: 1 }, orderBy: { id: 'asc' } });
    for (const [ci, cls] of classes.entries()) {
      await db.classAssignment.update({ where: { id: cls.id }, data: { teacherId: teachers[(si + ci) % teachers.length]!.id } });
      if (plan.progress === 0) continue;

      const spec: Array<[string, string, number]> = [
        ['WW', 'Quiz 1', 20], ['WW', 'Quiz 2', 25], ['WW', 'Seatwork', 15],
        ['PT', 'Activity 1', 50], ['PT', 'Group project', 100],
        ['QA', 'Quarterly exam', 50],
      ];
      const items = [];
      for (const [k, [component, title, hps]] of spec.entries()) {
        items.push(await db.assessmentItem.create({ data: { classId: cls.id, quarter: 1, component, title, hps, sortOrder: k + 1 } }));
      }
      // partly encoded section: stop after the written work
      const encode = plan.progress === 1 ? items.filter((it) => it.component === 'WW') : items;
      const rows = [];
      for (const [li, enrollmentId] of enrollmentIds.entries()) {
        for (const it of encode) {
          const raw = ability[li]! + (rand() - 0.5) * 16;
          const score = Math.max(0, Math.min(it.hps, Math.round((raw / 100) * it.hps)));
          rows.push({ itemId: it.id, enrollmentId, score, excused: false });
        }
      }
      await db.score.createMany({ data: rows });
      await recomputeClassQuarter(db, cls.id, 1);
      if (plan.progress >= 2) {
        await db.classQuarter.create({
          data: { classId: cls.id, quarter: 1, status: plan.progress === 3 ? 'APPROVED' : 'SUBMITTED', submittedAt: new Date(), reviewedAt: plan.progress === 3 ? new Date() : null },
        });
      }
    }

    if (si === 0) {
      // attendance Jun-Oct for the first section, values for Q1
      for (const [y, m] of [[2026, 6], [2026, 7], [2026, 8], [2026, 9]] as const) {
        const days = (await db.schoolDays.findUnique({ where: { schoolYearId_year_month: { schoolYearId: year.id, year: y, month: m } } }))!.days;
        for (const id of enrollmentIds) {
          await db.attendance.create({ data: { enrollmentId: id, year: y, month: m, daysPresent: Math.max(0, days - Math.floor(rand() * 4)), timesTardy: Math.floor(rand() * 3) } });
        }
      }
      for (const id of enrollmentIds) {
        for (const key of ['MD1', 'MD2', 'MT1', 'MT2', 'MK1', 'MB1', 'MB2']) {
          await db.observedValue.create({ data: { enrollmentId: id, quarter: 1, valueKey: key, marking: pick(['AO', 'AO', 'AO', 'SO']) } });
        }
      }
    }
  }

  // one learner account and one released quarter, to try the learner portal
  const first = await db.learner.findUniqueOrThrow({ where: { id: firstLearnerId } });
  await db.user.create({
    data: { username: first.lrn, fullName: `${first.firstName} ${first.lastName}`, role: 'STUDENT', learnerId: first.id, passwordHash: hash, mustChangePassword: false },
  });
  await db.gradingPeriod.updateMany({ where: { schoolYearId: year.id, quarter: 1 }, data: { released: true } });

  console.log('\nDemo data loaded.\n');
  console.log(`  Sign in with password "${DEMO_PASSWORD}"`);
  console.log('    admin      (administrator)');
  console.log('    registrar  (registrar)');
  console.log('    teacher1   (adviser of 11-STEM Newton; teacher2 to teacher8 also exist)');
  console.log(`    ${first.lrn}  (a learner, Q1 released)`);
  console.log(`\n  ${await db.learner.count()} learners in ${PLAN.length} sections, Q1 encoded.\n`);
}

const db = createDb();
await tuneSqlite(db);
try {
  await main(db);
} finally {
  await db.$disconnect();
}
