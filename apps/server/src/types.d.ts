import type { AuthUser } from './auth';
import type { DemoController } from './demo/mode';
import type { Db } from './db';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    /** Set only when the server runs as the public demo. */
    demo: DemoController | null;
  }
  interface FastifyRequest {
    user: AuthUser | null;
  }
}
