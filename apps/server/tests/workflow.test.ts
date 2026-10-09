import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, login, makeTestEnv, usingPostgres, type Client, type TestEnv } from './helpers';

/**
 * End-to-end run of a school year through the HTTP API:
 * setup -> people -> section -> class record -> approval -> report card -> learner portal.
 */
describe('grading workflow', () => {
  let env: TestEnv;
  let admin: Client;
  let registrar: Client;
  let teacher: Client;
  let teacher2: Client;
  let ids: {
    yearId: number;
    strandId: number;
    sectionId: number;
    mathClassId: number;
    adviserId: number;
    learner: number[];
    enrollment: number[];
  };

  beforeAll(async () => {
    env = await makeTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  it('first run: setup creates the school, the administrator and the sample curriculum', async () => {
    const anon = client(env.app);
    expect((await anon.get('/api/setup/status')).json.needsSetup).toBe(true);

    const bad = await anon.post('/api/setup', { schoolName: 'Balakan National High School', adminName: 'Admin', username: 'ad', password: 'short' });
    expect(bad.status).toBe(400);

    const ok = await anon.post('/api/setup', {
      schoolName: 'Balakan National High School',
      adminName: 'System Administrator',
      username: 'admin',
      password: 'Admin#2026',
      sampleCurriculum: true,
      schoolYear: { name: '2026-2027', startDate: '2026-06-08', endDate: '2027-03-31' },
    });
    expect(ok.status).toBe(201);
    admin = client(env.app, ok.json.token);

    expect((await anon.get('/api/setup/status')).json.needsSetup).toBe(false);
    expect((await anon.post('/api/setup', { schoolName: 'X', adminName: 'Y', username: 'other', password: 'Another#123' })).status).toBe(409);

    const session = (await admin.get('/api/session')).json;
    expect(session.school.name).toBe('Balakan National High School');
    expect(session.years).toHaveLength(1);
    expect(session.years[0].periods).toHaveLength(3);
    ids = { yearId: session.currentYearId } as never;
  });

  it('authentication rules', async () => {
    const anon = client(env.app);
    expect((await anon.post('/api/auth/login', { username: 'admin', password: 'wrong-password' })).status).toBe(401);
    expect((await anon.post('/api/auth/login', { username: 'nobody', password: 'wrong-password' })).status).toBe(401);
    expect((await anon.get('/api/session')).status).toBe(401);
    expect((await client(env.app, 'garbage.token.here').get('/api/session')).status).toBe(401);
    expect((await anon.get('/api/learners')).status).toBe(401);
  });

  it('admin creates staff; a new account must change its password first', async () => {
    const reg = await admin.post('/api/users', { username: 'registrar1', fullName: 'Rita Registrar', role: 'REGISTRAR' });
    expect(reg.status).toBe(201);
    const t1 = await admin.post('/api/users', { username: 'teacher1', fullName: 'Tomas Teacher', role: 'TEACHER' });
    const t2 = await admin.post('/api/users', { username: 'teacher2', fullName: 'Tessa Teacher', role: 'TEACHER' });
    expect((await admin.post('/api/users', { username: 'teacher1', fullName: 'Dup', role: 'TEACHER' })).status).toBe(409);
    ids.adviserId = t1.json.user.id;

    // temp password only works to change the password
    const first = await login(env.app, 'teacher1', t1.json.tempPassword);
    const blocked = await client(env.app, first).get('/api/classes');
    expect(blocked.status).toBe(403);
    expect((await client(env.app, first).post('/api/auth/change-password', { currentPassword: t1.json.tempPassword, newPassword: 'short' })).status).toBe(400);
    const changed = await client(env.app, first).post('/api/auth/change-password', { currentPassword: t1.json.tempPassword, newPassword: 'Teacher1#pass' });
    expect(changed.status).toBe(200);
    // the old token stopped working, the new one works
    expect((await client(env.app, first).get('/api/session')).status).toBe(401);
    teacher = client(env.app, changed.json.token);
    expect((await teacher.get('/api/classes')).status).toBe(200);

    const t2Token = await login(env.app, 'teacher2', t2.json.tempPassword);
    const t2Changed = await client(env.app, t2Token).post('/api/auth/change-password', { currentPassword: t2.json.tempPassword, newPassword: 'Teacher2#pass' });
    teacher2 = client(env.app, t2Changed.json.token);

    const regToken = await login(env.app, 'registrar1', reg.json.tempPassword);
    const regChanged = await client(env.app, regToken).post('/api/auth/change-password', { currentPassword: reg.json.tempPassword, newPassword: 'Registrar#pass1' });
    registrar = client(env.app, regChanged.json.token);
  });

  it('builds a section from the curriculum and assigns the class adviser', async () => {
    const strands = (await admin.get('/api/strands')).json as Array<{ id: number; code: string }>;
    ids.strandId = strands.find((s) => s.code === 'STEM')!.id;

    // a teacher may not create sections
    expect((await teacher.post('/api/sections', { schoolYearId: ids.yearId, gradeLevel: 11, strandId: ids.strandId, name: 'Einstein' })).status).toBe(403);

    const sec = await registrar.post('/api/sections', { schoolYearId: ids.yearId, gradeLevel: 11, strandId: ids.strandId, name: 'Einstein', adviserId: ids.adviserId });
    expect(sec.status).toBe(201);
    ids.sectionId = sec.json.id;
    // the sample curriculum spreads about 19 subjects over the three terms
    expect(sec.json.classesCreated).toBeGreaterThan(15);
    expect((await registrar.post('/api/sections', { schoolYearId: ids.yearId, gradeLevel: 11, strandId: ids.strandId, name: 'Einstein' })).status).toBe(409);

    const classes = (await registrar.get(`/api/classes?sectionId=${ids.sectionId}&term=1`)).json as Array<{ id: number; subject: { code: string } }>;
    const math = classes.find((c) => c.subject.code === 'GENMATH')!;
    ids.mathClassId = math.id;
    expect((await registrar.put(`/api/classes/${math.id}`, { teacherId: ids.adviserId })).status).toBe(200);
    // teacher now sees exactly one class
    expect(((await teacher.get('/api/classes')).json as unknown[]).length).toBe(1);
    expect(((await teacher2.get('/api/classes')).json as unknown[]).length).toBe(0);
  });

  it('registrar imports learners: good rows in, bad rows reported', async () => {
    const res = await registrar.post('/api/learners/import', {
      sectionId: ids.sectionId,
      rows: [
        { lrn: '100000000001', lastName: 'DELA CRUZ', firstName: 'juan', middleName: 'Santos', sex: 'Male', birthDate: '2009-03-25' },
        { lrn: '100000000002', lastName: 'Reyes', firstName: 'Ana', sex: 'F', birthDate: '04/15/2009' },
        { lrn: '100000000003', lastName: 'Bautista', firstName: 'Mark', sex: 'M', birthDate: '2008-12-01' },
        { lrn: '12345', lastName: 'Short', firstName: 'Lrn', sex: 'M', birthDate: '2009-01-01' },
        { lrn: '100000000004', lastName: 'Bad', firstName: 'Sex', sex: 'X', birthDate: '2009-01-01' },
        { lrn: '100000000005', lastName: 'Bad', firstName: 'Date', sex: 'F', birthDate: '2009-02-31' },
        { lrn: '100000000001', lastName: 'Dupe', firstName: 'Row', sex: 'M', birthDate: '2009-01-01' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.json.created).toBe(3);
    expect(res.json.skipped.map((s: { row: number }) => s.row)).toEqual([4, 5, 6, 7]);

    const list = (await registrar.get(`/api/enrollments?schoolYearId=${ids.yearId}&sectionId=${ids.sectionId}`)).json as Array<{ id: number; learner: { id: number; lastName: string; firstName: string } }>;
    expect(list).toHaveLength(3);
    // males first, alphabetical: Bautista, Dela Cruz; then Reyes
    expect(list.map((e) => e.learner.lastName)).toEqual(['Bautista', 'Dela Cruz', 'Reyes']);
    expect(list.find((e) => e.learner.lastName === 'Dela Cruz')!.learner.firstName).toBe('Juan');
    ids.enrollment = list.map((e) => e.id);
    ids.learner = list.map((e) => e.learner.id);

    // duplicate LRN by hand
    const dup = await registrar.post('/api/learners', { lrn: '100000000001', lastName: 'X', firstName: 'Y', sex: 'M', birthDate: '2009-01-01' });
    expect(dup.status).toBe(409);
  });

  it('teachers cannot touch other teachers classes; closed terms block encoding', async () => {
    expect((await teacher2.get(`/api/classes/${ids.mathClassId}/record`)).status).toBe(403);

    const rec = await teacher.get(`/api/classes/${ids.mathClassId}/record`);
    expect(rec.status).toBe(200);
    expect(rec.json.class.term).toBe(1);
    expect(rec.json.canEdit).toBe(false);
    expect(rec.json.lockedReason).toMatch(/closed/i);
    expect(rec.json.class.weights).toEqual({ ww: 25, pt: 50, qa: 25 });
    const add = await teacher.post(`/api/classes/${ids.mathClassId}/items`, { component: 'WW', title: 'Quiz 1', hps: 20 });
    expect(add.status).toBe(423);

    // a class of term 2 stays locked while only term 1 is open: every term has its own class record
    const termTwo = (await registrar.get(`/api/classes?sectionId=${ids.sectionId}&term=2`)).json as Array<{ id: number; term: number }>;
    expect(termTwo.length).toBeGreaterThan(4);
    expect(termTwo.every((c) => c.term === 2)).toBe(true);
    expect((await registrar.put(`/api/classes/${termTwo[0]!.id}`, { teacherId: ids.adviserId })).status).toBe(200);

    const periods = (await admin.get('/api/school-years')).json[0].periods as Array<{ id: number; term: number }>;
    expect(periods.map((p) => p.term)).toEqual([1, 2, 3]);
    expect((await registrar.put(`/api/periods/${periods[0]!.id}`, { status: 'OPEN' })).status).toBe(200);

    const later = await teacher.get(`/api/classes/${termTwo[0]!.id}/record`);
    expect(later.json.class.term).toBe(2);
    expect(later.json.canEdit).toBe(false);
    expect(later.json.lockedReason).toMatch(/Term 2 is closed/);
    expect((await teacher.get(`/api/classes/${ids.mathClassId}/record`)).json.canEdit).toBe(true);
  });

  it('class record: DepEd computation, validation, and the submit / approve / reopen cycle', async () => {
    const c = ids.mathClassId;
    const [bautista, delaCruz, reyes] = ids.enrollment as [number, number, number];

    const ww = (await teacher.post(`/api/classes/${c}/items`, { component: 'WW', title: 'Quiz 1', hps: 50 })).json.id;
    const pt = (await teacher.post(`/api/classes/${c}/items`, { component: 'PT', title: 'Project', hps: 100 })).json.id;
    const qa = (await teacher.post(`/api/classes/${c}/items`, { component: 'QA', title: 'Exam', hps: 60 })).json.id;
    expect((await teacher.post(`/api/classes/${c}/items`, { component: 'WW', title: '', hps: 10 })).status).toBe(400);
    expect((await teacher.post(`/api/classes/${c}/items`, { component: 'WW', title: 'Bad', hps: 0 })).status).toBe(400);

    // cannot submit with blank scores
    const early = await teacher.post(`/api/classes/${c}/submit`, {});
    expect(early.status).toBe(409);
    expect(early.json.error).toMatch(/blank/i);

    // score higher than HPS rejected
    expect((await teacher.put(`/api/classes/${c}/scores`, { entries: [{ itemId: ww, enrollmentId: bautista, score: 51 }] })).status).toBe(400);
    // an item from another class or a stranger's enrollment is rejected
    expect((await teacher.put(`/api/classes/${c}/scores`, { entries: [{ itemId: 999999, enrollmentId: bautista, score: 1 }] })).status).toBe(400);

    // worked example from DO 8: 40/50, 90/100, 45/60 => WS 20 + 45 + 18.75 = 83.75 => 89
    const save = await teacher.put(`/api/classes/${c}/scores`, {
      entries: [
        { itemId: ww, enrollmentId: bautista, score: 40 },
        { itemId: pt, enrollmentId: bautista, score: 90 },
        { itemId: qa, enrollmentId: bautista, score: 45 },
        // Dela Cruz: perfect
        { itemId: ww, enrollmentId: delaCruz, score: 50 },
        { itemId: pt, enrollmentId: delaCruz, score: 100 },
        { itemId: qa, enrollmentId: delaCruz, score: 60 },
        // Reyes: struggling; the exam is excused (absent with valid reason)
        { itemId: ww, enrollmentId: reyes, score: 20 },
        { itemId: pt, enrollmentId: reyes, score: 50 },
        { itemId: qa, enrollmentId: reyes, score: null, excused: true },
      ],
    });
    expect(save.status).toBe(200);

    let rec = (await teacher.get(`/api/classes/${c}/record`)).json;
    const by = (id: number) => rec.learners.find((l: { enrollmentId: number }) => l.enrollmentId === id);
    expect(by(bautista).initialGrade).toBe(83.75);
    expect(by(bautista).termGrade).toBe(89);
    expect(by(delaCruz).termGrade).toBe(100);
    // Reyes with the QA excused: QA has no counted items so the grade is incomplete
    expect(by(reyes).termGrade).toBeNull();
    expect(rec.canEdit).toBe(true);

    // give Reyes a real exam score instead: 30/60 => WW 40% -> 10, PT 50% -> 25, QA 50% -> 12.5 = 47.5 => 71
    await teacher.put(`/api/classes/${c}/scores`, { entries: [{ itemId: qa, enrollmentId: reyes, score: 30, excused: false }] });
    rec = (await teacher.get(`/api/classes/${c}/record`)).json;
    expect(by(reyes).initialGrade).toBe(47.5);
    expect(by(reyes).termGrade).toBe(71);

    // lowering HPS below an existing score is refused
    expect((await teacher.put(`/api/items/${ww}`, { title: 'Quiz 1', hps: 30 })).status).toBe(409);

    // submit -> locked
    expect((await teacher.post(`/api/classes/${c}/submit`, {})).status).toBe(200);
    expect((await teacher.put(`/api/classes/${c}/scores`, { entries: [{ itemId: ww, enrollmentId: bautista, score: 41 }] })).status).toBe(423);
    // teachers cannot approve
    expect((await teacher.post(`/api/classes/${c}/approve`, {})).status).toBe(403);

    // registrar sends it back with a note, teacher fixes and resubmits
    expect((await registrar.post(`/api/classes/${c}/return`, { note: 'Check Reyes exam score' })).status).toBe(200);
    expect((await teacher.get(`/api/classes/${c}/record`)).json.workflow.note).toBe('Check Reyes exam score');
    expect((await teacher.put(`/api/classes/${c}/scores`, { entries: [{ itemId: qa, enrollmentId: reyes, score: 36 }] })).status).toBe(200);
    expect((await teacher.post(`/api/classes/${c}/submit`, {})).status).toBe(200);
    expect((await registrar.post(`/api/classes/${c}/approve`, {})).status).toBe(200);
    // approving twice is an error
    expect((await registrar.post(`/api/classes/${c}/approve`, {})).status).toBe(409);

    // locked for the teacher; a reopen request is the way out
    expect((await teacher.put(`/api/items/${ww}`, { title: 'Quiz 1 (renamed)', hps: 50 })).status).toBe(423);
    const rr = await teacher.post(`/api/classes/${c}/reopen-request`, { reason: 'Quiz 1 was scored wrong for one learner' });
    expect(rr.status).toBe(201);
    expect((await teacher.post(`/api/classes/${c}/reopen-request`, { reason: 'Second try at the same' })).status).toBe(409);
    expect(((await registrar.get('/api/reopen-requests?status=PENDING')).json as unknown[]).length).toBe(1);
    expect((await teacher.post(`/api/reopen-requests/${rr.json.id}/decide`, { approve: true })).status).toBe(403);
    expect((await registrar.post(`/api/reopen-requests/${rr.json.id}/decide`, { approve: true })).status).toBe(200);
    expect((await teacher.get(`/api/classes/${c}/record`)).json.canEdit).toBe(true);

    // resubmit and approve again for the rest of the test
    expect((await teacher.post(`/api/classes/${c}/submit`, {})).status).toBe(200);
    expect((await registrar.post(`/api/classes/${c}/approve`, {})).status).toBe(200);
  });

  it('copying the items of an earlier class record saves retyping them', async () => {
    const termTwo = (await registrar.get(`/api/classes?sectionId=${ids.sectionId}&term=2`)).json as Array<{ id: number }>;
    const target = termTwo[0]!.id;
    // term 2 is still closed for encoding
    expect((await teacher.post(`/api/classes/${target}/copy-items`, { fromClassId: ids.mathClassId })).status).toBe(423);

    const periods = (await admin.get('/api/school-years')).json[0].periods as Array<{ id: number; term: number }>;
    expect((await registrar.put(`/api/periods/${periods[1]!.id}`, { status: 'OPEN' })).status).toBe(200);
    const sources = (await teacher.get(`/api/classes/${target}/copy-sources`)).json as Array<{ id: number }>;
    expect(sources.map((s) => s.id)).toContain(ids.mathClassId);
    const copied = await teacher.post(`/api/classes/${target}/copy-items`, { fromClassId: ids.mathClassId });
    expect(copied.status).toBe(200);
    expect(copied.json.copied).toBe(3);
    const rec = (await teacher.get(`/api/classes/${target}/record`)).json;
    expect(rec.items.map((i: { title: string }) => i.title).sort()).toEqual(['Exam', 'Project', 'Quiz 1']);
    // the scores are not copied
    expect(rec.learners.every((l: { missing: number }) => l.missing === 3)).toBe(true);
    await registrar.put(`/api/periods/${periods[1]!.id}`, { status: 'CLOSED' });
  });

  it('complete a whole term for the section: report card, general average, honors', async () => {
    const classes = (await registrar.get(`/api/classes?sectionId=${ids.sectionId}&term=1`)).json as Array<{ id: number; subject: { code: string } }>;
    expect(classes.length).toBeGreaterThanOrEqual(6);
    const [bautista, delaCruz, reyes] = ids.enrollment as [number, number, number];

    for (const cls of classes) {
      // every class is taught by the adviser here to keep the test short
      await registrar.put(`/api/classes/${cls.id}`, { teacherId: ids.adviserId });
      if (cls.id === ids.mathClassId) continue; // done above
      const ww = (await teacher.post(`/api/classes/${cls.id}/items`, { component: 'WW', title: 'WW', hps: 100 })).json.id;
      const pt = (await teacher.post(`/api/classes/${cls.id}/items`, { component: 'PT', title: 'PT', hps: 100 })).json.id;
      const qa = (await teacher.post(`/api/classes/${cls.id}/items`, { component: 'QA', title: 'QA', hps: 100 })).json.id;
      const entries: Array<{ itemId: number; enrollmentId: number; score: number }> = [];
      // Bautista 88, Dela Cruz 99, Reyes 70
      for (const [enr, s] of [[bautista, 88], [delaCruz, 99], [reyes, 70]] as const) {
        for (const item of [ww, pt, qa]) entries.push({ itemId: item, enrollmentId: enr, score: s });
      }
      expect((await teacher.put(`/api/classes/${cls.id}/scores`, { entries })).status).toBe(200);
      expect((await teacher.post(`/api/classes/${cls.id}/submit`, {})).status).toBe(200);
    }
    // approve everything that was submitted in bulk
    const ready = (await registrar.get('/api/approvals?term=1')).json as Array<{ classId: number; status: string }>;
    const submitted = ready.filter((r) => r.status === 'SUBMITTED').map((r) => r.classId);
    expect(submitted).toHaveLength(classes.length - 1);
    const bulk = await registrar.post('/api/approvals/bulk', { classIds: submitted });
    expect(bulk.json.approved).toBe(submitted.length);

    const summary = (await registrar.get(`/api/sections/${ids.sectionId}/summary?term=1&visibility=approved`)).json;
    expect(summary.term).toBe(1);
    expect(summary.subjects.length).toBe(classes.length);
    const row = (id: number) => summary.learners.find((l: { enrollmentId: number }) => l.enrollmentId === id);

    // 88 raw -> transmuted 92 ; 99 -> 99 ; 70 -> 81 (69.6..71.19 = 81); the math class was scored above
    const mathId = summary.subjects.find((s: { classId: number }) => s.classId === ids.mathClassId).subjectId;
    expect(row(delaCruz).grades[mathId].grade).toBe(100);
    expect(row(bautista).grades[mathId].grade).toBe(89);
    expect(row(reyes).grades[mathId].grade).toBe(72);
    const other = summary.subjects.find((s: { classId: number }) => s.classId !== ids.mathClassId).subjectId;
    expect(row(delaCruz).grades[other].grade).toBe(99);
    expect(row(bautista).grades[other].grade).toBe(92);
    expect(row(reyes).grades[other].grade).toBe(81);

    expect(row(delaCruz).generalAverage).toBeGreaterThanOrEqual(98);
    expect(row(delaCruz).honors).toBe('WITH_HIGHEST_HONORS');
    expect(row(bautista).honors).toBe('WITH_HONORS');
    expect(row(reyes).honors).toBeNull();
    expect(row(reyes).remark).toBe('PASSED'); // the general average is above 75 ...
    expect(row(reyes).failed).toBe(1); // ... even with one subject (math) below it

    // adviser can print; another teacher cannot
    const pdf = await teacher.get(`/api/reports/sf9?enrollmentId=${delaCruz}&term=1`);
    expect(pdf.status).toBe(200);
    expect(String(pdf.headers['content-type'])).toContain('application/pdf');
    expect(pdf.raw.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.raw.length).toBeGreaterThan(3000);
    expect((await teacher2.get(`/api/reports/sf9?enrollmentId=${delaCruz}&term=1`)).status).toBe(403);
    const whole = await teacher.get(`/api/reports/sf9-section?sectionId=${ids.sectionId}&term=1`);
    expect(whole.status).toBe(200);
    expect(whole.raw.subarray(0, 5).toString()).toBe('%PDF-');

    const sf10 = await registrar.get(`/api/reports/sf10?learnerId=${ids.learner[1]}`);
    expect(sf10.status).toBe(200);
    expect(sf10.raw.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await teacher.get(`/api/reports/sf10?learnerId=${ids.learner[1]}`)).status).toBe(403);

    const xlsx = await teacher.get(`/api/reports/class-record?classId=${ids.mathClassId}`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.raw.subarray(0, 2).toString()).toBe('PK'); // zip container
    const sum = await teacher.get(`/api/reports/section-summary?sectionId=${ids.sectionId}&term=1`);
    expect(sum.raw.subarray(0, 2).toString()).toBe('PK');
    const master = await registrar.get(`/api/reports/masterlist?sectionId=${ids.sectionId}`);
    expect(master.raw.subarray(0, 2).toString()).toBe('PK');

    const honors = (await registrar.get('/api/reports/honors?term=1')).json;
    expect(honors.rows.map((r: { lastName: string }) => r.lastName)).toEqual(['Dela Cruz', 'Bautista']);
  });

  it('learner portal: nothing until the term is released, then only their own card', async () => {
    const acct = await registrar.post(`/api/learners/${ids.learner[1]}/account`);
    expect(acct.status).toBe(201);
    expect(acct.json.username).toBe('100000000001');
    expect((await registrar.post(`/api/learners/${ids.learner[1]}/account`)).status).toBe(409);

    const first = await login(env.app, acct.json.username, acct.json.tempPassword);
    const ch = await client(env.app, first).post('/api/auth/change-password', { currentPassword: acct.json.tempPassword, newPassword: 'Learner#2026' });
    const learner = client(env.app, ch.json.token);

    // staff-only endpoints are closed
    expect((await learner.get('/api/learners')).status).toBe(403);
    expect((await learner.get(`/api/classes/${ids.mathClassId}/record`)).status).toBe(403);
    expect((await learner.get(`/api/reports/sf10?learnerId=${ids.learner[1]}`)).status).toBe(403);

    const me = (await learner.get('/api/me/learner')).json;
    expect(me.lrn).toBe('100000000001');
    const enrollmentId = me.enrollments[0].id as number;

    let card = (await learner.get(`/api/me/enrollments/${enrollmentId}/card?term=1`)).json;
    expect(card.term).toBe(1);
    expect(card.subjects.every((s: { grade: number | null }) => s.grade === null)).toBe(true);
    expect(card.hasHidden).toBe(true);
    expect(card.generalAverage).toBeNull();

    const periods = (await admin.get('/api/school-years')).json[0].periods as Array<{ id: number; term: number }>;
    await admin.put(`/api/periods/${periods[0]!.id}`, { released: true });
    card = (await learner.get(`/api/me/enrollments/${enrollmentId}/card?term=1`)).json;
    expect(card.generalAverage).toBeGreaterThanOrEqual(98);
    expect(card.honors).toBe('WITH_HIGHEST_HONORS');
    expect((await learner.get(`/api/reports/sf9?enrollmentId=${enrollmentId}&term=1`)).status).toBe(200);
    // term 2 has not been released
    const t2 = (await learner.get(`/api/me/enrollments/${enrollmentId}/card?term=2`)).json;
    expect(t2.generalAverage).toBeNull();

    // somebody else's enrollment does not exist as far as this learner is concerned
    expect((await learner.get(`/api/me/enrollments/${ids.enrollment[0]}/card?term=1`)).status).toBe(404);
    expect((await learner.get(`/api/reports/sf9?enrollmentId=${ids.enrollment[0]}&term=1`)).status).toBe(404);
  });

  it('audit trail records who did what; only admins can read it', async () => {
    const log = (await admin.get('/api/audit?limit=500')).json as Array<{ action: string; username: string | null }>;
    const actions = new Set(log.map((l) => l.action));
    for (const a of ['SETUP', 'LOGIN', 'LOGIN_FAILED', 'USER_CREATED', 'SECTION_CREATED', 'SCORES_SAVED', 'RECORD_SUBMITTED', 'RECORD_APPROVED', 'RECORD_RETURNED', 'REOPEN_REQUESTED', 'REOPEN_APPROVED', 'SF9_PRINTED']) {
      expect(actions, a).toContain(a);
    }
    expect(log.find((l) => l.action === 'RECORD_APPROVED')!.username).toBe('registrar1');
    expect((await registrar.get('/api/audit')).status).toBe(403);
    expect((await teacher.get('/api/audit')).status).toBe(403);
  });

  it('dashboard and at-risk views', async () => {
    const d = (await admin.get('/api/dashboard?term=1')).json;
    expect(d.kind).toBe('office');
    expect(d.term).toBe(1);
    expect(d.counts.enrolled).toBe(3);
    expect(d.progress).toHaveLength(3);
    expect(d.progress[0].approved).toBeGreaterThan(0);
    expect(d.progress[2].approved).toBe(0);
    const td = (await teacher.get('/api/dashboard')).json;
    expect(td.kind).toBe('teacher');
    expect(td.classes.length).toBeGreaterThan(5);
    // Reyes scored 72 in General Mathematics in term 1 and nowhere else under 75
    const risk = (await teacher.get(`/api/at-risk?sectionId=${ids.sectionId}&term=1`)).json;
    expect(risk.passing).toBe(75);
    expect(risk.learners).toHaveLength(1);
    expect(risk.learners[0].learner.lastName).toBe('Reyes');
    expect(risk.learners[0].subjects).toEqual([{ subject: 'General Mathematics', grade: 72 }]);
    // a teacher of another section sees nothing
    expect((await teacher2.get(`/api/at-risk?sectionId=${ids.sectionId}&term=1`)).json.learners).toEqual([]);
  });

  it('admin backup: a SQLite file, or a pointer to Supabase backups on PostgreSQL', async () => {
    const res = await admin.get('/api/admin/backup');
    if (usingPostgres) {
      expect(res.status).toBe(501);
      expect(res.json.error).toMatch(/Supabase/);
      expect((await admin.get('/api/admin/system')).json).toMatchObject({ database: 'postgres', canDownloadBackup: false });
    } else {
      expect(res.status).toBe(200);
      expect(res.raw.subarray(0, 15).toString()).toBe('SQLite format 3');
      expect((await admin.get('/api/admin/system')).json).toMatchObject({ database: 'sqlite', canDownloadBackup: true });
    }
    expect((await registrar.get('/api/admin/backup')).status).toBe(403);
  });
});
