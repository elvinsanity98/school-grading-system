import { createReadStream, existsSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit';
import { requireRole } from '../auth';
import { dataDir, dbFile, describeDatabase } from '../config';
import { dbKind } from '../db';
import { recomputeClassQuarter } from '../services/grades';

export default async function adminRoutes(app: FastifyInstance) {
  const db = app.db;
  const admin = requireRole('ADMIN');

  app.get('/audit', { preHandler: admin }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const take = Math.min(500, Math.max(1, Number(q.limit ?? 100)));
    const where: Record<string, unknown> = {};
    if (q.entity) where.entity = q.entity;
    if (q.action) where.action = { contains: q.action.toUpperCase() };
    if (q.user) where.username = { contains: q.user.toLowerCase() };
    if (q.before) where.id = { lt: Number(q.before) };
    const rows = await db.auditLog.findMany({ where, orderBy: { id: 'desc' }, take });
    return rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      username: r.username,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      detail: r.detail,
      ip: r.ip,
    }));
  });

  /** A consistent snapshot of the whole database as a downloadable file. */
  app.get('/admin/backup', { preHandler: admin }, async (req, reply) => {
    if (dbKind() === 'postgres') {
      return reply.code(501).send({
        error: "This system stores its data in PostgreSQL (Supabase). Use the database provider's own backups: Supabase, Database, Backups. See docs/DEPLOYMENT.md.",
        code: 'NOT_AVAILABLE',
      });
    }
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const target = join(dataDir, `backup-${stamp}.db`);
    if (existsSync(target)) await rm(target);
    await db.$executeRawUnsafe(`VACUUM INTO '${target.replace(/\\/g, '/').replace(/'/g, "''")}'`);
    await audit(db, req, 'BACKUP_DOWNLOADED', 'System');
    const size = statSync(target).size;
    const stream = createReadStream(target);
    stream.on('close', () => void rm(target, { force: true }));
    reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Length', size)
      .header('Content-Disposition', `attachment; filename="bnhs-grading-backup-${stamp}.db"`);
    return reply.send(stream);
  });

  /**
   * Recomputes every stored quarterly grade that is not approved yet.
   * Use after changing the weights so open class records pick up the new percentages.
   */
  app.post('/admin/recompute', { preHandler: admin }, async (req) => {
    const pairs = await db.assessmentItem.findMany({
      select: { classId: true, quarter: true },
      distinct: ['classId', 'quarter'],
    });
    const approved = await db.classQuarter.findMany({ where: { status: 'APPROVED' }, select: { classId: true, quarter: true } });
    const locked = new Set(approved.map((a) => `${a.classId}:${a.quarter}`));
    let done = 0;
    for (const p of pairs) {
      if (locked.has(`${p.classId}:${p.quarter}`)) continue;
      await recomputeClassQuarter(db, p.classId, p.quarter);
      done++;
    }
    await audit(db, req, 'RECOMPUTE_ALL', 'System', undefined, { recomputed: done, lockedSkipped: pairs.length - done });
    return { recomputed: done, lockedSkipped: pairs.length - done };
  });

  app.get('/admin/system', { preHandler: admin }, async () => {
    const [learners, users, scores, audits] = await Promise.all([
      db.learner.count(),
      db.user.count(),
      db.score.count(),
      db.auditLog.count(),
    ]);
    let dbBytes = 0;
    if (dbKind() === 'postgres') {
      const rows = await db.$queryRaw<Array<{ size: bigint | number }>>`SELECT pg_database_size(current_database()) AS size`;
      dbBytes = Number(rows[0]?.size ?? 0);
    } else if (existsSync(dbFile)) {
      dbBytes = statSync(dbFile).size;
    }
    return {
      version: '1.0.0',
      node: process.version,
      database: dbKind(),
      dbLabel: describeDatabase(),
      dbBytes,
      canDownloadBackup: dbKind() === 'sqlite',
      counts: { learners, users, scores, audits },
    };
  });
}
