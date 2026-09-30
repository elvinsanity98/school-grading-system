import { ROLES } from '@bnhs/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { generateTempPassword, hashPassword, me, passwordProblem, requireRole } from '../auth';
import { badRequest, conflict, forbidden, notFound, parse } from '../errors';
import { publicUser } from '../services/present';
import { idParam, zNullableText, zText } from '../util';

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Username: 3 to 32 letters, numbers, dot, dash or underscore');

const createBody = z.object({
  username: usernameSchema,
  fullName: zText(100),
  role: z.enum(ROLES),
  email: zNullableText(120),
  employeeNo: zNullableText(30),
  learnerId: z.number().int().positive().nullable().optional(),
  /** Leave out to get a generated one-time password. */
  password: z.string().min(8).max(128).optional(),
});

const updateBody = z.object({
  fullName: zText(100),
  role: z.enum(ROLES),
  email: zNullableText(120),
  employeeNo: zNullableText(30),
  active: z.boolean(),
});

export default async function usersRoutes(app: FastifyInstance) {
  const db = app.db;
  const admin = requireRole('ADMIN');
  const office = requireRole('ADMIN', 'REGISTRAR');

  app.get('/users', { preHandler: admin }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (q.role) where.role = q.role;
    if (q.active === 'true') where.active = true;
    if (q.active === 'false') where.active = false;
    if (q.q) {
      where.OR = [{ fullName: { contains: q.q } }, { username: { contains: q.q.toLowerCase() } }];
    }
    const users = await db.user.findMany({ where, orderBy: [{ role: 'asc' }, { fullName: 'asc' }], take: 500 });
    return users.map(publicUser);
  });

  /** Names for pickers (adviser, subject teacher). */
  app.get('/teachers', { preHandler: office }, async () => {
    const t = await db.user.findMany({
      where: { role: 'TEACHER', active: true },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, employeeNo: true },
    });
    return t;
  });

  app.post('/users', { preHandler: admin }, async (req, reply) => {
    const body = parse(createBody, req.body);
    if ((body.role === 'STUDENT' || body.role === 'PARENT') && !body.learnerId) {
      throw badRequest('Learner and parent accounts must be linked to a learner.');
    }
    if (body.learnerId && !(await db.learner.findUnique({ where: { id: body.learnerId } }))) throw notFound('Learner');
    const tempPassword = body.password ?? generateTempPassword();
    if (body.password) {
      const problem = passwordProblem(body.password);
      if (problem) throw badRequest(problem);
    }
    if (await db.user.findUnique({ where: { username: body.username } })) throw conflict('That username is taken.');
    const user = await db.user.create({
      data: {
        username: body.username,
        fullName: body.fullName,
        role: body.role,
        email: body.email ?? null,
        employeeNo: body.employeeNo ?? null,
        learnerId: body.learnerId ?? null,
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
      },
    });
    await audit(db, req, 'USER_CREATED', 'User', user.id, { username: user.username, role: user.role });
    reply.code(201);
    return { user: publicUser(user), tempPassword };
  });

  app.put('/users/:id', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    const body = parse(updateBody, req.body);
    const self = me(req);
    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw notFound('User');
    if (id === self.id && (!body.active || body.role !== 'ADMIN')) {
      throw forbidden('You cannot deactivate or demote your own account.');
    }
    if (target.role === 'ADMIN' && (!body.active || body.role !== 'ADMIN')) {
      const others = await db.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } });
      if (!others) throw conflict('There must be at least one active administrator.');
    }
    const user = await db.user.update({
      where: { id },
      data: {
        fullName: body.fullName,
        role: body.role,
        email: body.email ?? null,
        employeeNo: body.employeeNo ?? null,
        active: body.active,
        // deactivating or changing role signs the person out everywhere
        ...(!body.active || body.role !== target.role ? { tokenVersion: { increment: 1 } } : {}),
      },
    });
    await audit(db, req, 'USER_UPDATED', 'User', id, { role: user.role, active: user.active });
    return publicUser(user);
  });

  app.post('/users/:id/reset-password', { preHandler: admin }, async (req) => {
    const id = idParam(req);
    if (!(await db.user.findUnique({ where: { id } }))) throw notFound('User');
    const tempPassword = generateTempPassword();
    await db.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true, tokenVersion: { increment: 1 } },
    });
    await audit(db, req, 'PASSWORD_RESET', 'User', id);
    return { tempPassword };
  });
}
