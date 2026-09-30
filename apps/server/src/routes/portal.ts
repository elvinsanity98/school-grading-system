import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isFamily, me } from '../auth';
import { forbidden, notFound } from '../errors';
import { buildCard } from '../services/card';
import { presentLearner } from '../services/present';
import { idParam } from '../util';

/** Learner and parent view: only grades that are approved and released, only their own. */
export default async function portalRoutes(app: FastifyInstance) {
  const db = app.db;

  app.get('/me/learner', async (req) => {
    const user = me(req);
    if (!isFamily(user) || !user.learnerId) throw forbidden();
    const l = await db.learner.findUnique({
      where: { id: user.learnerId },
      include: {
        enrollments: {
          orderBy: { schoolYear: { startDate: 'desc' } },
          include: { section: { include: { strand: true, adviser: true } }, schoolYear: true },
        },
      },
    });
    if (!l) throw notFound('Learner');
    return {
      ...presentLearner(l),
      enrollments: l.enrollments.map((e) => ({
        id: e.id,
        schoolYear: e.schoolYear.name,
        status: e.status,
        gradeLevel: e.section.gradeLevel,
        section: e.section.name,
        strand: e.section.strand.code,
        adviser: e.section.adviser?.fullName ?? null,
      })),
    };
  });

  app.get('/me/enrollments/:id/card', async (req) => {
    const user = me(req);
    if (!isFamily(user) || !user.learnerId) throw forbidden();
    const id = idParam(req);
    const e = await db.enrollment.findUnique({ where: { id } });
    if (!e || e.learnerId !== user.learnerId) throw notFound('Enrollment');
    const semester = z.union([z.literal(1), z.literal(2)]).parse(Number((req.query as { semester?: string }).semester ?? 1));
    return buildCard(db, id, semester, 'released');
  });
}
