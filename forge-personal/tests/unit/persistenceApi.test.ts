import { describe, expect, it, vi } from 'vitest';
import { hashAccessKey, issueSession } from '@/lib/server/auth';
import { createSessionHandlers, SESSION_COOKIE } from '@/lib/server/sessionHandlers';
import { createMemorySessionStore } from '@/lib/server/sessionStore';
import { createWorkspaceHandlers } from '@/lib/server/workspaceHandlers';

const EMPTY = { notes: [], drafts: [], auditEvents: [], hashChains: {} };
const SECRET = 'session-secret-with-at-least-32-characters';

function jsonRequest(url: string, method: string, body: unknown, cookie?: string) {
  return new Request(url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

describe('personal persistence API handlers', () => {
  it('issues an HttpOnly strict cookie only for the configured access key', async () => {
    const handlers = createSessionHandlers({ accessKeyHash: await hashAccessKey('correct horse battery staple'), sessionSecret: SECRET, secureCookies: true, sessions: createMemorySessionStore() });
    const denied = await handlers.POST(jsonRequest('https://forge.example/api/session', 'POST', { accessKey: 'incorrect-access-key' }));
    expect(denied.status).toBe(401);
    expect(denied.headers.get('set-cookie')).toBeNull();

    const accepted = await handlers.POST(jsonRequest('https://forge.example/api/session', 'POST', { accessKey: 'correct horse battery staple' }));
    expect(accepted.status).toBe(204);
    expect(accepted.headers.get('set-cookie')).toMatch(new RegExp(`^${SESSION_COOKIE}=.+; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict`));
  });

  it('fails closed when authentication is not configured', async () => {
    const handlers = createSessionHandlers({ accessKeyHash: '', sessionSecret: '', secureCookies: false, sessions: createMemorySessionStore() });
    const response = await handlers.POST(jsonRequest('http://localhost/api/session', 'POST', { accessKey: 'any sufficiently long key' }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'PERSISTENCE_NOT_CONFIGURED' });
  });

  it('requires a valid session for reads and writes', async () => {
    const store = { read: vi.fn().mockResolvedValue(null), write: vi.fn() };
    const handlers = createWorkspaceHandlers({ sessionSecret: SECRET, store, sessions: createMemorySessionStore() });
    expect((await handlers.GET(new Request('https://forge.example/api/workspace'))).status).toBe(401);
    expect((await handlers.PUT(jsonRequest('https://forge.example/api/workspace', 'PUT', { revision: 0, snapshot: EMPTY }))).status).toBe(401);
    expect(store.read).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it('returns workspace state and maps optimistic conflicts to 409', async () => {
    const sessions = createMemorySessionStore();
    const login = createSessionHandlers({ accessKeyHash: await hashAccessKey('correct horse battery staple'), sessionSecret: SECRET, secureCookies: false, sessions });
    const accepted = await login.POST(jsonRequest('https://forge.example/api/session', 'POST', { accessKey: 'correct horse battery staple' }));
    const cookie = accepted.headers.get('set-cookie')?.split(';')[0];
    const store = {
      read: vi.fn().mockResolvedValue({ revision: 3, snapshot: EMPTY }),
      write: vi.fn().mockResolvedValue({ ok: false, actualRevision: 4 }),
    };
    const handlers = createWorkspaceHandlers({ sessionSecret: SECRET, store, sessions });
    const read = await handlers.GET(new Request('https://forge.example/api/workspace', { headers: { cookie: cookie ?? '' } }));
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toEqual({ revision: 3, snapshot: EMPTY });

    const write = await handlers.PUT(jsonRequest('https://forge.example/api/workspace', 'PUT', { revision: 3, snapshot: EMPTY }, cookie));
    expect(write.status).toBe(409);
    await expect(write.json()).resolves.toEqual({ error: 'REVISION_CONFLICT', actualRevision: 4 });
  });

  it('rejects workspace access after server-side session revocation', async () => {
    const sessions = createMemorySessionStore();
    const login = createSessionHandlers({ accessKeyHash: await hashAccessKey('correct horse battery staple'), sessionSecret: SECRET, secureCookies: false, sessions });
    const accepted = await login.POST(jsonRequest('https://forge.example/api/session', 'POST', { accessKey: 'correct horse battery staple' }));
    const cookie = accepted.headers.get('set-cookie')?.split(';')[0] ?? '';
    const store = { read: vi.fn().mockResolvedValue(null), write: vi.fn() };
    const workspace = createWorkspaceHandlers({ sessionSecret: SECRET, store, sessions });
    expect((await workspace.GET(new Request('https://forge.example/api/workspace', { headers: { cookie } }))).status).toBe(200);

    await login.DELETE(new Request('https://forge.example/api/session', { method: 'DELETE', headers: { cookie } }));
    expect((await workspace.GET(new Request('https://forge.example/api/workspace', { headers: { cookie } }))).status).toBe(401);
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  it('does not accept a signed token that was never persisted', async () => {
    const token = await issueSession(SECRET);
    const store = { read: vi.fn(), write: vi.fn() };
    const handlers = createWorkspaceHandlers({ sessionSecret: SECRET, store, sessions: createMemorySessionStore() });
    expect((await handlers.GET(new Request('https://forge.example/api/workspace', { headers: { cookie: `${SESSION_COOKIE}=${token}` } }))).status).toBe(401);
    expect(store.read).not.toHaveBeenCalled();
  });
});
