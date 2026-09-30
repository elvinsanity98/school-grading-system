import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { createDb, tuneSqlite, type Db } from '../src/db';

const migrationsDir = fileURLToPath(new URL('../prisma/migrations', import.meta.url));

export interface TestEnv {
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
}

/** A fresh app on a throw-away SQLite file with the real migrations applied. */
export async function makeTestEnv(): Promise<TestEnv> {
  const dir = mkdtempSync(join(tmpdir(), 'bnhs-test-'));
  const url = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;

  const raw = createClient({ url });
  for (const folder of readdirSync(migrationsDir).filter((f) => /^\d/.test(f)).sort()) {
    await raw.executeMultiple(readFileSync(join(migrationsDir, folder, 'migration.sql'), 'utf8'));
  }
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
