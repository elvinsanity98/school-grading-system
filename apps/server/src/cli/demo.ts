/**
 * npm run db:demo
 *
 * Fills the database with made-up learners, teachers and scores so every screen can be tried out.
 * Refuses to run in production or when the database already has users.
 */
import { isProd } from '../config';
import { createDb, tuneSqlite } from '../db';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemo } from '../demo/seed';

if (isProd) {
  console.error('Refusing to load demo data in production.');
  process.exit(1);
}

const db = createDb();
await tuneSqlite(db);
try {
  if ((await db.user.count()) > 0) {
    console.error('The database already has users. Demo data is only loaded into an empty database.');
    process.exit(1);
  }
  const r = await seedDemo(db);
  console.log('');
  console.log('Demo data loaded.');
  console.log('');
  console.log(`  Sign in with password "${DEMO_PASSWORD}"`);
  for (const a of DEMO_ACCOUNTS) console.log(`    ${a.username.padEnd(18)} ${a.label}`);
  console.log('');
  console.log(`  ${r.learners} learners in ${r.sections} sections.`);
  console.log('');
} finally {
  await db.$disconnect();
}
