import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, login, makeTestEnv, type Client, type TestEnv } from './helpers';

/** Rules that sit around the grade computation: weights per track, attendance, remedial, account safety. */
describe('school rules', () => {
  let env: TestEnv;
  let admin: Client;
  let registrar: Client;
  let adviser: Client;
  let other: Client;
  const ids = {} as {
    year: number;
    ict: number;
    stem: number;
    turing: number;
    curie: number;
    newton: number;
    adviserId: number;
    enrollment: number;
    learner: number;
  };

  async function staff(c: Client, username: string, fullName: string, role: string) {
    const r = await c.post('/api/users', { username, fullName, role });
    const t = await login(env.app, username, r.json.tempPassword);
    const ch = await client(env.app, t).post('/api/auth/change-password', { currentPassword: r.json.tempPassword, newPassword: `${fullName.split(' ')[0]}#pass2026` });
    return { id: r.json.user.id as number, api: client(env.app, ch.json.token), username };
  }

  beforeAll(async () => {
    env = await makeTestEnv();
    const setup = await client(env.app).post('/api/setup', {
      schoolName: 'Balakan National High School',
      adminName: 'Admin',
      username: 'admin',
      password: 'Admin#2026',
      schoolYear: { name: '2026-2027', startDate: '2026-06-08', endDate: '2027-03-31' },
    });
    admin = client(env.app, setup.json.token);
    ids.year = (await admin.get('/api/session')).json.currentYearId;
    const strands = (await admin.get('/api/strands')).json as Array<{ id: number; code: string }>;
    ids.ict = strands.find((s) => s.code === 'TVL-ICT')!.id;
    ids.stem = strands.find((s) => s.code === 'STEM')!.id;

    registrar = (await staff(admin, 'reg', 'Rita Registrar', 'REGISTRAR')).api;
    const adv = await staff(admin, 'adv', 'Adela Adviser', 'TEACHER');
    adviser = adv.api;
    ids.adviserId = adv.id;
    other = (await staff(admin, 'oth', 'Oscar Other', 'TEACHER')).api;

    ids.turing = (await registrar.post('/api/sections', { schoolYearId: ids.year, gradeLevel: 12, strandId: ids.ict, name: 'Turing', adviserId: adv.id })).json.id;
    ids.curie = (await registrar.post('/api/sections', { schoolYearId: ids.year, gradeLevel: 12, strandId: ids.stem, name: 'Curie', adviserId: null })).json.id;
    ids.newton = (await registrar.post('/api/sections', { schoolYearId: ids.year, gradeLevel: 12, strandId: ids.stem, name: 'Newton' })).json.id;

    const imp = await registrar.post('/api/learners/import', {
      sectionId: ids.turing,
      rows: [{ lrn: '200000000001', lastName: 'Lopez', firstName: 'Lita', sex: 'F', birthDate: '2008-05-05' }],
    });
    expect(imp.json.created).toBe(1);
    const e = (await registrar.get(`/api/enrollments?schoolYearId=${ids.year}&sectionId=${ids.turing}`)).json[0];
    ids.enrollment = e.id;
    ids.learner = e.learner.id;
  });
  afterAll(async () => {
    await env.close();
  });

  it('weights follow the subject type and the track of the strand (DO 8 s. 2015)', async () => {
    const weightsOf = async (sectionId: number, code: string, semester: number) => {
      const classes = (await registrar.get(`/api/classes?sectionId=${sectionId}&semester=${semester}`)).json as Array<{ id: number; subject: { code: string } }>;
      const c = classes.find((x) => x.subject.code === code)!;
      expect(c, `${code} in section ${sectionId}`).toBeTruthy();
      await registrar.put(`/api/classes/${c.id}`, { teacherId: ids.adviserId });
      return (await adviser.get(`/api/classes/${c.id}/record?quarter=${semester === 1 ? 1 : 3}`)).json.class.weights;
    };
    // core subject: same in every track
    expect(await weightsOf(ids.turing, 'PHILO', 2)).toEqual({ ww: 25, pt: 50, qa: 25 });
    expect(await weightsOf(ids.curie, 'PHILO', 2)).toEqual({ ww: 25, pt: 50, qa: 25 });
    // applied subject: academic 25/45/30, TVL 20/60/20
    expect(await weightsOf(ids.curie, 'RESEARCH2', 1)).toEqual({ ww: 25, pt: 45, qa: 30 });
    expect(await weightsOf(ids.turing, 'RESEARCH2', 1)).toEqual({ ww: 20, pt: 60, qa: 20 });
    // work immersion: academic 35/40/25, TVL 20/60/20
    expect(await weightsOf(ids.curie, 'WORKIMM', 2)).toEqual({ ww: 35, pt: 40, qa: 25 });
    expect(await weightsOf(ids.turing, 'WORKIMM', 2)).toEqual({ ww: 20, pt: 60, qa: 20 });
  });

  it('only administrators change weights, and they must add up to 100', async () => {
    const profiles = (await admin.get('/api/weight-profiles')).json as Array<{ id: number; code: string }>;
    const core = profiles.find((p) => p.code === 'CORE')!;
    expect((await admin.put(`/api/weight-profiles/${core.id}`, { ww: 30, pt: 50, qa: 25 })).status).toBe(400);
    expect((await registrar.put(`/api/weight-profiles/${core.id}`, { ww: 25, pt: 50, qa: 25 })).status).toBe(403);
    expect((await admin.put(`/api/weight-profiles/${core.id}`, { ww: 25, pt: 50, qa: 25 })).status).toBe(200);
  });

  it('attendance: needs school days, cannot exceed them, feeds the report card', async () => {
    const path = `/api/sections/${ids.turing}/attendance`;
    const enrollmentId = ids.enrollment;
    expect((await adviser.put(path, { month: 9, entries: [{ enrollmentId, daysPresent: 10 }] })).status).toBe(400); // school days unknown
    expect((await adviser.put(path, { month: 9, schoolDays: 20, entries: [{ enrollmentId, daysPresent: 21 }] })).status).toBe(400);
    expect((await adviser.put(path, { month: 9, schoolDays: 20, entries: [{ enrollmentId: 999999, daysPresent: 5 }] })).status).toBe(400);
    expect((await adviser.put(path, { month: 9, schoolDays: 20, entries: [{ enrollmentId, daysPresent: 18, timesTardy: 2 }] })).status).toBe(200);

    const got = (await adviser.get(`${path}?month=9`)).json;
    expect(got.year).toBe(2026);
    expect(got.schoolDays).toBe(20);
    expect(got.learners[0]).toMatchObject({ daysPresent: 18, timesTardy: 2 });
    // January belongs to the second calendar year of the school year
    expect((await adviser.get(`${path}?month=1`)).json.year).toBe(2027);

    const card = (await adviser.get(`/api/enrollments/${enrollmentId}/card?semester=1&visibility=all`)).json;
    const sep = card.attendance.find((m: { month: number }) => m.month === 9);
    expect(sep).toMatchObject({ schoolDays: 20, present: 18, absent: 2, tardy: 2 });

    // a teacher who is not the adviser is turned away
    expect((await other.get(`${path}?month=9`)).status).toBe(403);
    expect((await other.put(path, { month: 9, entries: [] })).status).toBe(403);
  });

  it('observed values: known statements only, saved per quarter', async () => {
    const path = `/api/sections/${ids.turing}/values`;
    const enrollmentId = ids.enrollment;
    expect((await adviser.put(path, { quarter: 1, entries: [{ enrollmentId, valueKey: 'ZZ9', marking: 'AO' }] })).status).toBe(400);
    expect((await adviser.put(path, { quarter: 1, entries: [{ enrollmentId, valueKey: 'MD1', marking: 'XX' }] })).status).toBe(400);
    expect((await adviser.put(path, { quarter: 1, entries: [{ enrollmentId, valueKey: 'MD1', marking: 'AO' }, { enrollmentId, valueKey: 'MB2', marking: 'SO' }] })).status).toBe(200);
    expect((await adviser.get(`${path}?quarter=1`)).json.learners[0].marks).toEqual({ MD1: 'AO', MB2: 'SO' });
    expect((await adviser.get(`${path}?quarter=2`)).json.learners[0].marks).toEqual({});
    // clearing a mark
    await adviser.put(path, { quarter: 1, entries: [{ enrollmentId, valueKey: 'MB2', marking: null }] });
    expect((await adviser.get(`${path}?quarter=1`)).json.learners[0].marks).toEqual({ MD1: 'AO' });
  });

  it('remedial classes: recomputed final grade is the average of final grade and remedial mark', async () => {
    // A failed subject: approved quarter grades 70 and 72 => final 71
    const classes = (await registrar.get(`/api/classes?sectionId=${ids.turing}&semester=1`)).json as Array<{ id: number; subject: { id: number; code: string } }>;
    const target = classes.find((c) => c.subject.code === 'MIL')!;
    for (const [quarter, grade] of [[1, 70], [2, 72]] as const) {
      await env.db.quarterlyGrade.create({
        data: { classId: target.id, enrollmentId: ids.enrollment, subjectId: target.subject.id, semester: 1, quarter, detail: '{}', initialGrade: grade, quarterlyGrade: grade },
      });
      await env.db.classQuarter.create({ data: { classId: target.id, quarter, status: 'APPROVED' } });
    }
    const list = (await adviser.get(`/api/sections/${ids.turing}/remedial?semester=1`)).json;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ subject: 'Media and Information Literacy', finalGrade: 71, mark: null });

    expect((await adviser.put(`/api/enrollments/${ids.enrollment}/remedial`, { subjectId: target.subject.id, semester: 1, mark: 101 })).status).toBe(400);
    expect((await adviser.put(`/api/enrollments/${ids.enrollment}/remedial`, { subjectId: target.subject.id, semester: 1, mark: 80, dateFrom: '2027-04-01', dateTo: '2027-04-30' })).status).toBe(200);

    const card = (await adviser.get(`/api/enrollments/${ids.enrollment}/card?semester=1&visibility=approved`)).json;
    const math = card.subjects.find((s: { code: string }) => s.code === 'MIL');
    expect(math.finalGrade).toBe(71);
    expect(math.remedial).toMatchObject({ mark: 80, recomputed: 76, passed: true });
    expect(math.remark).toBe('PASSED');

    // remedial mark that does not rescue the learner
    await adviser.put(`/api/enrollments/${ids.enrollment}/remedial`, { subjectId: target.subject.id, semester: 1, mark: 70 });
    const again = (await adviser.get(`/api/enrollments/${ids.enrollment}/card?semester=1&visibility=approved`)).json;
    expect(again.subjects.find((s: { code: string }) => s.code === 'MIL').remark).toBe('FAILED');
  });

  it('SF10 includes records from previous schools', async () => {
    const add = await registrar.post(`/api/learners/${ids.learner}/external-records`, {
      schoolName: 'Sample Integrated School',
      schoolYear: '2025-2026',
      semester: 2,
      gradeLevel: 11,
      strandName: 'TVL - ICT',
      sectionName: 'Bonifacio',
      generalAverage: 86,
      subjects: [
        { subject: 'Reading and Writing Skills', type: 'Core', q1: 85, q2: 87, final: 86, remarks: 'Passed' },
        { subject: 'Computer Systems Servicing 2', type: 'Specialized', q1: 84, q2: 88, final: 86, remarks: 'Passed' },
      ],
    });
    expect(add.status).toBe(201);
    expect((await registrar.post(`/api/learners/${ids.learner}/external-records`, { schoolName: 'X', schoolYear: '2025-2026', semester: 3, gradeLevel: 11, subjects: [] })).status).toBe(400);

    const detail = (await registrar.get(`/api/learners/${ids.learner}`)).json;
    expect(detail.externalRecords).toHaveLength(1);
    expect(detail.externalRecords[0].subjects).toHaveLength(2);
    const pdf = await registrar.get(`/api/reports/sf10?learnerId=${ids.learner}`);
    expect(pdf.status).toBe(200);
    expect(pdf.raw.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await registrar.del(`/api/external-records/${add.json.id}`)).status).toBe(200);
  });

  it('learners move only between sections of the same grade and strand', async () => {
    expect((await registrar.put(`/api/enrollments/${ids.enrollment}`, { sectionId: ids.curie })).status).toBe(409); // different strand
    const same = await registrar.post('/api/sections', { schoolYearId: ids.year, gradeLevel: 12, strandId: ids.ict, name: 'Babbage' });
    expect((await registrar.put(`/api/enrollments/${ids.enrollment}`, { sectionId: same.json.id })).status).toBe(200);
    expect((await registrar.put(`/api/enrollments/${ids.enrollment}`, { sectionId: ids.turing })).status).toBe(200);
    // a section that still has learners cannot be deleted
    expect((await registrar.del(`/api/sections/${ids.turing}`)).status).toBe(409);
    expect((await registrar.del(`/api/sections/${same.json.id}`)).status).toBe(200);
  });

  it('wrong passwords lock the account for a while, even with the right password', async () => {
    const anon = client(env.app);
    for (let i = 0; i < 10; i++) expect((await anon.post('/api/auth/login', { username: 'oth', password: 'not-the-password' })).status).toBe(401);
    const locked = await anon.post('/api/auth/login', { username: 'oth', password: 'Oscar#pass2026' });
    expect(locked.status).toBe(429);
    expect(locked.json.code).toBe('LOCKED_OUT');
    // other accounts are not affected
    expect((await anon.post('/api/auth/login', { username: 'adv', password: 'Adela#pass2026' })).status).toBe(200);
  });

  it('disabled accounts lose access immediately; admins cannot lock themselves out', async () => {
    const t = await staff(admin, 'temp', 'Temp Teacher', 'TEACHER');
    expect((await t.api.get('/api/session')).status).toBe(200);
    const me = (await admin.get('/api/session')).json.user;
    expect((await admin.put(`/api/users/${t.id}`, { fullName: 'Temp Teacher', role: 'TEACHER', email: null, employeeNo: null, active: false })).status).toBe(200);
    expect((await t.api.get('/api/session')).status).toBe(401);
    expect((await client(env.app).post('/api/auth/login', { username: 'temp', password: 'Temp#pass2026' })).status).toBe(401);

    expect((await admin.put(`/api/users/${me.id}`, { fullName: me.fullName, role: 'ADMIN', email: null, employeeNo: null, active: false })).status).toBe(403);
    expect((await admin.put(`/api/users/${me.id}`, { fullName: me.fullName, role: 'TEACHER', email: null, employeeNo: null, active: true })).status).toBe(403);
  });

  it('parent accounts see only their own child; registrars can reset learner and parent passwords', async () => {
    const mk = await registrar.post(`/api/learners/${ids.learner}/parent-account`, { fullName: 'Pilar Lopez' });
    expect(mk.status).toBe(201);
    expect(mk.json.username).toBe('p1-200000000001');
    expect((await adviser.post(`/api/learners/${ids.learner}/parent-account`, { fullName: 'Nope Nope' })).status).toBe(403);

    const first = await login(env.app, mk.json.username, mk.json.tempPassword);
    const changed = await client(env.app, first).post('/api/auth/change-password', { currentPassword: mk.json.tempPassword, newPassword: 'Parent#2026' });
    const parent = client(env.app, changed.json.token);

    const me = (await parent.get('/api/me/learner')).json;
    expect(me.lrn).toBe('200000000001');
    expect((await parent.get(`/api/me/enrollments/${me.enrollments[0].id}/card?semester=1`)).status).toBe(200);
    expect((await parent.get('/api/learners')).status).toBe(403);
    expect((await parent.get('/api/sections')).status).toBe(403);
    expect((await parent.get(`/api/sections/${ids.turing}`)).status).toBe(403);

    // a second child's parent cannot open the first child's card
    const imp = await registrar.post('/api/learners/import', { sectionId: ids.turing, rows: [{ lrn: '200000000002', lastName: 'Ramos', firstName: 'Rey', sex: 'M', birthDate: '2008-06-06' }] });
    expect(imp.json.created).toBe(1);
    const other = (await registrar.get(`/api/enrollments?schoolYearId=${ids.year}&sectionId=${ids.turing}`)).json.find((e: { learner: { lastName: string } }) => e.learner.lastName === 'Ramos');
    const mk2 = await registrar.post(`/api/learners/${other.learner.id}/parent-account`, { fullName: 'Rosa Ramos' });
    const t2 = await login(env.app, mk2.json.username, mk2.json.tempPassword);
    const c2 = await client(env.app, t2).post('/api/auth/change-password', { currentPassword: mk2.json.tempPassword, newPassword: 'Parent#2027' });
    expect((await client(env.app, c2.json.token).get(`/api/me/enrollments/${me.enrollments[0].id}/card?semester=1`)).status).toBe(404);
    expect((await client(env.app, c2.json.token).get(`/api/reports/sf9?enrollmentId=${me.enrollments[0].id}&semester=1`)).status).toBe(404);

    // reset: old session dies, new one-time password works, wrong learner is refused
    const detail = (await registrar.get(`/api/learners/${ids.learner}`)).json;
    const acct = detail.accounts.find((a: { role: string }) => a.role === 'PARENT');
    const reset = await registrar.post(`/api/learners/${ids.learner}/accounts/${acct.id}/reset-password`);
    expect(reset.status).toBe(200);
    expect((await parent.get('/api/me/learner')).status).toBe(401);
    expect((await login(env.app, reset.json.username, reset.json.tempPassword)).length).toBeGreaterThan(20);
    expect((await registrar.post(`/api/learners/${other.learner.id}/accounts/${acct.id}/reset-password`)).status).toBe(404);
    expect((await adviser.post(`/api/learners/${ids.learner}/accounts/${acct.id}/reset-password`)).status).toBe(403);
  });

  it('password reset signs the person out and forces a new password', async () => {
    const t = await staff(admin, 'reset', 'Reset Person', 'TEACHER');
    const reset = await admin.post(`/api/users/${t.id}/reset-password`);
    expect(reset.status).toBe(200);
    expect((await t.api.get('/api/session')).status).toBe(401);
    const tok = await login(env.app, 'reset', reset.json.tempPassword);
    expect((await client(env.app, tok).get('/api/classes')).status).toBe(403);
    expect((await client(env.app, tok).get('/api/session')).json.user.mustChangePassword).toBe(true);
  });
});
