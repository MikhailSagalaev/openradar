/**
 * Cloudflare Worker: Groq API Reverse Proxy
 *
 * Bypasses Cloudflare WAF geo-blocking and Tor exit filtering for api.groq.com.
 * Runs on Cloudflare Edge (100,000 requests/day free).
 *
 * Deployment:
 * 1. Open Cloudflare Dashboard -> Compute (Workers) -> Click your worker -> Edit Code
 * 2. Paste this code into the editor, click "Deploy"
 * 3. (Optional) Set GROQ_API_KEY in Worker Settings -> Variables and Secrets -> Add GROQ_API_KEY
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

    // Determine the Groq API key:
    // Can be passed via Authorization header OR configured in Worker secret GROQ_API_KEY.
    let auth = request.headers.get('authorization');
    if (!auth && env?.GROQ_API_KEY) {
      auth = `Bearer ${env.GROQ_API_KEY}`;
    }

    if (!auth) {
      return new Response(JSON.stringify({ error: { message: 'Missing Authorization header or GROQ_API_KEY secret' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const targetUrl = new URL(url.pathname + url.search, 'https://api.groq.com');

    // Build completely clean headers to avoid leaking client IP / country (CF-IPCountry / X-Forwarded-For)
    // to Groq's Cloudflare WAF.
    const cleanHeaders = new Headers();
    cleanHeaders.set('host', 'api.groq.com');
    cleanHeaders.set('authorization', auth);
    cleanHeaders.set('user-agent', 'openradar/1.0');

    const contentType = request.headers.get('content-type');
    if (contentType) cleanHeaders.set('content-type', contentType);

    const accept = request.headers.get('accept');
    if (accept) cleanHeaders.set('accept', accept);

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: cleanHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
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
