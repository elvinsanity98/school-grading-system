// Derives the PostgreSQL schema from the SQLite one, so there is a single source of truth.
//   npm run db:pg-schema -w @bnhs/server       rewrites prisma/postgres/schema.prisma
//   npm run db:pg-check -w @bnhs/server        exits 1 if the committed file is out of date
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const sqliteSchemaPath = join(root, 'prisma', 'schema.prisma');
export const postgresSchemaPath = join(root, 'prisma', 'postgres', 'schema.prisma');

export function derivePostgresSchema(sqliteSchema: string): string {
  const header =
    '// GENERATED from ../schema.prisma by scripts/make-pg-schema.ts. Do not edit; change ../schema.prisma\n' +
    '// and run `npm run db:pg-schema -w @bnhs/server`.\n\n';
  const body = sqliteSchema
    .replace('provider = "sqlite"', 'provider = "postgresql"')
    .replace('output   = "../src/generated/prisma"', 'output   = "../../src/generated/prisma-pg"');
  if (body === sqliteSchema || !body.includes('postgresql') || !body.includes('prisma-pg')) {
    throw new Error('Could not rewrite provider/output in schema.prisma');
  }
  return header + body;
}

const normalize = (s: string) => s.replace(/\r\n/g, '\n');

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const derived = derivePostgresSchema(readFileSync(sqliteSchemaPath, 'utf8'));
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(postgresSchemaPath, 'utf8');
    } catch {
      /* missing */
    }
    if (normalize(current) !== normalize(derived)) {
      console.error('prisma/postgres/schema.prisma is out of date. Run: npm run db:pg-schema -w @bnhs/server');
      process.exit(1);
    }
    console.log('prisma/postgres/schema.prisma is up to date.');
  } else {
    mkdirSync(dirname(postgresSchemaPath), { recursive: true });
    writeFileSync(postgresSchemaPath, derived);
    console.log('Wrote prisma/postgres/schema.prisma');
  }
}
