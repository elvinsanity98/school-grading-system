/**
 * npm run db:reset-password -- <username>
 * For a locked-out administrator. Prints a one-time password that must be changed at first sign-in.
 */
import { generateTempPassword, hashPassword } from '../auth';
import { createDb } from '../db';

const username = process.argv[2]?.trim().toLowerCase();
if (!username) {
  console.error('Usage: npm run db:reset-password -- <username>');
  process.exit(1);
}

const db = createDb();
const user = await db.user.findUnique({ where: { username } });
if (!user) {
  console.error(`No user named "${username}".`);
  await db.$disconnect();
  process.exit(1);
}
const tempPassword = generateTempPassword();
await db.user.update({
  where: { id: user.id },
  data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true, active: true, tokenVersion: { increment: 1 } },
});
await db.auditLog.create({ data: { action: 'PASSWORD_RESET_CLI', entity: 'User', entityId: String(user.id), username: 'cli' } });
console.log(`New one-time password for ${username}: ${tempPassword}`);
await db.$disconnect();
