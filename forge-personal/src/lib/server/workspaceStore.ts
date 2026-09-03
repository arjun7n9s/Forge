import { appendHashLink, verifyHashChain, type HashLink } from '@forge/core';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { Pool } from 'pg';
import type { StoreSnapshot } from '@/lib/domain/types';

const hash = { type: 'string', pattern: '^[0-9a-f]{64}$' } as const;
const timestamp = { type: 'string', minLength: 1 } as const;
const snapshotSchema = {
  type: 'object', additionalProperties: false, required: ['notes', 'drafts', 'auditEvents', 'hashChains'],
  properties: {
    notes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'body', 'doi', 'contentHash', 'createdAt', 'updatedAt'], properties: {
      id: { type: 'string', minLength: 1 }, title: { type: 'string', minLength: 1, maxLength: 240 }, body: { type: 'string' }, doi: { type: 'string' }, contentHash: hash, createdAt: timestamp, updatedAt: timestamp,
    } } },
    drafts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'noteId', 'proposedBody', 'prevHash', 'status', 'cardType', 'provenance', 'createdAt'], properties: {
      id: { type: 'string', minLength: 1 }, noteId: { type: 'string', minLength: 1 }, proposedBody: { type: 'string' }, prevHash: hash,
      status: { enum: ['pending', 'confirmed', 'rejected'] }, cardType: { enum: ['corroborated', 'openalex_only', 'crossref_only', 'disagree', 'eoc_only'] },
      provenance: { type: 'object', additionalProperties: { type: 'string' } }, createdAt: timestamp,
    } } },
    auditEvents: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'eventType', 'resourceId', 'payload', 'createdAt'], properties: {
      id: { type: 'string', minLength: 1 }, eventType: { enum: ['edit.confirmed', 'edit.rejected', 'check.performed', 'tool.registered', 'tool.unregistered', 'firewall.rejected'] },
      resourceId: { type: 'string' }, payload: { type: 'object' }, createdAt: timestamp,
    } } },
    hashChains: { type: 'object', additionalProperties: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['noteId', 'body', 'prevHash', 'hash', 'createdAt'], properties: {
      noteId: { type: 'string', minLength: 1 }, body: { type: 'string' }, prevHash: { type: 'string' }, hash, createdAt: timestamp,
    } } } },
  },
} as const;

const validateSnapshot = new Ajv2020({ allErrors: true, strict: true }).compile<StoreSnapshot>(snapshotSchema);

type QueryResult<T> = { rows: T[] };
export type Queryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};
export type DatabaseClient = Queryable & {
  connect?: () => Promise<Queryable & { release(): void | Promise<void> }>;
};
export type WorkspaceWriteResult = { ok: true; revision: number } | { ok: false; actualRevision: number };
export type StoredAuditLink = HashLink & { eventId: string };

function assertWorkspaceId(workspaceId: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(workspaceId)) throw new Error('INVALID_WORKSPACE_ID');
}

function assertSnapshot(snapshot: unknown): asserts snapshot is StoreSnapshot {
  if (!validateSnapshot(snapshot)) throw new Error('INVALID_WORKSPACE_SNAPSHOT');
}

async function withTransaction<T>(database: DatabaseClient, work: (queryable: Queryable) => Promise<T>): Promise<T> {
  if (!database.connect) return work(database);
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already failed */ }
    throw error;
  } finally {
    await client.release();
  }
}

function eventContent(event: StoreSnapshot['auditEvents'][number]): string {
  return JSON.stringify({ id: event.id, eventType: event.eventType, resourceId: event.resourceId, payload: event.payload, createdAt: event.createdAt });
}

function editContent(draft: StoreSnapshot['drafts'][number]): string {
  return JSON.stringify({ id: draft.id, noteId: draft.noteId, status: draft.status, prevHash: draft.prevHash, proposedBody: draft.proposedBody });
}

export async function verifyStoredAuditChain(links: readonly HashLink[]) {
  return verifyHashChain(links);
}

