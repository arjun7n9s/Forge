import { describe, expect, it, vi } from 'vitest';
import type { StoreSnapshot } from '@/lib/domain/types';
import { loadWorkspace, loginWorkspace, logoutWorkspace, PersistenceConflict, saveWorkspace } from '@/lib/store/persistenceClient';

const EMPTY: StoreSnapshot = { notes: [], drafts: [], auditEvents: [], hashChains: {} };
const response = (body: unknown, status: number) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('workspace persistence client', () => {
  it('distinguishes server, locked, and explicit local-only modes', async () => {
    const serverFetch = vi.fn().mockResolvedValue(response({ revision: 7, snapshot: EMPTY }, 200));
    await expect(loadWorkspace(serverFetch)).resolves.toEqual({ mode: 'server', revision: 7, snapshot: EMPTY });
    await expect(loadWorkspace(vi.fn().mockResolvedValue(response({ error: 'UNAUTHORIZED' }, 401)))).resolves.toEqual({ mode: 'locked' });
    await expect(loadWorkspace(vi.fn().mockResolvedValue(response({ error: 'PERSISTENCE_NOT_CONFIGURED' }, 503)))).resolves.toEqual({ mode: 'local', reason: 'PERSISTENCE_NOT_CONFIGURED' });
  });

  it('logs in without persisting the access key client-side', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(loginWorkspace('correct horse battery staple', fetcher)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith('/api/session', expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: JSON.stringify({ accessKey: 'correct horse battery staple' }) }));
  });

  it('revokes the server session on logout', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await logoutWorkspace(fetcher);
    expect(fetcher).toHaveBeenCalledWith('/api/session', { method: 'DELETE', credentials: 'same-origin' });
  });

  it('returns the next revision and exposes conflicts distinctly', async () => {
    await expect(saveWorkspace(EMPTY, 4, vi.fn().mockResolvedValue(response({ revision: 5 }, 200)))).resolves.toBe(5);
    await expect(saveWorkspace(EMPTY, 4, vi.fn().mockResolvedValue(response({ error: 'REVISION_CONFLICT', actualRevision: 6 }, 409)))).rejects.toEqual(new PersistenceConflict(6));
  });
});
