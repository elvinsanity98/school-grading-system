import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { createDb, tuneSqlite, type Db } from '../src/db';

/**
 * `npm test` runs everything on SQLite. `TEST_DB=postgres npm test` runs the same tests on PostgreSQL:
 * an in-memory PGlite (real Postgres compiled to WebAssembly) reached over TCP with the same `pg`
 * driver that production uses.
 */
export const usingPostgres = process.env.TEST_DB === 'postgres';

const sqliteMigrations = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
const postgresMigrations = fileURLToPath(new URL('../prisma/postgres/migrations', import.meta.url));

export interface TestEnv {
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
  /** Only when running on PostgreSQL: run SQL as the database owner, for schema checks. */
  sql?: (query: string) => Promise<Array<Record<string, unknown>>>;
}

function migrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d/.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f, 'migration.sql'), 'utf8'));
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

async function makeSqlite(): Promise<TestEnv> {
  const dir = mkdtempSync(join(tmpdir(), 'bnhs-test-'));
  const url = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;
  const raw = createClient({ url });
  for (const sql of migrationFiles(sqliteMigrations)) await raw.executeMultiple(sql);
  raw.close();

  const db = createDb(url);
  await tuneSqlite(db);
  const app = await buildApp({ db, logger: false, rateLimit: false });
  await app.ready();
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await db.$disconnect();
      try {
        // Windows keeps the SQLite file locked for a moment after disconnect
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      } catch {
        /* the OS temp cleaner will remove it */
      }
    },
  };
}

async function makePostgres(): Promise<TestEnv> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  const pg = await PGlite.create();
  // The roles Supabase's web API uses; they let the tests prove those roles cannot read anything.
  await pg.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;');
  for (const sql of migrationFiles(postgresMigrations)) await pg.exec(sql);

  const port = await freePort();
  const server = new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1' });
  await server.start();

  // PGlite is a single session, so keep to one connection.
  process.env.DATABASE_POOL_MAX = '1';
  const db = createDb(`postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);
  const app = await buildApp({ db, logger: false, rateLimit: false });
  await app.ready();
  return {
    app,
    db,
    sql: async (query) => (await pg.query<Record<string, unknown>>(query)).rows,
    close: async () => {
      await app.close();
      await db.$disconnect();
      await server.stop();
      await pg.close();
    },
  };
}

/** A fresh app on a throw-away database with the real migrations applied. */
export async function makeTestEnv(): Promise<TestEnv> {
  return usingPostgres ? makePostgres() : makeSqlite();
}

export interface Res<T = any> {
  status: number;
  json: T;
  raw: Buffer;
  headers: Record<string, unknown>;
}

/** Small client over app.inject with a bearer token. */
export function client(app: FastifyInstance, token?: string) {
  async function call<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown): Promise<Res<T>> {
    const res = await app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    let json: unknown = null;
    const type = String(res.headers['content-type'] ?? '');
    if (type.includes('json')) json = res.json();
    return { status: res.statusCode, json: json as T, raw: res.rawPayload, headers: res.headers };
  }
  return {
    get: <T = any>(url: string) => call<T>('GET', url),
    post: <T = any>(url: string, body?: unknown) => call<T>('POST', url, body ?? {}),
    put: <T = any>(url: string, body?: unknown) => call<T>('PUT', url, body ?? {}),
    del: <T = any>(url: string) => call<T>('DELETE', url),
  };
}

export type Client = ReturnType<typeof client>;

export async function login(app: FastifyInstance, username: string, password: string): Promise<string> {
  const r = await client(app).post('/api/auth/login', { username, password });
  if (r.status !== 200) throw new Error(`login failed for ${username}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.token as string;
}
