import tls from 'node:tls';

/**
 * Key exchange groups for outgoing TLS. Node 22 with OpenSSL 3.5 offers the post-quantum
 * X25519MLKEM768 share by default, which makes the ClientHello span two packets; some
 * networks (Russian ТСПУ among them) drop such handshakes, and every HTTPS request to the
 * affected hosts times out while connecting. The classic groups keep TLS 1.3 and fit in one
 * packet. RADAR_TLS_GROUPS overrides them; "auto" restores Node's default.
 */
export const DEFAULT_TLS_GROUPS = 'X25519:prime256v1:secp384r1';

export function applyTlsGroups(value: string | undefined = process.env.RADAR_TLS_GROUPS): void {
  const groups = value?.trim() || DEFAULT_TLS_GROUPS;
  if (groups === 'auto') return;
  tls.DEFAULT_ECDH_CURVE = groups;
}

applyTlsGroups();
