import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { derivePostgresSchema, postgresSchemaPath, sqliteSchemaPath } from '../scripts/make-pg-schema';
import { dbKind } from '../src/db';
import { client, makeTestEnv, migrationFiles, postgresMigrations, sqliteMigrations, usingPostgres, type TestEnv } from './helpers';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('PostgreSQL support files', () => {
  it('the PostgreSQL schema is generated from the SQLite one and is up to date', () => {
    const derived = derivePostgresSchema(readFileSync(sqliteSchemaPath, 'utf8')).replace(/\r\n/g, '\n');
    expect(readFileSync(postgresSchemaPath, 'utf8').replace(/\r\n/g, '\n')).toBe(derived);
  });

  it('both Prisma clients are always generated, whatever DATABASE_URL is at install time', () => {
    // On a host such as Render DATABASE_URL is already set during `npm ci`, and prisma.config.ts would then
    // pick the PostgreSQL schema for a bare `prisma generate`. Each schema must therefore be named.
    const pkg = JSON.parse(read('../package.json')) as { scripts: Record<string, string> };
    for (const script of ['postinstall', 'db:generate', 'typecheck']) {
      expect(pkg.scripts[script], script).toContain('prisma generate --schema prisma/schema.prisma');
      expect(pkg.scripts[script], script).toContain('prisma generate --schema prisma/postgres/schema.prisma');
    }
  });

  it('both databases end up with the same tables once every migration has run', async () => {
    const { createClient } = await import('@libsql/client');
    const { PGlite } = await import('@electric-sql/pglite');

    const lite = createClient({ url: ':memory:' });
    for (const sql of migrationFiles(sqliteMigrations)) await lite.executeMultiple(sql);
    const sqlite = (await lite.execute(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)).rows.map((r) => String(r.name));
    lite.close();

    const pg = await PGlite.create();
    await pg.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;');
    for (const sql of migrationFiles(postgresMigrations)) await pg.exec(sql);
    const postgres = (await pg.query<{ name: string }>(`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).rows.map((r) => r.name);
    await pg.close();

    expect(postgres).toEqual(sqlite);
    expect(postgres.length).toBeGreaterThan(20);
    expect(postgres).toContain('TermGrade');
    expect(postgres).not.toContain('QuarterlyGrade');
  }, 60_000);
});

/** Only when the suite runs with TEST_DB=postgres (npm run test:postgres). */
describe.skipIf(!usingPostgres)('PostgreSQL behaviour', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await makeTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  it('the app is really talking to PostgreSQL', async () => {
    expect(dbKind()).toBe('postgres');
    const rows = await env.sql!('SELECT version() AS v');
    expect(String(rows[0]!.v)).toMatch(/PostgreSQL/);
  });

  it('every table has row-level security, so the Supabase web API cannot read it', async () => {
    const rows = await env.sql!(
      `SELECT c.relname AS name, c.relrowsecurity AS rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    expect(rows.length).toBeGreaterThan(20);
    const open = rows.filter((r) => !r.rls).map((r) => r.name);
    expect(open, 'tables without row-level security').toEqual([]);
  });

  it('the anon and authenticated roles have no privileges on any table', async () => {
    const rows = await env.sql!(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'`);
    for (const role of ['anon', 'authenticated']) {
      for (const { t } of rows) {
        const r = await env.sql!(
          `SELECT has_table_privilege('${role}', 'public."${String(t)}"', 'SELECT,INSERT,UPDATE,DELETE') AS allowed`,
        );
        expect(r[0]!.allowed, `${role} on ${String(t)}`).toBe(false);
      }
    }
  });

  it('what the public API roles can actually do: nothing, even after data exists', async () => {
    const setup = await client(env.app).post('/api/setup', { schoolName: 'BNHS', adminName: 'Admin', username: 'admin', password: 'Admin#2026', sampleCurriculum: false });
    expect(setup.status).toBe(201);
    expect((await env.sql!(`SELECT count(*)::int AS n FROM "User"`))[0]!.n).toBe(1); // owner sees the row

    for (const role of ['anon', 'authenticated']) {
      await env.sql!(`SET ROLE ${role}`);
      try {
        await expect(env.sql!(`SELECT * FROM "User"`)).rejects.toThrow(/permission denied/i);
        await expect(env.sql!(`UPDATE "User" SET "active" = false`)).rejects.toThrow(/permission denied/i);
        await expect(env.sql!(`DELETE FROM "Learner"`)).rejects.toThrow(/permission denied/i);
      } finally {
        await env.sql!('RESET ROLE');
      }
    }
    // a table created later by the owner is closed to these roles by default privileges
    await env.sql!(`CREATE TABLE "Later" ("id" int)`);
    const r = await env.sql!(`SELECT has_table_privilege('anon', 'public."Later"', 'SELECT') AS allowed`);
    expect(r[0]!.allowed).toBe(false);
    await env.sql!(`DROP TABLE "Later"`);
  });

  it('name searches ignore case, like SQLite does', async () => {
    const admin = client(env.app, (await client(env.app).post('/api/auth/login', { username: 'admin', password: 'Admin#2026' })).json.token);
    await admin.post('/api/learners', { lrn: '300000000001', lastName: 'Lopez', firstName: 'Lita', sex: 'F', birthDate: '2008-05-05' });
    const hit = (await admin.get('/api/learners?q=lOP')).json;
    expect(hit.total).toBe(1);
    expect(hit.items[0].lastName).toBe('Lopez');
    expect((await admin.get('/api/users?q=ADMIN')).json).toHaveLength(1);
  });
});
