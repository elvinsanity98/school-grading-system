import { buildApp } from './app';
import { config, describeDatabase } from './config';
import { createDb, tuneSqlite } from './db';

const db = createDb();
await tuneSqlite(db);
const app = await buildApp({ db, logger: true });

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
  app.log.info(`Database: ${describeDatabase()}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
