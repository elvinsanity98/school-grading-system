// Recreates data/demo.db with made-up learners, teachers and scores.
//   npm run demo:load -w @bnhs/server
// The real database (data/bnhs.db) is never touched.
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = join(root, 'data', 'demo.db');
for (const suffix of ['', '-shm', '-wal']) if (existsSync(dbFile + suffix)) rmSync(dbFile + suffix);

const env = { ...process.env, DB_FILE: dbFile, DATABASE_URL: '' };
const run = (cmd) => execSync(cmd, { cwd: root, env, stdio: 'inherit' });
run('npx prisma migrate deploy');
run('npx tsx src/cli/demo.ts');
