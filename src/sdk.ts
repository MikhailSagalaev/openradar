import type { SinkAdapter, SourceAdapter } from './core/types.ts';

/**
 * Compile-time helpers for adapter authors.
 *
 * Radar does not load untrusted code at runtime. An adapter is a normal
 * TypeScript module registered in `src/sources/index.ts` or
 * `src/sinks/index.ts`; the helper only preserves the adapter's literal type
 * and gives editors a single place to look.
 */
export function defineSource<T extends SourceAdapter>(adapter: T): T {
  return adapter;
}

export function defineSink<T extends SinkAdapter>(sink: T): T {
  return sink;
}
