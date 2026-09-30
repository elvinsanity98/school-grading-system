import type { FastifyRequest } from 'fastify';
import type { Db, Tx } from './db';

/**
 * Writes one row to the audit trail. Failures are swallowed on purpose: a broken
 * log must never block a teacher who is saving grades.
 */
export async function audit(
  db: Db | Tx,
  req: FastifyRequest | null,
  action: string,
  entity?: string,
  entityId?: string | number,
  detail?: unknown,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: req?.user?.id ?? null,
        username: req?.user?.username ?? null,
        action,
        entity: entity ?? null,
        entityId: entityId == null ? null : String(entityId),
        detail: detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail),
        ip: req?.ip ?? null,
      },
    });
  } catch (e) {
    req?.log.warn({ err: e }, 'audit log write failed');
  }
}
