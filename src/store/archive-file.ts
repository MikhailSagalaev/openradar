// Cold archive files shared by both stores: one gzipped JSONL file per UTC month,
// `leads-YYYY-MM.jsonl.gz`. A file is written to a temp name and renamed into place, so
// a crash never leaves a partial month file that later runs would skip forever.
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { randomUUID } from 'node:crypto';

/** Rows per page when a store reads a month for export or compaction. */
export const ARCHIVE_PAGE_SIZE = 2000;
/** Rows per UPDATE/DELETE batch of the lifecycle jobs. */
export const LIFECYCLE_BATCH_SIZE = 5000;

/**
 * A lead counts as exported (safe to compact or delete) when its month file exists and the
 * lead was archived before that file was written. Rows archived later (a lead inserted with
 * a backdated created_at after its month went out) are not in the file and stay full. The
 * slack absorbs coarse file mtimes and a database clock slightly ahead of the app's.
 */
export const EXPORT_CLOCK_SLACK_MS = 10 * 60 * 1000;

/** `YYYY-MM` of an ISO timestamp, always in UTC. */
export function utcMonthOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 7);
}

/** [start, end) of a `YYYY-MM` month in UTC, as ISO strings. */
export function utcMonthBounds(month: string): { start: string; end: string } {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  return {
    start: new Date(Date.UTC(year, mon - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, mon, 1)).toISOString(),
  };
}

/** The month is over (its UTC end) no later than `before` (ms). */
export function utcMonthEndsBy(month: string, before: number): boolean {
  return Date.parse(utcMonthBounds(month).end) <= before;
}

export function archiveFileOf(dir: string, month: string): string {
  return join(dir, `leads-${month}.jsonl.gz`);
}

/** When the month's file was written (its mtime), or undefined if it is not on disk yet. */
export function archivedMonthWrittenAt(dir: string, month: string): Date | undefined {
  const file = archiveFileOf(dir, month);
  if (!existsSync(file)) return undefined;
  return statSync(file).mtime;
}

/**
 * Streams JSON lines into `file` through gzip: temp file first, then an atomic rename.
 * Lines are joined with '\n' (no trailing newline), the format the export always had.
 */
export async function writeJsonlGzAtomic(file: string, rows: AsyncIterable<unknown>): Promise<void> {
  mkdirSync(join(file, '..'), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  async function* lines(): AsyncGenerator<string> {
    let first = true;
    for await (const row of rows) {
      yield (first ? '' : '\n') + JSON.stringify(row);
      first = false;
    }
  }
  try {
    await pipeline(Readable.from(lines()), createGzip(), createWriteStream(tmp));
    renameSync(tmp, file);
  } catch (error) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw error;
  }
}
