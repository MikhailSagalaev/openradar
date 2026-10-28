/**
 * GigaChat (Sber) for model extraction. The chat API is OpenAI-shaped, but it takes a
 * 30-minute token issued for the authorization key, and its hosts chain to the Russian
 * Trusted Root CA, which Node does not trust: requests here trust it, the rest of the
 * process does not.
 */
import { randomUUID } from 'node:crypto';
import { request } from 'node:https';
import { rootCertificates } from 'node:tls';
import type { Env } from '../core/types.ts';
import { RUSSIAN_TRUSTED_ROOT_CA } from './russian-root-ca.ts';

const CA = [...rootCertificates, RUSSIAN_TRUSTED_ROOT_CA];

/** A minimal fetch over node:https with the extra root: string bodies, JSON answers. */
export const gigachatFetch: typeof fetch = (input, init) =>
  new Promise((resolve, reject) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const req = request(url, { method: init?.method ?? 'GET', headers, ca: CA, signal: init?.signal ?? undefined }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 502 })));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(typeof init?.body === 'string' ? init.body : undefined);
  });

let token: { key: string; value: string; expiresAt: number } | undefined;

export function resetGigachatToken(): void {
  token = undefined;
}

/** The access token, reused until a minute before it expires. */
export async function gigachatToken(env: Env, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<string> {
  const key = env.GIGACHAT_AUTH_KEY ?? '';
  if (token && token.key === key && token.expiresAt - 60_000 > Date.now()) return token.value;
  const response = await fetchImpl(env.GIGACHAT_OAUTH_URL, {
    method: 'POST',
    signal,
    headers: {
      authorization: `Basic ${key}`,
      rquid: randomUUID(),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: `scope=${encodeURIComponent(env.GIGACHAT_SCOPE)}`,
  });
  if (!response.ok) throw new Error(`GigaChat token: HTTP ${response.status}`);
  const answer = (await response.json()) as { access_token?: string; expires_at?: number };
  if (!answer.access_token) throw new Error('GigaChat token: no access_token');
  // expires_at comes in milliseconds; seconds are accepted too.
  const expires = answer.expires_at ?? Date.now() + 29 * 60_000;
  token = { key, value: answer.access_token, expiresAt: expires < 1e12 ? expires * 1000 : expires };
  return token.value;
}
