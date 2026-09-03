import type { StoreSnapshot } from '@/lib/domain/types';
import { hashSessionToken, verifySession } from './auth';
import { SESSION_COOKIE } from './sessionHandlers';
import { sessionIsActive, type SessionStore } from './sessionStore';
import type { WorkspaceWriteResult } from './workspaceStore';

interface WorkspaceStore {
  read(workspaceId: string): Promise<{ revision: number; snapshot: StoreSnapshot } | null>;
  write(workspaceId: string, expectedRevision: number, snapshot: StoreSnapshot): Promise<WorkspaceWriteResult>;
}

interface WorkspaceConfig {
  sessionSecret: string;
  store: WorkspaceStore;
  sessions: SessionStore;
  workspaceId?: string;
}

function cookieValue(header: string | null, name: string): string | undefined {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function authorized(request: Request, secret: string, sessions: SessionStore): Promise<boolean> {
  if (secret.length < 32) return false;
  const token = cookieValue(request.headers.get('cookie'), SESSION_COOKIE);
  if (!token) return false;
  const verified = await verifySession(token, secret);
  if (!verified.valid) return false;
  const session = await sessions.lookup(await hashSessionToken(token));
  return sessionIsActive(session);
}

const noStore = { 'Cache-Control': 'no-store' };

export function createWorkspaceHandlers(config: WorkspaceConfig) {
  const workspaceId = config.workspaceId ?? 'personal';
  return {
    async GET(request: Request): Promise<Response> {
      if (!(await authorized(request, config.sessionSecret, config.sessions))) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers: noStore });
      const state = await config.store.read(workspaceId);
      return Response.json(state ?? { revision: 0, snapshot: null }, { headers: noStore });
    },
    async PUT(request: Request): Promise<Response> {
      if (!(await authorized(request, config.sessionSecret, config.sessions))) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers: noStore });
      let body: unknown;
      try { body = await request.json(); } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400, headers: noStore }); }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return Response.json({ error: 'INVALID_WORKSPACE_WRITE' }, { status: 400, headers: noStore });
      const { revision, snapshot } = body as { revision?: unknown; snapshot?: unknown };
      if (!Number.isSafeInteger(revision) || (revision as number) < 0 || snapshot === undefined) return Response.json({ error: 'INVALID_WORKSPACE_WRITE' }, { status: 400, headers: noStore });
      try {
        const result = await config.store.write(workspaceId, revision as number, snapshot as StoreSnapshot);
        if (!result.ok) return Response.json({ error: 'REVISION_CONFLICT', actualRevision: result.actualRevision }, { status: 409, headers: noStore });
        return Response.json({ revision: result.revision }, { headers: noStore });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('INVALID_WORKSPACE_')) return Response.json({ error: error.message }, { status: 400, headers: noStore });
        throw error;
      }
    },
  };
}
