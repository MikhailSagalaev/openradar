import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import type { Runtime } from '../runtime.ts';

const STATE_COOKIE = 'radar_oauth_state';
const RETURN_TO_COOKIE = 'radar_oauth_return_to';
const STATE_TTL_SEC = 600;
const SESSION_TTL_SEC = 30 * 24 * 3600;

export function githubOAuthConfigured(runtime: Runtime): boolean {
  return Boolean(runtime.env.GITHUB_CLIENT_ID && runtime.env.GITHUB_CLIENT_SECRET);
}

/** OAuth redirect base: RADAR_PUBLIC_URL when configured, never a client-chosen Host otherwise unchecked. */
function baseUrlOf(c: Context, runtime: Runtime): string {
  const configured = runtime.env.RADAR_PUBLIC_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  const host = c.req.header('host') ?? new URL(c.req.url).host;
  const proto = c.req.header('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

function secureCookie(c: Context): boolean {
  return c.req.header('x-forwarded-proto') === 'https';
}

function loginRedirect(c: Context, reason: string): Response {
  return c.redirect(`/login?error=${encodeURIComponent(reason)}`);
}

export function startGitHubOAuth(c: Context, runtime: Runtime): Response {
  if (!githubOAuthConfigured(runtime)) {
    return loginRedirect(c, 'GitHub OAuth не настроен на этом сервере (GITHUB_CLIENT_ID/SECRET).');
  }
  const state = randomBytes(16).toString('hex');
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: secureCookie(c),
    path: '/auth/github/callback',
    maxAge: STATE_TTL_SEC,
  });

  const rawReturnTo = c.req.query('returnTo');
  if (rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')) {
    setCookie(c, RETURN_TO_COOKIE, rawReturnTo, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: secureCookie(c),
      path: '/auth/github/callback',
      maxAge: STATE_TTL_SEC,
    });
  }

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', runtime.env.GITHUB_CLIENT_ID!);
  authorizeUrl.searchParams.set('redirect_uri', `${baseUrlOf(c, runtime)}/auth/github/callback`);
  authorizeUrl.searchParams.set('scope', 'read:user');
  authorizeUrl.searchParams.set('state', state);
  return c.redirect(authorizeUrl.toString());
}

interface GitHubProfile {
  id?: number;
  login?: string;
  created_at?: string;
}

export async function handleGitHubCallback(c: Context, runtime: Runtime): Promise<Response> {
  const expectedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/auth/github/callback' });

  const fail = (reason: string): Response => loginRedirect(c, reason);
  if (!githubOAuthConfigured(runtime)) return fail('GitHub OAuth не настроен на этом сервере.');

  const state = c.req.query('state');
  const code = c.req.query('code');
  if (!expectedState || !state || expectedState !== state) {
    return fail('Недействительный state — повторите вход.');
  }
  if (!code) return fail('GitHub не вернул код авторизации.');

  const tokenRes = await runtime.fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: runtime.env.GITHUB_CLIENT_ID,
      client_secret: runtime.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${baseUrlOf(c, runtime)}/auth/github/callback`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) return fail(`GitHub token endpoint ответил ${tokenRes.status}.`);
  const tokenBody = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null;
  const accessToken = tokenBody?.access_token;
  if (!accessToken) return fail('GitHub не вернул access_token.');

  const profileRes = await runtime.fetchImpl('https://api.github.com/user', {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!profileRes.ok) return fail(`GitHub API ответил ${profileRes.status}.`);
  const profile = (await profileRes.json().catch(() => null)) as GitHubProfile | null;
  if (!profile?.id || !profile.login) return fail('Не удалось прочитать профиль GitHub.');

  if (!runtime.store.upsertGitHubUser || !runtime.store.createSession) {
    return fail('Хранилище не поддерживает пользователей.');
  }
  const user = await runtime.store.upsertGitHubUser({
    githubId: profile.id,
    handle: profile.login,
    githubCreatedAt: profile.created_at && !Number.isNaN(Date.parse(profile.created_at))
      ? new Date(profile.created_at).toISOString()
      : undefined,
  });

  const sessionId = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString();
  await runtime.store.createSession(sessionId, expiresAt, user.id);
  setCookie(c, 'radar_session', sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: secureCookie(c),
    path: '/',
    maxAge: SESSION_TTL_SEC,
  });
  const returnTo = getCookie(c, RETURN_TO_COOKIE);
  deleteCookie(c, RETURN_TO_COOKIE, { path: '/auth/github/callback' });

  const safeTarget = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/';
  return c.redirect(safeTarget);
}
