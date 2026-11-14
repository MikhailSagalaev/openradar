import { defineConfig } from 'vitest/config';

const postgresMode = process.env.RADAR_TEST_STORE === 'postgres';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    // Suites assert on table contents, so against Postgres the files must
    // not run concurrently on one schema, and every test starts clean.
    // One fork: Vitest 5 still starts several workers with fileParallelism off,
    // and a worker's beforeEach TRUNCATE would wipe another worker's live test.
    fileParallelism: !postgresMode,
    maxWorkers: postgresMode ? 1 : undefined,
    setupFiles: postgresMode ? ['./test/setup.ts', './test/postgres-setup.ts'] : ['./test/setup.ts'],
  },
});
