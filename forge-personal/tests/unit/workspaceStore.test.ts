import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import type { StoreSnapshot } from '@/lib/domain/types';
import { createWorkspaceStore, verifyStoredAuditChain } from '@/lib/server/workspaceStore';

const EMPTY: StoreSnapshot = { notes: [], drafts: [], auditEvents: [], hashChains: {} };
const HASH = 'a'.repeat(64);

async function setup() {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  database.public.registerFunction({ name: 'char_length', args: [DataType.text], returns: DataType.integer, implementation: (value: string) => value.length });
  const { Pool } = database.adapters.createPg();
  const pool = new Pool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id serial PRIMARY KEY,
      event_id text NOT NULL UNIQUE,
      workspace_id varchar(80) NOT NULL,
      event_type text NOT NULL,
      resource_id text,
      payload jsonb NOT NULL DEFAULT '{}',
      previous_hash text NOT NULL,
      content_hash text NOT NULL,
      link_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS edit_events (
      id text PRIMARY KEY,
      workspace_id varchar(80) NOT NULL,
      draft_id text NOT NULL,
      note_id text NOT NULL,
      outcome text NOT NULL,
      previous_hash text NOT NULL,
      content_hash text NOT NULL,
      link_hash text NOT NULL,
      prev_note_hash text NOT NULL,
      new_note_hash text NOT NULL,
      provenance jsonb NOT NULL,
      reason_code text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const workspaceSql = await readFile(resolve(process.cwd(), '../infra/sql/002_workspace_state.sql'), 'utf8');
  await pool.query(workspaceSql);
  database.public.interceptQueries((sql) => {
    if (/^\s*(update|delete)\s+(audit_events|edit_events)\b/i.test(sql)) {
      throw new Error('audit_events is append-only');
    }
    return null;
  });
  return { pool, store: createWorkspaceStore(pool) };
}

describe('revisioned PostgreSQL workspace store', () => {
  it('creates revision one and reads the exact validated snapshot', async () => {
    const { pool, store } = await setup();
    await expect(store.read('personal')).resolves.toBeNull();
    await expect(store.write('personal', 0, EMPTY)).resolves.toEqual({ ok: true, revision: 1 });
    await expect(store.read('personal')).resolves.toEqual({ revision: 1, snapshot: EMPTY });
    await pool.end();
  });

  it('rejects a stale revision without overwriting newer state', async () => {
    const { pool, store } = await setup();
    await store.write('personal', 0, EMPTY);
    const newer = { ...EMPTY, notes: [{ id: 'n1', title: 'One', body: 'Body', doi: '', contentHash: HASH, createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' }] };
    await expect(store.write('personal', 1, newer)).resolves.toEqual({ ok: true, revision: 2 });
    await expect(store.write('personal', 1, EMPTY)).resolves.toEqual({ ok: false, actualRevision: 2 });
    await expect(store.read('personal')).resolves.toEqual({ revision: 2, snapshot: newer });
    await pool.end();
  });

  it('rejects malformed snapshots before issuing a write', async () => {
    const { pool, store } = await setup();
    await expect(store.write('personal', 0, { notes: 'not-an-array' } as never)).rejects.toThrow('INVALID_WORKSPACE_SNAPSHOT');
    await expect(store.read('personal')).resolves.toBeNull();
    await pool.end();
  });

  it('appends audit events in the same transaction and fails the chain after tampering', async () => {
    const { pool, store } = await setup();
    const snapshot: StoreSnapshot = {
      ...EMPTY,
      auditEvents: [{
        id: 'evt-1',
        eventType: 'check.performed',
        resourceId: '10.1038/nature14539',
        payload: { status: 'ok' },
        createdAt: '2026-09-02T00:00:00.000Z',
      }],
    };
    await expect(store.write('personal', 0, snapshot)).resolves.toEqual({ ok: true, revision: 1 });
    const chain = await store.readAuditChain('personal');
    expect(chain).toHaveLength(1);
    await expect(verifyStoredAuditChain(chain)).resolves.toEqual({ valid: true });

    await expect(pool.query("UPDATE audit_events SET payload = '{\"tampered\":true}'::jsonb")).rejects.toThrow(/append-only/i);

    const tampered = chain.map((link, index) => index === 0 ? { ...link, contentHash: 'f'.repeat(64) } : link);
    await expect(verifyStoredAuditChain(tampered)).resolves.toMatchObject({ valid: false, code: 'HASH_MISMATCH' });
    await pool.end();
  });
});
