import { buildApp } from './app';
import { config, describeDatabase, isPostgres } from './config';
import { createDb, tuneSqlite } from './db';
import { seedDemo } from './demo/seed';

if (config.demo.enabled && isPostgres) {
  // The demo wipes and reloads everything every few hours: never let it near a real database.
  console.error('DEMO_MODE refuses to run on PostgreSQL. Unset DATABASE_URL, or unset DEMO_MODE.');
  process.exit(1);
}

const db = createDb();
await tuneSqlite(db);
if (config.demo.enabled && (await db.user.count()) === 0) await seedDemo(db);
const app = await buildApp({ db, logger: true, demo: config.demo.enabled ? { resetEveryHours: config.demo.resetEveryHours } : undefined });

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Database: ${describeDatabase()}${config.demo.enabled ? '  (DEMO MODE: made-up data, resets every ' + config.demo.resetEveryHours + ' h)' : ''}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
