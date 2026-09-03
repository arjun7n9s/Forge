export interface StoredSession {
  id: string;
  workspaceId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface SessionStore {
  create(session: Omit<StoredSession, 'revokedAt'>): Promise<void>;
  lookup(tokenHash: string): Promise<StoredSession | null>;
  revoke(tokenHash: string): Promise<void>;
}

type Queryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

export function createMemorySessionStore(): SessionStore {
  const rows = new Map<string, StoredSession>();
  return {
    async create(session) {
      rows.set(session.tokenHash, { ...session, revokedAt: null });
    },
    async lookup(tokenHash) {
      return rows.get(tokenHash) ?? null;
    },
    async revoke(tokenHash) {
      const current = rows.get(tokenHash);
      if (current && current.revokedAt === null) rows.set(tokenHash, { ...current, revokedAt: new Date() });
    },
  };
}

export function createSessionStore(database: Queryable): SessionStore {
  return {
    async create(session) {
      await database.query(
        'INSERT INTO workspace_sessions (id, workspace_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
        [session.id, session.workspaceId, session.tokenHash, session.expiresAt.toISOString()],
      );
    },
    async lookup(tokenHash) {
      const result = await database.query<{ id: string; workspace_id: string; token_hash: string; expires_at: string | Date; revoked_at: string | Date | null }>(
        'SELECT id, workspace_id, token_hash, expires_at, revoked_at FROM workspace_sessions WHERE token_hash = $1',
        [tokenHash],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        tokenHash: row.token_hash,
        expiresAt: new Date(row.expires_at),
        revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      };
    },
    async revoke(tokenHash) {
      await database.query(
        'UPDATE workspace_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [tokenHash],
      );
    },
  };
}

export function sessionIsActive(session: StoredSession | null, nowMs = Date.now()): boolean {
  return Boolean(session && session.revokedAt === null && session.expiresAt.getTime() > nowMs);
}
