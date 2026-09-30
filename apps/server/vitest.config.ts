import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Every test file builds its own temporary database.
    pool: 'forks',
    env: { NODE_ENV: 'test' },
  },
});
