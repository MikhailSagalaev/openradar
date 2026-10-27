import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const { Pool } = pg;
const ADVISORY_LOCK_ID = 8791001;

export interface MigrationResult {
  applied: string[];
}

export function findMigrationsDir(): string {
  // Search in possible locations (development / tsx / compiled / docker)
  const candidates = [
    join(process.cwd(), 'migrations'),
    resolve(import.meta.dirname, '../../migrations'),
    resolve(import.meta.dirname, '../migrations'),
    '/app/migrations',
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return join(process.cwd(), 'migrations');
}

export async function runMigrations(target: pg.Pool | string): Promise<MigrationResult> {
  const pool = typeof target === 'string' ? new Pool({ connectionString: target }) : target;
  const shouldClosePool = typeof target === 'string';

  const client = await pool.connect();
  const applied: string[] = [];

  try {
    // 1. Блокировка на уровне advisory lock для исключения race condition
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);

    // 2. Создание служебной таблицы версий
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 3. Получение списка уже примененных миграций
    const res = await client.query('SELECT name FROM schema_migrations');
    const existing = new Set(res.rows.map((r: { name: string }) => r.name));

    // 4. Чтение файлов миграций
    const migrationsDir = findMigrationsDir();
    const files = existsSync(migrationsDir)
      ? readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.sql'))
          .sort()
      : [];

    for (const file of files) {
      if (existing.has(file)) continue;

      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, 'utf-8');

      // Применяем в транзакции
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { applied };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch {
      // ignore unlock error
    }
    client.release();
    if (shouldClosePool) {
      await pool.end();
    }
  }
}

export async function checkMigrations(pool: pg.Pool): Promise<{ ok: boolean; pending: string[] }> {
  const client = await pool.connect();
  try {
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'schema_migrations'
      ) as exists;
    `);

    if (!tableCheck.rows[0]?.exists) {
      return { ok: false, pending: ['all'] };
    }

    const res = await client.query('SELECT name FROM schema_migrations');
    const existing = new Set(res.rows.map((r: { name: string }) => r.name));

    const migrationsDir = findMigrationsDir();
    const files = existsSync(migrationsDir)
      ? readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.sql'))
          .sort()
      : [];

    const pending = files.filter((f) => !existing.has(f));
    return { ok: pending.length === 0, pending };
  } finally {
    client.release();
  }
}
