import { defineConfig } from 'vitest/config';

const postgresMode = process.env.RADAR_TEST_STORE === 'postgres';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    // Suites assert on table contents, so against Postgres the files must
    // not run concurrently on one schema, and every test starts clean.
    fileParallelism: !postgresMode,
    setupFiles: postgresMode ? ['./test/setup.ts', './test/postgres-setup.ts'] : ['./test/setup.ts'],
  },
});
