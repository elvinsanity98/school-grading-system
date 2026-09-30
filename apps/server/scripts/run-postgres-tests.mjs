// Runs the whole server test suite on PostgreSQL (in-memory PGlite) instead of SQLite.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync('npx', ['vitest', 'run', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, TEST_DB: 'postgres' },
});
process.exit(r.status ?? 1);
