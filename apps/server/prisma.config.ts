import { defineConfig } from 'prisma/config';
import { databaseUrl } from './src/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl },
});