export function createWorkspaceStore(database: DatabaseClient) {
  return {
    async read(workspaceId: string): Promise<{ revision: number; snapshot: StoreSnapshot } | null> {
      assertWorkspaceId(workspaceId);
      const result = await database.query<{ revision: string | number; snapshot: unknown }>(
        'SELECT revision, snapshot FROM workspace_state WHERE workspace_id = $1',
        [workspaceId],
      );
      const row = result.rows[0];
      if (!row) return null;
      assertSnapshot(row.snapshot);
      return { revision: Number(row.revision), snapshot: row.snapshot };
    },
    async readAuditChain(workspaceId: string): Promise<StoredAuditLink[]> {
      assertWorkspaceId(workspaceId);
      const result = await database.query<{ event_id: string; previous_hash: string; content_hash: string; link_hash: string }>(
        'SELECT event_id, previous_hash, content_hash, link_hash FROM audit_events WHERE workspace_id = $1 ORDER BY id ASC',
        [workspaceId],
      );
      return result.rows.map((row) => ({
        eventId: row.event_id,
        previousHash: row.previous_hash,
        contentHash: row.content_hash,
        linkHash: row.link_hash,
      }));
    },
    async write(workspaceId: string, expectedRevision: number, snapshot: StoreSnapshot): Promise<WorkspaceWriteResult> {
      assertWorkspaceId(workspaceId);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('INVALID_WORKSPACE_REVISION');
      assertSnapshot(snapshot);
      return withTransaction(database, async (queryable) => {
        const result = expectedRevision === 0
          ? await queryable.query<{ revision: string | number }>(
            'INSERT INTO workspace_state (workspace_id, revision, snapshot) VALUES ($1, 1, $2::jsonb) ON CONFLICT (workspace_id) DO NOTHING RETURNING revision',
            [workspaceId, JSON.stringify(snapshot)],
          )
          : await queryable.query<{ revision: string | number }>(
            'UPDATE workspace_state SET revision = revision + 1, snapshot = $3::jsonb, updated_at = now() WHERE workspace_id = $1 AND revision = $2 RETURNING revision',
            [workspaceId, expectedRevision, JSON.stringify(snapshot)],
          );
        const row = result.rows[0];
        if (!row) {
          const current = await queryable.query<{ revision: string | number }>('SELECT revision FROM workspace_state WHERE workspace_id = $1', [workspaceId]);
          return { ok: false, actualRevision: current.rows[0] ? Number(current.rows[0].revision) : 0 };
        }

        const existingAudit = await queryable.query<{ event_id: string }>('SELECT event_id FROM audit_events WHERE workspace_id = $1', [workspaceId]);
        const knownAudit = new Set(existingAudit.rows.map((item) => item.event_id));
        const auditHead = await queryable.query<{ previous_hash: string; content_hash: string; link_hash: string }>(
          'SELECT previous_hash, content_hash, link_hash FROM audit_events WHERE workspace_id = $1 ORDER BY id ASC',
          [workspaceId],
        );
        let auditChain: HashLink[] = auditHead.rows.map((item) => ({
          previousHash: item.previous_hash,
          contentHash: item.content_hash,
          linkHash: item.link_hash,
        }));
        for (const event of snapshot.auditEvents) {
          if (knownAudit.has(event.id)) continue;
          const link = await appendHashLink(auditChain, eventContent(event));
          auditChain = [...auditChain, link];
          await queryable.query(
            'INSERT INTO audit_events (event_id, workspace_id, event_type, resource_id, payload, previous_hash, content_hash, link_hash, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) ON CONFLICT (event_id) DO NOTHING',
            [event.id, workspaceId, event.eventType, event.resourceId, JSON.stringify(event.payload), link.previousHash, link.contentHash, link.linkHash, event.createdAt],
          );
        }

        const existingEdits = await queryable.query<{ id: string }>('SELECT id FROM edit_events WHERE workspace_id = $1', [workspaceId]);
        const knownEdits = new Set(existingEdits.rows.map((item) => item.id));
        const editHead = await queryable.query<{ previous_hash: string; content_hash: string; link_hash: string }>(
          'SELECT previous_hash, content_hash, link_hash FROM edit_events WHERE workspace_id = $1 ORDER BY created_at ASC, id ASC',
          [workspaceId],
        );
        let editChain: HashLink[] = editHead.rows.map((item) => ({
          previousHash: item.previous_hash,
          contentHash: item.content_hash,
          linkHash: item.link_hash,
        }));
        for (const draft of snapshot.drafts) {
          if (draft.status === 'pending') continue;
          const eventId = `${draft.id}:${draft.status}`;
          if (knownEdits.has(eventId)) continue;
          const link = await appendHashLink(editChain, editContent(draft));
          editChain = [...editChain, link];
          await queryable.query(
            'INSERT INTO edit_events (id, workspace_id, draft_id, note_id, outcome, previous_hash, content_hash, link_hash, prev_note_hash, new_note_hash, provenance, reason_code, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13) ON CONFLICT (id) DO NOTHING',
            [eventId, workspaceId, draft.id, draft.noteId, draft.status, link.previousHash, link.contentHash, link.linkHash, draft.prevHash, draft.status === 'confirmed' ? (snapshot.notes.find((note) => note.id === draft.noteId)?.contentHash ?? draft.prevHash) : draft.prevHash, JSON.stringify(draft.provenance), draft.status === 'rejected' ? 'rejected' : null, draft.createdAt],
          );
        }

        return { ok: true, revision: Number(row.revision) };
      });
    },
  };
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
