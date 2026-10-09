import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const serverRoot = resolve(here, '..');

export const isProd = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

/** Everything that must be backed up lives here: the SQLite file and the token secret. */
export const dataDir = resolve(process.env.DATA_DIR ?? join(serverRoot, 'data'));
mkdirSync(dataDir, { recursive: true });

export const dbFile = process.env.DB_FILE ? resolve(process.env.DB_FILE) : join(dataDir, isTest ? 'test.db' : 'bnhs.db');

/**
 * Where the data lives. Default: a SQLite file (forward slashes so it also works on Windows).
 * Set DATABASE_URL to a postgresql:// address (for example Supabase) to use PostgreSQL instead.
 */
export const databaseUrl = process.env.DATABASE_URL?.trim() || `file:${dbFile.replace(/\\/g, '/')}`;

export const isPostgresUrl = (url: string): boolean => /^postgres(ql)?:\/\//i.test(url);
export const isPostgres = isPostgresUrl(databaseUrl);

/** Safe to log: the password is left out. */
export function describeDatabase(url: string = databaseUrl): string {
  if (!isPostgresUrl(url)) return url.replace(/^file:/, 'SQLite file ');
  try {
    const u = new URL(url);
    return `PostgreSQL ${u.username ? `${decodeURIComponent(u.username)}@` : ''}${u.host}${u.pathname}`;
  } catch {
    return 'PostgreSQL';
  }
}

function loadJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) return process.env.JWT_SECRET;
  const file = join(dataDir, 'jwt.secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(48).toString('hex');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const truthy = (v: string | undefined) => ['1', 'true', 'yes', 'on'].includes((v ?? '').trim().toLowerCase());

export const config = {
  /**
   * Hosted demo: fake data, one-click sign-in for every role, automatic reset. Never use with real records.
   */
  demo: {
    enabled: truthy(process.env.DEMO_MODE),
    resetEveryHours: Number(process.env.DEMO_RESET_HOURS ?? 6) || 6,
  },
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: loadJwtSecret(),
  /** How long a login lasts. */
  tokenTtl: process.env.TOKEN_TTL ?? '12h',
  /** Built web app, served by this same server. */
  webDir: resolve(process.env.WEB_DIR ?? join(serverRoot, '..', 'web', 'dist')),
  /**
   * Extra browser origins allowed to call the API (comma separated), e.g. the
   * Android app origin. Capacitor's defaults are always allowed.
   */
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
