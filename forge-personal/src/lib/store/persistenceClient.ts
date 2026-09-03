import type { StoreSnapshot } from '@/lib/domain/types';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type PersistenceMode = 'loading' | 'server' | 'locked' | 'local' | 'conflict' | 'error';

export type WorkspaceLoad =
  | { mode: 'server'; revision: number; snapshot: StoreSnapshot | null }
  | { mode: 'locked' }
  | { mode: 'local'; reason: string };

export class PersistenceConflict extends Error {
  constructor(readonly actualRevision: number) {
    super('REVISION_CONFLICT');
    this.name = 'PersistenceConflict';
  }
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === 'string' ? body.error : `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}

export async function loadWorkspace(fetcher: Fetcher = fetch): Promise<WorkspaceLoad> {
  try {
    const response = await fetcher('/api/workspace', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) return { mode: 'locked' };
    if (!response.ok) return { mode: 'local', reason: await errorCode(response) };
    const body = await response.json() as { revision?: unknown; snapshot?: unknown };
    if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 0 || (body.snapshot !== null && (typeof body.snapshot !== 'object' || Array.isArray(body.snapshot)))) {
      return { mode: 'local', reason: 'INVALID_PERSISTENCE_RESPONSE' };
    }
    return { mode: 'server', revision: body.revision as number, snapshot: body.snapshot as StoreSnapshot | null };
  } catch {
    return { mode: 'local', reason: 'PERSISTENCE_UNREACHABLE' };
  }
}

export async function loginWorkspace(accessKey: string, fetcher: Fetcher = fetch): Promise<boolean> {
  const response = await fetcher('/api/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessKey }),
  });
  if (response.status === 204) return true;
  if (response.status === 401) return false;
  throw new Error(await errorCode(response));
}

export async function logoutWorkspace(fetcher: Fetcher = fetch): Promise<void> {
  await fetcher('/api/session', { method: 'DELETE', credentials: 'same-origin' });
}

export async function saveWorkspace(snapshot: StoreSnapshot, revision: number, fetcher: Fetcher = fetch): Promise<number> {
  const response = await fetcher('/api/workspace', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision, snapshot }),
  });
  const body = await response.json() as { revision?: unknown; actualRevision?: unknown; error?: unknown };
  if (response.status === 409 && Number.isSafeInteger(body.actualRevision)) throw new PersistenceConflict(body.actualRevision as number);
  if (!response.ok || !Number.isSafeInteger(body.revision)) throw new Error(typeof body.error === 'string' ? body.error : `HTTP_${response.status}`);
  return body.revision as number;
}
