import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { observationToRawLead, parseObservation } from '../core/observation.ts';
import type { SourceRecord } from '../core/types.ts';
import { ingestRawLead, type IngestDeps } from '../pipeline/ingest.ts';

/** Totals of one `radar push` run. */
export interface PushSummary {
  received: number;
  accepted: number;
  duplicate: number;
  rejected: number;
  errors: string[];
}

export function emptySummary(): PushSummary {
  return { received: 0, accepted: 0, duplicate: 0, rejected: 0, errors: [] };
}

function note(summary: PushSummary, line: number, message: string): void {
  summary.rejected += 1;
  if (summary.errors.length < 20) summary.errors.push(`line ${line}: ${message}`);
}

/** Reads NDJSON observations and yields them in batches, with their line numbers. */
export async function* readNdjsonBatches(
  input: Readable,
  batchSize: number,
  summary: PushSummary,
): AsyncGenerator<Array<{ line: number; value: unknown }>> {
  const rl = createInterface({ input, crlfDelay: Infinity });
  let batch: Array<{ line: number; value: unknown }> = [];
  let lineNo = 0;
  for await (const text of rl) {
    lineNo += 1;
    if (!text.trim()) continue;
    summary.received += 1;
    try {
      batch.push({ line: lineNo, value: JSON.parse(text) });
    } catch {
      note(summary, lineNo, 'invalid JSON');
      continue;
    }
    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) yield batch;
}

/** Ingests NDJSON observations into the local store. */
export async function pushLocal(input: Readable, source: SourceRecord, deps: IngestDeps): Promise<PushSummary> {
  const summary = emptySummary();
  for await (const batch of readNdjsonBatches(input, 100, summary)) {
    for (const { line, value } of batch) {
      const parsed = parseObservation(value);
      if (!parsed.ok || !parsed.observation) {
        note(summary, line, parsed.error ?? 'invalid observation');
        continue;
      }
      const outcome = await ingestRawLead(observationToRawLead(parsed.observation, source.id), source, deps);
      if (outcome.status === 'duplicate') summary.duplicate += 1;
      else if (outcome.status === 'rejected') summary.rejected += 1;
      else summary.accepted += 1;
    }
  }
  return summary;
}

/** Sends NDJSON observations to a remote node or hub (`POST /api/v2/ingest/:sourceId`) in batches of 500. */
export async function pushRemote(
  input: Readable,
  options: { url: string; sourceId: string; token: string; fetchImpl?: typeof fetch },
): Promise<PushSummary> {
  const summary = emptySummary();
  const endpoint = new URL(`/api/v2/ingest/${encodeURIComponent(options.sourceId)}`, options.url).toString();
  const doFetch = options.fetchImpl ?? fetch;
  for await (const batch of readNdjsonBatches(input, 500, summary)) {
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-radar-token': options.token },
      body: JSON.stringify(batch.map((b) => b.value)),
    });
    if (!res.ok) {
      throw new Error(`${endpoint}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    const body = (await res.json()) as {
      accepted?: number;
      duplicate?: number;
      rejected?: number;
      outcomes?: Array<{ status: string; reasons?: string[] }>;
    };
    summary.accepted += body.accepted ?? 0;
    summary.duplicate += body.duplicate ?? 0;
    summary.rejected += body.rejected ?? 0;
    body.outcomes?.forEach((o, i) => {
      if (o.status === 'rejected' && summary.errors.length < 20) {
        summary.errors.push(`line ${batch[i]?.line}: ${(o.reasons ?? []).join(', ')}`);
      }
    });
  }
  return summary;
}
