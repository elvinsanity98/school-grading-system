import type { Role } from '@bnhs/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { hashPassword, passwordProblem, signToken, verifyPassword } from '../auth';
import { AppError, badRequest, conflict, parse, unauthorized } from '../errors';
import { createPeriods, seedBaseData } from '../seed-data';
import { zDate } from '../util';
import { publicUser } from '../services/present';

// Compared against when the username does not exist, so a wrong username and a wrong
// password cost about the same time.
let dummyHash: Promise<string> | null = null;

/**
 * Failed sign-ins per username. Ten misses in fifteen minutes lock that username for the rest of
 * the window, however many addresses the guesses come from. A school shares one public IP, so a
 * per-IP limit alone would lock out everybody at once.
 */
const FAIL_WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 10;
const failures = new Map<string, number[]>();

function recentFailures(username: string): number[] {
  const now = Date.now();
  const list = (failures.get(username) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (list.length) failures.set(username, list);
  else failures.delete(username);
  return list;
}

const loginBody = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });

const setupBody = z.object({
  schoolName: z.string().trim().min(2).max(150),
  adminName: z.string().trim().min(2).max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, 'Username: 3 to 32 letters, numbers, dot, dash or underscore'),
  password: z.string().min(8).max(128),
  sampleCurriculum: z.boolean().default(true),
  schoolYear: z
    .object({ name: z.string().trim().min(4).max(20), startDate: zDate, endDate: zDate })
    .optional(),
});

export default async function publicRoutes(app: FastifyInstance, opts: { rateLimit: boolean }) {
  const db = app.db;

  app.get('/health', async () => ({ ok: true, name: 'BNHS SHS Grading System', version: '1.0.0' }));

  app.get('/setup/status', async () => {
    const users = await db.user.count();
    const school = await db.school.findUnique({ where: { id: 1 } });
    return { needsSetup: users === 0, schoolName: school?.name ?? 'Balakan National High School', demo: app.demo?.info() ?? null };
  });

  /** First run only: creates the school, the base data and the first administrator. */
  app.post('/setup', async (req, reply) => {
    if ((await db.user.count()) > 0) throw conflict('The system is already set up.');
    const body = parse(setupBody, req.body);
    const problem = passwordProblem(body.password);
    if (problem) throw badRequest(problem);

    await seedBaseData(db, { schoolName: body.schoolName, sampleCurriculum: body.sampleCurriculum });
    const admin = await db.user.create({
      data: {
        username: body.username,
        passwordHash: await hashPassword(body.password),
        role: 'ADMIN',
        fullName: body.adminName,
        mustChangePassword: false,
      },
    });
    if (body.schoolYear) {
      const sy = await db.schoolYear.create({ data: { ...body.schoolYear, isCurrent: true } });
      await createPeriods(db, sy.id);
    }
    req.user = null;
    await audit(db, null, 'SETUP', 'User', admin.id, { school: body.schoolName, sample: body.sampleCurriculum });
    reply.code(201);
    return { token: await signToken(admin), user: publicUser(admin) };
  });

  app.post(
    '/auth/login',
    {
      config: opts.rateLimit
        ? {
            rateLimit: {
              max: 12,
              timeWindow: '1 minute',
              keyGenerator: (req: { ip: string; body?: unknown }) => `${req.ip}:${String((req.body as { username?: unknown } | undefined)?.username ?? '').toLowerCase()}`,
            },
          }
        : {},
    },
    async (req) => {
      const { username, password } = parse(loginBody, req.body);
      const key = username.toLowerCase();
      if (recentFailures(key).length >= MAX_FAILS) {
        throw new AppError(429, 'Too many wrong passwords. Wait 15 minutes or ask the administrator to reset the password.', 'LOCKED_OUT');
      }
      const user = await db.user.findUnique({ where: { username: key } });
      dummyHash ??= hashPassword('not-a-real-password');
      const ok = user ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, await dummyHash), false);
      if (!user || !ok || !user.active) {
        // only real accounts are tracked, so random usernames cannot grow the table
        if (user) failures.set(key, [...recentFailures(key), Date.now()]);
        await audit(db, null, 'LOGIN_FAILED', 'User', undefined, { username, ip: req.ip });
        throw unauthorized('Wrong username or password.');
      }
      failures.delete(key);
      await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      req.user = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role as Role,
        learnerId: user.learnerId,
        mustChangePassword: user.mustChangePassword,
      };
      await audit(db, req, 'LOGIN', 'User', user.id);
      return { token: await signToken(user), user: publicUser(user) };
    },
  );
}
