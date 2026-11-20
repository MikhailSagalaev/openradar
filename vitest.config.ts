import { defineConfig } from 'vitest/config';

const postgresMode = process.env.RADAR_TEST_STORE === 'postgres';

// Tests run in Moscow time everywhere, as in CI: day boundaries (digests, "today",
// weekly indices) must not depend on the developer's machine. Set here, before any
// worker starts, so forked workers inherit it before their first Date call.
const TZ = 'Europe/Moscow';
process.env.TZ = TZ;

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    env: { TZ },
    // Suites assert on table contents, so against Postgres the files must
    // not run concurrently on one schema, and every test starts clean.
    // One fork: Vitest 5 still starts several workers with fileParallelism off,
    // and a worker's beforeEach TRUNCATE would wipe another worker's live test.
    fileParallelism: !postgresMode,
    maxWorkers: postgresMode ? 1 : undefined,
    setupFiles: postgresMode ? ['./test/setup.ts', './test/postgres-setup.ts'] : ['./test/setup.ts'],
  },
});
