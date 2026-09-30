import type { AuthUser } from './auth';
import type { Db } from './db';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
  interface FastifyRequest {
    user: AuthUser | null;
  }
}
