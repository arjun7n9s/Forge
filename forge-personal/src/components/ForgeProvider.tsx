'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CitationResult, Draft, Note, StoreSnapshot } from '@/lib/domain/types';
import { createRepository, type Repository } from '@/lib/store/repository';
import { createCitationTransport, createCompatibilityCitationTransport, ENRICH_ORIGIN, type CitationTransport } from '@/lib/webmcp/federation';
import { registerPersonalTools, type EditorState, type PersonalActions } from '@/lib/webmcp/registerTools';
import { loadWorkspace, loginWorkspace, logoutWorkspace, PersistenceConflict, saveWorkspace, type PersistenceMode } from '@/lib/store/persistenceClient';
import { resolveModelContext } from '@forge/core';
import { originTrialAllowsWebMcp } from '@/lib/webmcp/originTrial';

interface ForgeContextValue {
  snapshot?: StoreSnapshot; transportLabel: string; transportKind: string; enrichOrigin: string; review?: Draft;
  persistenceMode: PersistenceMode; persistenceReason: string | undefined; persistenceRevision: number;
  verify(doi: string): Promise<CitationResult>; saveNote(id: string, body: string): Promise<void>; runScan(id: string): Promise<void>;
  login(accessKey: string): Promise<boolean>; logout(): Promise<void>;
  openReview(draft: Draft): void; closeReview(): void; confirm(id: string): Promise<void>; reject(id: string, reason?: string): Promise<void>;
}
const ForgeContext = createContext<ForgeContextValue | null>(null);
const STORAGE_KEY = 'forge.personal.v2';

