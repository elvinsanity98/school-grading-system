import { PrismaLibSql } from '@prisma/adapter-libsql';
import { databaseUrl } from './config';
import { Prisma, PrismaClient } from './generated/prisma/client';

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
export { Prisma };

export function createDb(url: string = databaseUrl): Db {
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

/** WAL keeps readers from blocking the single writer; busy_timeout absorbs short write bursts. */
export async function tuneSqlite(db: Db): Promise<void> {
  await db.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
  await db.$queryRawUnsafe('PRAGMA foreign_keys = ON');
}
