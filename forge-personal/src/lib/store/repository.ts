import { appendHashLink, hashBody } from '@/lib/domain/hash';
import type { AuditEvent, CardType, Draft, Note, StoreSnapshot } from '@/lib/domain/types';

const SEEDS = [
  { id: 'note-gautret', title: 'Hydroxychloroquine evidence review', doi: '10.1016/j.ijantimicag.2020.105949', body: 'The early Gautret cohort reported virological outcomes. Citation: 10.1016/j.ijantimicag.2020.105949' },
  { id: 'note-lesne', title: 'Amyloid oligomer evidence', doi: '10.1038/nature04533', body: 'The Aβ*56 hypothesis shaped a generation of memory research. Citation: 10.1038/nature04533' },
  { id: 'note-openalex', title: 'Network motifs in transcriptional regulation', doi: '10.1038/nrg2336', body: 'This review surveys network motifs in transcriptional regulation. Citation: 10.1038/nrg2336' },
  { id: 'note-eoc', title: 'Stroke thrombectomy workflow', doi: '10.1177/1475090218792382', body: 'This note tracks thrombectomy workflow evidence. Citation: 10.1177/1475090218792382' },
  { id: 'note-clean', title: 'CRISPR–Cas9 structural basis', doi: '10.1038/nature14539', body: 'Structural work clarifies RNA-guided DNA recognition by Cas9. Citation: 10.1038/nature14539' },
] as const;

export interface Repository {
  snapshot(): StoreSnapshot;
  getNote(id: string): Note | undefined;
  createNote(title: string, body: string, doi?: string): Promise<Note>;
  saveNote(id: string, body: string): Promise<Note>;
  proposeEdit(noteId: string, proposedBody: string, provenance: Record<string, string>, cardType: CardType): Promise<Draft>;
  confirmEdit(id: string): Promise<{ draft: Draft; note: Note }>;
  rejectEdit(id: string, reason?: string): Promise<Draft>;
  appendEvent(event: Omit<AuditEvent, 'id' | 'createdAt'>): AuditEvent;
  hydrate(snapshot: StoreSnapshot): void;
}

const cloneSnapshot = (state: StoreSnapshot): StoreSnapshot => ({ notes: [...state.notes], drafts: [...state.drafts], auditEvents: [...state.auditEvents], hashChains: Object.fromEntries(Object.entries(state.hashChains).map(([id, chain]) => [id, [...chain]])) });

export async function createRepository(initial?: StoreSnapshot): Promise<Repository> {
  let state: StoreSnapshot = initial ? cloneSnapshot(initial) : { notes: [], drafts: [], auditEvents: [], hashChains: {} };
  if (!initial) {
    for (const seed of SEEDS) {
      const now = new Date().toISOString();
      const contentHash = await hashBody(seed.body);
      state.notes.push({ ...seed, contentHash, createdAt: now, updatedAt: now });
      state.hashChains[seed.id] = await appendHashLink([], seed.id, seed.body);
    }
  }
  const appendEvent: Repository['appendEvent'] = (value) => {
    const event = Object.freeze({ ...value, id: crypto.randomUUID(), createdAt: new Date().toISOString(), payload: Object.freeze({ ...value.payload }) });
    state = { ...state, auditEvents: [...state.auditEvents, event] };
    return event;
  };
  return {
    snapshot: () => cloneSnapshot(state),
    getNote: (id) => state.notes.find((note) => note.id === id),
    async createNote(title, body, doi = '') {
      const now = new Date().toISOString();
      const note = { id: crypto.randomUUID(), title, body, doi, contentHash: await hashBody(body), createdAt: now, updatedAt: now };
      state = { ...state, notes: [...state.notes, note], hashChains: { ...state.hashChains, [note.id]: await appendHashLink([], note.id, body) } };
      return note;
    },
    async saveNote(id, body) {
      const current = state.notes.find((note) => note.id === id);
      if (!current) throw new Error('Note not found');
      const note = { ...current, body, contentHash: await hashBody(body), updatedAt: new Date().toISOString() };
      const chain = await appendHashLink(state.hashChains[id] ?? [], id, body);
      state = { ...state, notes: state.notes.map((item) => item.id === id ? note : item), hashChains: { ...state.hashChains, [id]: chain } };
      return note;
    },
    async proposeEdit(noteId, proposedBody, provenance, cardType) {
      const note = state.notes.find((item) => item.id === noteId);
      if (!note) throw new Error('Note not found');
      const duplicate = state.drafts.find((draft) => draft.noteId === noteId && draft.status === 'pending' && draft.proposedBody === proposedBody);
      if (duplicate) return duplicate;
      const draft: Draft = { id: crypto.randomUUID(), noteId, proposedBody, prevHash: note.contentHash, status: 'pending', cardType, provenance: { ...provenance }, createdAt: new Date().toISOString() };
      state = { ...state, drafts: [...state.drafts, draft] };
      return draft;
    },
    async confirmEdit(id) {
      const draft = state.drafts.find((item) => item.id === id);
      if (!draft || draft.status !== 'pending') throw new Error('Pending draft not found');
      const current = state.notes.find((note) => note.id === draft.noteId);
      if (!current || current.contentHash !== draft.prevHash) throw new Error('Draft is stale');
      const note = { ...current, body: draft.proposedBody, contentHash: await hashBody(draft.proposedBody), updatedAt: new Date().toISOString() };
      const confirmed = { ...draft, status: 'confirmed' as const };
      const chain = await appendHashLink(state.hashChains[note.id] ?? [], note.id, note.body);
      state = { ...state, notes: state.notes.map((item) => item.id === note.id ? note : item), drafts: state.drafts.map((item) => item.id === id ? confirmed : item), hashChains: { ...state.hashChains, [note.id]: chain } };
      appendEvent({ eventType: 'edit.confirmed', resourceId: id, payload: { noteId: note.id, prevHash: draft.prevHash, newHash: note.contentHash, cardType: draft.cardType, provenance: draft.provenance } });
      return { draft: confirmed, note };
    },
    async rejectEdit(id, reason = '') {
      const draft = state.drafts.find((item) => item.id === id);
      if (!draft || draft.status !== 'pending') throw new Error('Pending draft not found');
      const rejected = { ...draft, status: 'rejected' as const };
      state = { ...state, drafts: state.drafts.map((item) => item.id === id ? rejected : item) };
      appendEvent({ eventType: 'edit.rejected', resourceId: id, payload: { noteId: draft.noteId, reason } });
      return rejected;
    },
    appendEvent,
    hydrate(snapshot) { state = cloneSnapshot(snapshot); },
  };
}

export { SEEDS };