export function ForgeProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repository>();
  const [snapshot, setSnapshot] = useState<StoreSnapshot>();
  const [review, setReview] = useState<Draft>();
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>('loading');
  const [persistenceReason, setPersistenceReason] = useState<string>();
  const [persistenceRevision, setPersistenceRevision] = useState(0);
  const revisionRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const repoRef = useRef<Repository | undefined>(undefined);
  const refreshRef = useRef<(source: Repository) => void>(() => {});
  const actionsRef = useRef<PersonalActions>({});
  const [transport, setTransport] = useState<CitationTransport>(() => createCompatibilityCitationTransport({ enrichOrigin: ENRICH_ORIGIN }));
  const refresh = useCallback((source: Repository) => {
    const next = source.snapshot();
    setSnapshot(next);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (persistenceMode === 'server') {
      writeQueueRef.current = writeQueueRef.current.then(async () => {
        try {
          const revision = await saveWorkspace(next, revisionRef.current);
          revisionRef.current = revision;
          setPersistenceRevision(revision);
        } catch (error) {
          if (error instanceof PersistenceConflict) {
            revisionRef.current = error.actualRevision;
            setPersistenceRevision(error.actualRevision);
            setPersistenceMode('conflict');
            setPersistenceReason('REVISION_CONFLICT');
          } else {
            setPersistenceMode('error');
            setPersistenceReason(error instanceof Error ? error.message : 'PERSISTENCE_FAILED');
          }
        }
      });
    }
  }, [persistenceMode]);

  const initialize = useCallback(async () => {
    const loaded = await loadWorkspace();
    if (loaded.mode === 'locked') {
      setRepo(undefined); setSnapshot(undefined); setPersistenceMode('locked'); setPersistenceReason(undefined);
      return;
    }
    let stored: StoreSnapshot | undefined;
    if (loaded.mode === 'server') stored = loaded.snapshot ?? undefined;
    else {
      try { const raw = localStorage.getItem(STORAGE_KEY); stored = raw ? JSON.parse(raw) as StoreSnapshot : undefined; } catch { stored = undefined; }
    }
    let source = await createRepository(stored);
    if (loaded.mode === 'server') {
      let revision = loaded.revision;
      if (loaded.snapshot === null) {
        try { revision = await saveWorkspace(source.snapshot(), 0); }
        catch (error) {
          if (!(error instanceof PersistenceConflict)) throw error;
          const current = await loadWorkspace();
          if (current.mode !== 'server' || current.snapshot === null) throw error;
          source = await createRepository(current.snapshot);
          revision = current.revision;
        }
      }
      revisionRef.current = revision;
      setPersistenceRevision(revision);
      setPersistenceMode('server');
      setPersistenceReason(undefined);
    } else {
      setPersistenceMode('local');
      setPersistenceReason(loaded.reason);
    }
    setRepo(source);
    const next = source.snapshot();
    setSnapshot(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  // Latest-value refs keep the mount-once effects below off the render-identity
  // treadmill: `repo` and `refresh` change identity on every persisted write, and
  // depending on them here would re-enter initialize() in a loop.
  useEffect(() => { repoRef.current = repo; refreshRef.current = refresh; });

  useEffect(() => {
    const modelContext = originTrialAllowsWebMcp() ? resolveModelContext() : undefined;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void createCitationTransport({
        ...(modelContext ? { modelContext } : {}),
        enrichOrigin: ENRICH_ORIGIN,
        onFirewallRejected: (error) => {
          const current = repoRef.current;
          if (!current) return;
          current.appendEvent({ eventType: 'firewall.rejected', resourceId: ENRICH_ORIGIN, payload: { code: error.code, path: error.path } });
          refreshRef.current(current);
        },
      }).then((next) => { if (active) setTransport(next); });
      void initialize().catch((error) => { if (active) { setPersistenceMode('error'); setPersistenceReason(error instanceof Error ? error.message : 'PERSISTENCE_FAILED'); } });
    });
    return () => { active = false; };
  }, [initialize]);

  const login = useCallback(async (accessKey: string) => {
    const accepted = await loginWorkspace(accessKey);
    if (accepted) await initialize();
    return accepted;
  }, [initialize]);
  const logout = useCallback(async () => {
    await logoutWorkspace();
    setReview(undefined);
    await initialize();
  }, [initialize]);

  const verify = useCallback((doi: string) => transport.verify(doi), [transport]);
  const saveNote = useCallback(async (id: string, body: string) => { if (!repo) return; await repo.saveNote(id, body); refresh(repo); }, [repo, refresh]);
  const runScan = useCallback(async (id: string) => {
    if (!repo) return; const note = repo.getNote(id); if (!note) return;
    const result = await verify(note.doi);
    repo.appendEvent({ eventType: 'check.performed', resourceId: note.doi, payload: { status: result.status, transport: transport.kind } });
    if (result.cardType && (result.status === 'retracted' || result.status === 'eoc')) {
      const provenance = Object.fromEntries(Object.entries(result.sources).flatMap(([source, value]) => typeof value === 'object' && value && 'source_url' in value ? [[source, String((value as { source_url: unknown }).source_url)]] : []));
      await repo.proposeEdit(id, `${note.body}\n\n> Integrity notice: verify this citation before relying on its findings.`, provenance, result.cardType);
    }
    refresh(repo);
  }, [repo, refresh, transport.kind, verify]);
  const confirm = useCallback(async (id: string) => { if (!repo) return; await repo.confirmEdit(id); setReview(undefined); refresh(repo); }, [repo, refresh]);
  const reject = useCallback(async (id: string, reason?: string) => { if (!repo) return; await repo.rejectEdit(id, reason); setReview(undefined); refresh(repo); }, [repo, refresh]);

  useEffect(() => {
    const modelContext = resolveModelContext();
    if (!repo || !modelContext?.registerTool) return;
    const pending = snapshot?.drafts.some((draft) => draft.status === 'pending') ?? false;
    const state: EditorState = review ? 'EDITOR_REVIEW_OPEN' : pending ? 'EDITOR_DRAFT_READY' : 'EDITOR_IDLE';
    const actions = {
      list_notes: () => ({ notes: repo.snapshot().notes }), get_note: (input: unknown) => ({ note: repo.getNote((input as { note_id?: string }).note_id ?? ''), hash_chain: repo.snapshot().hashChains[(input as { note_id?: string }).note_id ?? ''] ?? [] }),
      search_notes: (input: unknown) => ({ results: repo.snapshot().notes.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(String((input as { query?: string }).query ?? '').toLowerCase())) }),
      get_drafts: () => ({ drafts: repo.snapshot().drafts }), create_note: async (input: unknown) => { const note = await repo.createNote(String((input as { title?: string }).title ?? 'Untitled'), String((input as { body?: string }).body ?? '')); refresh(repo); return { note }; },
      run_scan_now: async (input: unknown) => { await runScan(String((input as { note_id?: string }).note_id ?? '')); return { scan_id: crypto.randomUUID() }; },
      propose_note_edit: async (input: unknown) => { const draft = await repo.proposeEdit(String((input as { note_id?: string }).note_id), String((input as { draft_payload?: { body?: string } }).draft_payload?.body ?? ''), {}, 'corroborated'); refresh(repo); return { draft }; },
      confirm_edit: async (input: unknown) => { await confirm(String((input as { edit_id?: string }).edit_id)); return { ok: true }; },
      reject_edit: async (input: unknown) => { await reject(String((input as { edit_id?: string }).edit_id), String((input as { reason?: string }).reason ?? '')); return { ok: true }; },
    };
    const controller = registerPersonalTools({ registerTool: modelContext.registerTool.bind(modelContext) }, { state, actions });
    return () => controller.abort();
  }, [confirm, reject, repo, review, runScan, snapshot, refresh]);

  const value = useMemo<ForgeContextValue>(() => ({
    ...(snapshot ? { snapshot } : {}),
    ...(review ? { review } : {}),
    transportLabel: transport.label,
    transportKind: transport.kind,
    enrichOrigin: ENRICH_ORIGIN,
    persistenceMode,
    persistenceReason,
    persistenceRevision,
    verify,
    login,
    logout,
    saveNote,
    runScan,
    openReview: setReview,
    closeReview: () => setReview(undefined),
    confirm,
    reject,
  }), [snapshot, transport, review, persistenceMode, persistenceReason, persistenceRevision, verify, login, logout, saveNote, runScan, confirm, reject]);
  return <ForgeContext.Provider value={value}>{children}<iframe className="providerFrame" title="FORGE enrichment provider" data-enrichment-provider src={`${ENRICH_ORIGIN}/provider`} allow="tools" /></ForgeContext.Provider>;
}

export function useForge(): ForgeContextValue { const value = useContext(ForgeContext); if (!value) throw new Error('ForgeProvider missing'); return value; }
