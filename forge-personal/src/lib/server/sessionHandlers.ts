import { hashSessionToken, issueSession, verifyAccessKey, verifySession } from './auth';
import type { SessionStore } from './sessionStore';

export const SESSION_COOKIE = 'forge_session';
const SESSION_TTL_SECONDS = 43_200;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1_000;

interface SessionConfig {
  accessKeyHash: string;
  sessionSecret: string;
  secureCookies: boolean;
  sessions: SessionStore;
  workspaceId?: string;
}

function configured(config: SessionConfig): boolean {
  return /^[0-9a-f]{64}$/i.test(config.accessKeyHash) && config.sessionSecret.length >= 32;
}

function cookie(value: string, secure: boolean, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict`;
}

function cookieValue(header: string | null, name: string): string | undefined {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function createSessionHandlers(config: SessionConfig) {
  const workspaceId = config.workspaceId ?? 'personal';
  return {
    async POST(request: Request): Promise<Response> {
      if (!configured(config)) return Response.json({ error: 'PERSISTENCE_NOT_CONFIGURED' }, { status: 503 });
      let body: unknown;
      try { body = await request.json(); } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }); }
      const accessKey = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>).accessKey : undefined;
      if (typeof accessKey !== 'string' || !(await verifyAccessKey(accessKey, config.accessKeyHash))) {
        return Response.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
      }
      const nonce = crypto.randomUUID();
      const token = await issueSession(config.sessionSecret, { ttlMs: SESSION_TTL_MS, nonce });
      const verified = await verifySession(token, config.sessionSecret);
      if (!verified.valid) return Response.json({ error: 'SESSION_ISSUE_FAILED' }, { status: 500 });
      await config.sessions.create({
        id: nonce,
        workspaceId,
        tokenHash: await hashSessionToken(token),
        expiresAt: new Date(verified.expiresAt),
      });
      return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie(token, config.secureCookies), 'Cache-Control': 'no-store' } });
    },
    async DELETE(request: Request): Promise<Response> {
      const token = cookieValue(request.headers.get('cookie'), SESSION_COOKIE);
      if (token) await config.sessions.revoke(await hashSessionToken(token));
      return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie('', config.secureCookies, 0), 'Cache-Control': 'no-store' } });
    },
  };
}
