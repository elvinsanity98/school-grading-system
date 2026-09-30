import { readFileSync } from 'node:fs';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl, isPostgresUrl } from './config';
import { Prisma, PrismaClient } from './generated/prisma/client';
import { PrismaClient as PostgresClient } from './generated/prisma-pg/client';

/**
 * The SQLite and PostgreSQL clients are generated from the same models, so they expose the same API.
 * The SQLite one is used for the types.
 */
export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
export { Prisma };

export type DbKind = 'sqlite' | 'postgres';
let currentKind: DbKind = 'sqlite';
/** Which database the running app is connected to (set by createDb). */
export const dbKind = (): DbKind => currentKind;

/**
 * Connection settings for `pg`. Supabase's pooler uses a certificate authority that is not in the
 * system store: give DATABASE_CA_FILE (Supabase's downloadable root certificate) to verify it. Without
 * it the connection is still encrypted but the certificate is not checked.
 */
function postgresPool(url: string) {
  const u = new URL(url);
  const mode = u.searchParams.get('sslmode');
  // `pg` lets the connection string override the ssl option, so take these off and decide ourselves.
  for (const p of ['sslmode', 'ssl', 'uselibpqcompat', 'pgbouncer', 'connection_limit', 'schema']) u.searchParams.delete(p);
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  let ssl: false | { rejectUnauthorized: boolean; ca?: string } = { rejectUnauthorized: false };
  if (process.env.DATABASE_SSL === 'off' || mode === 'disable' || (local && mode !== 'require')) ssl = false;
  else if (process.env.DATABASE_CA_FILE) ssl = { rejectUnauthorized: true, ca: readFileSync(process.env.DATABASE_CA_FILE, 'utf8') };
  return {
    connectionString: u.toString(),
    ssl,
    // A hosted database has a small connection allowance; the app needs few.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  };
}

export function createDb(url: string = databaseUrl): Db {
  if (isPostgresUrl(url)) {
    currentKind = 'postgres';
    const schema = process.env.DATABASE_SCHEMA || undefined;
    const adapter = new PrismaPg(postgresPool(url), schema ? { schema } : undefined);
    return new PostgresClient({ adapter }) as unknown as Db;
  }
  currentKind = 'sqlite';
  return new PrismaClient({ adapter: new PrismaLibSql({ url }) });
}

/** SQLite only: WAL keeps readers from blocking the single writer; busy_timeout absorbs short write bursts. */
export async function tuneSqlite(db: Db): Promise<void> {
  if (currentKind !== 'sqlite') return;
  await db.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
  await db.$queryRawUnsafe('PRAGMA foreign_keys = ON');
}

/** Case-insensitive "contains". SQLite already ignores case for ASCII; PostgreSQL needs to be told. */
export function ci(term: string): { contains: string } {
  return (currentKind === 'postgres' ? { contains: term, mode: 'insensitive' } : { contains: term }) as { contains: string };
}

interface BulkUpsert {
  table: string;
  /** column names, in the order of each row's values */
  columns: readonly string[];
  /** the unique columns the rows are matched on */
  key: readonly string[];
  rows: ReadonlyArray<readonly unknown[]>;
}

/**
 * Inserts many rows, updating the ones that already exist, in as few statements as possible.
 * One statement instead of one per row matters on a hosted database, where each round trip costs
 * tens of milliseconds. Table and column names are fixed strings from the code, never user input.
 */
export async function bulkUpsert(db: Db | Tx, spec: BulkUpsert): Promise<void> {
  if (!spec.rows.length) return;
  const cols = spec.columns.map((c) => Prisma.raw(`"${c}"`));
  const keys = spec.key.map((c) => Prisma.raw(`"${c}"`));
  const updates = spec.columns.filter((c) => !spec.key.includes(c)).map((c) => Prisma.raw(`"${c}" = excluded."${c}"`));
  const CHUNK = 500;
  for (let i = 0; i < spec.rows.length; i += CHUNK) {
    const values = spec.rows.slice(i, i + CHUNK).map((row) => Prisma.sql`(${Prisma.join(row as unknown[])})`);
    await db.$executeRaw`INSERT INTO ${Prisma.raw(`"${spec.table}"`)} (${Prisma.join(cols)}) VALUES ${Prisma.join(values)} ON CONFLICT (${Prisma.join(keys)}) DO UPDATE SET ${Prisma.join(updates)}`;
  }
}
