// A relay for model APIs that refuse the hub's network (Groq answers 403 to Russian
// addresses). It forwards /<RELAY_TOKEN>/openai/v1/* to Groq and nothing else: the path
// token keeps it from being an open proxy, and the caller's own API key goes through as is.
export const config = { runtime: 'edge' };

const UPSTREAM = process.env.RELAY_UPSTREAM || 'https://api.groq.com';

export default async function handler(request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/([^/]+)(\/openai\/v1\/[a-z0-9/_.-]+)$/i);
  const token = process.env.RELAY_TOKEN;
  if (!token || !match || match[1] !== token) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  for (const name of ['authorization', 'content-type', 'accept']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetch(`${UPSTREAM}${match[2]}${url.search}`, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    duplex: 'half',
  });
  // Rate-limit headers stay: the hub pauses on 429 by Retry-After.
  const out = new Headers();
  for (const [name, value] of upstream.headers) if (/^(content-type|retry-after|x-ratelimit-)/i.test(name)) out.set(name, value);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
