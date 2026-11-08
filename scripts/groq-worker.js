/**
 * Cloudflare Worker: Groq API Reverse Proxy
 *
 * Bypasses Cloudflare WAF geo-blocking and Tor exit filtering for api.groq.com.
 * Runs on Cloudflare Edge (100,000 requests/day free).
 *
 * Deployment:
 * 1. Open Cloudflare Dashboard -> Compute (Workers) -> Create application -> Create Worker
 * 2. Paste this code into the editor, click "Deploy"
 * 3. Copy your worker URL: https://<worker-name>.<subdomain>.workers.dev
 * 4. In .env on the server:
 *    GROQ_BASE_URL=https://<worker-name>.<subdomain>.workers.dev/openai/v1
 *    GROQ_API_KEY=gsk_...
 */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // Require Authorization header to prevent public abuse
    const auth = request.headers.get('authorization');
    if (!auth) {
      return new Response(JSON.stringify({ error: { message: 'Missing Authorization header' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const targetUrl = new URL(url.pathname + url.search, 'https://api.groq.com');

    const headers = new Headers(request.headers);
    headers.set('host', 'api.groq.com');
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ray');
    headers.delete('cf-visitor');

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'follow',
      });
      return response;
    } catch (err) {
      return new Response(JSON.stringify({ error: { message: err instanceof Error ? err.message : String(err) } }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }
  },
};
