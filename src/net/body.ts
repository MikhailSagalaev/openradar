/**
 * Bounded reads of HTTP response bodies. A broken or hostile feed must not be able to
 * fill the node's memory: the body is streamed and the read stops past the limit.
 */

/** Ten megabytes: far above any real page or feed we parse. */
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export class ResponseTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`Response body exceeds ${limit} bytes`);
    this.name = 'ResponseTooLargeError';
  }
}

/** The part of a fetch Response we use; global fetch and undici both fit. */
interface ReadableResponse {
  headers: { get(name: string): string | null };
  body: {
    getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> };
    cancel(): Promise<void>;
  } | null;
  text(): Promise<string>;
}

export async function readTextLimited(response: ReadableResponse, limit: number = MAX_RESPONSE_BYTES): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => {});
    throw new ResponseTooLargeError(limit);
  }
  // Test doubles and some fetch implementations have no stream; their bodies are in memory already.
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel().catch(() => {});
      throw new ResponseTooLargeError(limit);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function readJsonLimited<T = unknown>(response: ReadableResponse, limit: number = MAX_RESPONSE_BYTES): Promise<T> {
  return JSON.parse(await readTextLimited(response, limit)) as T;
}
