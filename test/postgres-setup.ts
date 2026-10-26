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
  await pool.query(
    `TRUNCATE deliveries, runs, leads, sources, sessions,
     lead_deliveries, app_users, lead_votes, participants, events, auth_replay, contact_flags CASCADE`,
  );
});

afterAll(async () => {
  await pool?.end();
});
