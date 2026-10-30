import tls from 'node:tls';
import { afterEach, describe, expect, it } from 'vitest';
import { applyTlsGroups, DEFAULT_TLS_GROUPS } from '../src/net/tls.ts';

describe('outgoing TLS groups', () => {
  const original = tls.DEFAULT_ECDH_CURVE;
  afterEach(() => {
    tls.DEFAULT_ECDH_CURVE = original;
  });

  it('offers the classic groups unless told otherwise', () => {
    tls.DEFAULT_ECDH_CURVE = 'auto';
    applyTlsGroups(undefined);
    expect(tls.DEFAULT_ECDH_CURVE).toBe(DEFAULT_TLS_GROUPS);
    applyTlsGroups('X25519');
    expect(tls.DEFAULT_ECDH_CURVE).toBe('X25519');
  });

  it('leaves Node default for "auto"', () => {
    tls.DEFAULT_ECDH_CURVE = 'auto';
    applyTlsGroups('auto');
    expect(tls.DEFAULT_ECDH_CURVE).toBe('auto');
  });
});
