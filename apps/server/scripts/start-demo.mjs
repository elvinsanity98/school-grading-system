// Starts the server on the demo database (data/demo.db). Create it first with: npm run demo:load
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = join(root, 'data', 'demo.db');
if (!existsSync(dbFile)) {
  console.error('No demo database yet. Run:  npm run demo:load -w @bnhs/server');
  process.exit(1);
}
const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: root,
  env: { ...process.env, DB_FILE: dbFile },
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
