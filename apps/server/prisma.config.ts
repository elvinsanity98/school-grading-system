import { defineConfig } from 'prisma/config';
import { databaseUrl, isPostgres } from './src/config';

// SQLite is the default. With DATABASE_URL=postgresql://... the PostgreSQL schema and migrations are used.
export default defineConfig({
  schema: isPostgres ? 'prisma/postgres/schema.prisma' : 'prisma/schema.prisma',
  migrations: { path: isPostgres ? 'prisma/postgres/migrations' : 'prisma/migrations' },
  datasource: { url: databaseUrl },
});
