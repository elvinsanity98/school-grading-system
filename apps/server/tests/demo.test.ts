import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../src/demo/seed';
import { client, login, makeTestEnv, type Client, type TestEnv } from './helpers';

/** The public demo: made-up data, one-click sign-in, risky actions off, automatic reset. */
describe('demo mode', () => {
  let env: TestEnv;
  let admin: Client;
  let registrar: Client;
  const ids = {} as { newton: number; rizal: number; adamSmith: number };

  beforeAll(async () => {
    env = await makeTestEnv({ demo: { resetEveryHours: 6, minManualGapMs: 60_000 } });
    admin = client(env.app, await login(env.app, 'admin', DEMO_PASSWORD));
    registrar = client(env.app, await login(env.app, 'registrar', DEMO_PASSWORD));
    const sections = (await admin.get('/api/sections')).json as Array<{ id: number; name: string }>;
    ids.newton = sections.find((s) => s.name === 'Newton')!.id;
    ids.rizal = sections.find((s) => s.name === 'Rizal')!.id;
    ids.adamSmith = sections.find((s) => s.name === 'Adam Smith')!.id;
  });
  afterAll(async () => {
    await env.close();
  });

  it('the login page can offer every account, and there is no first-run screen', async () => {
    const status = (await client(env.app).get('/api/setup/status')).json;
    expect(status.needsSetup).toBe(false);
    expect(status.demo).toMatchObject({ enabled: true, password: DEMO_PASSWORD, resetEveryHours: 6 });
    expect(status.demo.accounts.map((a: { username: string }) => a.username)).toEqual(DEMO_ACCOUNTS.map((a) => a.username));
    expect(new Date(status.demo.nextResetAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('every one-click account signs in with the shared password and sees the right things', async () => {
    const roles: Record<string, string> = { admin: 'ADMIN', registrar: 'REGISTRAR', teacher1: 'TEACHER', teacher2: 'TEACHER', '900000000001': 'STUDENT', 'p1-900000000001': 'PARENT' };
    for (const a of DEMO_ACCOUNTS) {
      const c = client(env.app, await login(env.app, a.username, DEMO_PASSWORD));
      const s = (await c.get('/api/session')).json;
      expect(s.user.role, a.username).toBe(roles[a.username]);
      expect(s.user.mustChangePassword, a.username).toBe(false);
    }
    // the adviser really advises Newton; the learner and the parent are the same child
    const t1 = client(env.app, await login(env.app, 'teacher1', DEMO_PASSWORD));
    expect((await t1.get('/api/session')).json.advisory.map((s: { name: string }) => s.name)).toEqual(['Newton']);
    const learner = client(env.app, await login(env.app, '900000000001', DEMO_PASSWORD));
    const parent = client(env.app, await login(env.app, 'p1-900000000001', DEMO_PASSWORD));
    expect((await learner.get('/api/me/learner')).json.lrn).toBe((await parent.get('/api/me/learner')).json.lrn);
  });

  it('11-Newton is a finished semester: complete report cards, honors, a remedial class', async () => {
    const summary = (await registrar.get(`/api/sections/${ids.newton}/summary?semester=1&visibility=approved`)).json;
    expect(summary.learners).toHaveLength(16);
    expect(summary.learners.every((l: { complete: boolean }) => l.complete)).toBe(true);
    expect(summary.learners.some((l: { honors: string | null }) => l.honors)).toBe(true);
    const remedial = (await registrar.get(`/api/sections/${ids.newton}/remedial?semester=1`)).json;
    expect(remedial.items.some((r: { mark: number | null }) => r.mark === 80)).toBe(true);

    // the learner portal shows the released semester, with a general average
    const learner = client(env.app, await login(env.app, '900000000001', DEMO_PASSWORD));
    const me = (await learner.get('/api/me/learner')).json;
    const card = (await learner.get(`/api/me/enrollments/${me.enrollments[0].id}/card?semester=1`)).json;
    expect(card.generalAverage).toBeGreaterThanOrEqual(90);
    expect(card.honors).toBeTruthy(); // the demo learner is a strong student
    expect(card.hasHidden).toBe(false);
    expect(card.attendance.some((m: { present: number | null }) => m.present != null)).toBe(true);
  });

  it('other sections show work in progress: an approvals queue and a class still being encoded', async () => {
    const queue = (await registrar.get('/api/approvals?quarter=2')).json as Array<{ status: string; section: string }>;
    expect(queue.filter((r) => r.status === 'SUBMITTED' && r.section.includes('Adam Smith')).length).toBeGreaterThan(5);

    const classes = (await registrar.get(`/api/classes?sectionId=${ids.rizal}&semester=1`)).json as Array<{ id: number }>;
    const rec = (await registrar.get(`/api/classes/${classes[0]!.id}/record?quarter=2`)).json;
    expect(rec.canEdit).toBe(true); // quarter 2 is open
    expect(rec.learners[0].missing).toBeGreaterThan(0); // only the written work is in
    expect(rec.workflow.status).toBe('DRAFT');

    // the transferee from another school has a previous-school record that prints on the SF10
    const curie = (await registrar.get('/api/learners?pageSize=200')).json.items.filter((l: { latest: { section: string } | null }) => l.latest?.section === 'Curie') as Array<{ id: number }>;
    expect(curie).toHaveLength(12);
    const records = await Promise.all(curie.map(async (l) => (await registrar.get(`/api/learners/${l.id}`)).json.externalRecords as unknown[]));
    expect(records.filter((r) => r.length > 0)).toHaveLength(1);
  });

  it('actions that would lock out the next visitor are turned off', async () => {
    const blocked = [
      await admin.post('/api/auth/change-password', { currentPassword: DEMO_PASSWORD, newPassword: 'Another#2026' }),
      await admin.post('/api/users', { username: 'someone', fullName: 'Some One', role: 'TEACHER' }),
      await admin.put('/api/users/1', { fullName: 'X', role: 'ADMIN', email: null, employeeNo: null, active: false }),
      await admin.post('/api/users/1/reset-password'),
      await admin.get('/api/admin/backup'),
    ];
    for (const r of blocked) {
      expect(r.status).toBe(403);
      expect(r.json.code).toBe('DEMO_DISABLED');
    }
    // the password still works, so nobody was locked out
    expect((await client(env.app).post('/api/auth/login', { username: 'admin', password: DEMO_PASSWORD })).status).toBe(200);
    // everything else works, for example editing a learner
    const first = (await registrar.get('/api/learners?q=&pageSize=1')).json.items[0];
    expect((await registrar.put(`/api/learners/${first.id}`, { ...first, address: 'Edited in the demo' })).status).toBe(200);
  });

  it('resetting restores the original data; asking again too soon is refused', async () => {
    const before = (await registrar.get('/api/learners?pageSize=1')).json.total;
    await registrar.post('/api/learners', { lrn: '999999999999', lastName: 'Visitor', firstName: 'Test', sex: 'M', birthDate: '2009-01-01' });
    expect((await registrar.get('/api/learners?pageSize=1')).json.total).toBe(before + 1);

    // a visitor pressing the button right after startup is told to wait
    const early = await client(env.app).post('/api/demo/reset');
    expect(early.status).toBe(429);
    expect(early.json.code).toBe('TOO_SOON');
    expect((await registrar.get('/api/learners?pageSize=1')).json.total).toBe(before + 1);

    // the scheduled reset is not rate limited
    expect(await env.app.demo!.reset(false)).toBe(true);
    // old sign-ins stop working (the accounts were recreated) and the visitor's data is gone
    expect((await registrar.get('/api/session')).status).toBe(401);
    const fresh = client(env.app, await login(env.app, 'registrar', DEMO_PASSWORD));
    expect((await fresh.get('/api/learners?pageSize=1')).json.total).toBe(before);
    expect((await fresh.get('/api/learners?q=Visitor')).json.total).toBe(0);
    const newton = (await fresh.get('/api/sections')).json.find((s: { name: string }) => s.name === 'Newton');
    expect((await fresh.get(`/api/sections/${newton.id}/summary?semester=1&visibility=approved`)).json.learners).toHaveLength(16);
  });
});
