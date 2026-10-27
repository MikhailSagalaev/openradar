export * from './core/types.ts';
export * from './core/store.ts';
export { canonicalizeUrl } from './core/url.ts';
export { fingerprintOf, titleKeyOf } from './core/fingerprint.ts';
export { applyRules, scoreLead, recalculateVoteScoreAndStatus } from './core/rules.ts';
export { prepareRawLead } from './core/prepare.ts';
export { defineSink, defineSource } from './sdk.ts';
export { VERSION } from './version.ts';

export { createRuntime, type Runtime } from './runtime.ts';
export { PostgresStore } from './store/postgres.ts';
export { MemoryStore } from './store/memory.ts';

export { createSourceRegistry, SourceRegistry } from './sources/index.ts';
export { createSinkRegistry, SinkRegistry } from './sinks/index.ts';

export { ingestRawLead, ingestRawLeads } from './pipeline/ingest.ts';
export { pollAll, pollSource } from './pipeline/poll.ts';
export { createApp } from './server/app.ts';

// radar/2 protocol and clients
export { HubClient, NodeClient, RadarHttpError, type ObservationInput, type EventResult, type PushSummary } from './client.ts';
export {
  buildHttpAuthHeader,
  buildObservationEvent,
  buildSignalEvent,
  buildStatusEvent,
  signEvent,
  verifyEvent,
  RadarKinds,
  type NostrEvent,
} from './net/protocol.ts';
export { generateKeyPair, importPrivateKey, type KeyPair } from './net/keys.ts';
export { ObservationSchema, parseObservation, type Observation } from './core/observation.ts';
