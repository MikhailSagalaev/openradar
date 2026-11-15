import pg from 'pg';
import { afterAll, beforeEach } from 'vitest';
import { runMigrations } from '../src/store/migrator.ts';

/**
 * Vitest setup for the Postgres test mode (RADAR_TEST_STORE=postgres).
 * Applies migrations once, then truncates the schema before every test so
 * suites behave like the in-memory store (always starting clean).
 * Only run this against a dedicated test database.
 */
const url = process.env.DATABASE_URL || 'postgres://radar:radar@127.0.0.1:5432/radar_test';
let migrated: Promise<void> | undefined;
let pool: pg.Pool | undefined;

beforeEach(async () => {
  migrated ??= runMigrations(url).then(() => undefined);
  await migrated;
  pool ??= new pg.Pool({ connectionString: url });
  // Truncate every data table (not a hand-picked list that drifts as migrations add
  // tables — model_decisions and research_fx once leaked state between tests).
  // schema_migrations stays: it is the migrator's own bookkeeping.
  const tables = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  if (tables.rows.length) {
    const list = tables.rows.map((r: { tablename: string }) => `"${r.tablename}"`).join(', ');
    await pool.query(`TRUNCATE ${list} CASCADE`);
  }
});

afterAll(async () => {
  await pool?.end();
});
