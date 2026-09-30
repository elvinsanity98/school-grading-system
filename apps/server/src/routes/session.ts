import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { hashPassword, isOffice, me, passwordProblem, signToken, verifyPassword } from '../auth';
import { badRequest, parse, unauthorized } from '../errors';
import { iso } from '../util';
import { publicUser } from '../services/present';

const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function loadSchool(app: FastifyInstance) {
  const s = await app.db.school.findUnique({ where: { id: 1 } });
  if (!s) throw badRequest('School profile is not set up yet.');
  return s;
}

export default async function sessionRoutes(app: FastifyInstance) {
  const db = app.db;

  /** Everything the app needs right after sign-in. */
  app.get('/session', async (req) => {
    const user = me(req);
    const [row, school, years] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: user.id } }),
      loadSchool(app),
      db.schoolYear.findMany({ orderBy: { startDate: 'desc' }, include: { periods: { orderBy: { quarter: 'asc' } } } }),
    ]);
    const current = years.find((y) => y.isCurrent) ?? years[0] ?? null;
    const [advisory, loads, learner] = await Promise.all([
      user.role === 'TEACHER' || isOffice(user)
        ? db.section.findMany({
            where: { adviserId: user.id, ...(current ? { schoolYearId: current.id } : {}) },
            include: { strand: true },
            orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
          })
        : [],
      user.role === 'TEACHER' && current
        ? db.classAssignment.count({ where: { teacherId: user.id, schoolYearId: current.id } })
        : 0,
      user.learnerId ? db.learner.findUnique({ where: { id: user.learnerId } }) : null,
    ]);
    return {
      user: publicUser(row),
      school: { ...school, logo: school.logo ?? null },
      years: years.map((y) => ({
        id: y.id,
        name: y.name,
        startDate: iso(y.startDate),
        endDate: iso(y.endDate),
        isCurrent: y.isCurrent,
        periods: y.periods.map((p) => ({ id: p.id, quarter: p.quarter, status: p.status, released: p.released })),
      })),
      currentYearId: current?.id ?? null,
      advisory: advisory.map((s) => ({
        id: s.id,
        name: s.name,
        gradeLevel: s.gradeLevel,
        strandCode: s.strand.code,
      })),
      teachingLoads: loads,
      learner: learner
        ? { id: learner.id, lrn: learner.lrn, name: `${learner.firstName} ${learner.lastName}` }
        : null,
    };
  });

  app.post('/auth/change-password', async (req) => {
    const user = me(req);
    const body = parse(changePasswordBody, req.body);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(body.currentPassword, row.passwordHash))) throw unauthorized('Current password is wrong.');
    const problem = passwordProblem(body.newPassword);
    if (problem) throw badRequest(problem);
    if (body.newPassword === body.currentPassword) throw badRequest('Choose a password different from the current one.');
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(body.newPassword),
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });
    await audit(db, req, 'PASSWORD_CHANGED', 'User', user.id);
    // Old tokens die with the version bump, so hand back a fresh one.
    return { token: await signToken(updated), user: publicUser(updated) };
  });
}
