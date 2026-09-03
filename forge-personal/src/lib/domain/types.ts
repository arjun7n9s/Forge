export type IntegrityStatus = 'ok' | 'retracted' | 'eoc' | 'unknown';
export type CardType = 'corroborated' | 'openalex_only' | 'crossref_only' | 'disagree' | 'eoc_only';

export interface CitationResult {
  status: IntegrityStatus;
  cardType?: CardType;
  sources: Record<string, unknown>;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  doi: string;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface Draft {
  id: string;
  noteId: string;
  proposedBody: string;
  prevHash: string;
  status: 'pending' | 'confirmed' | 'rejected';
  cardType: CardType;
  provenance: Record<string, string>;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  eventType: 'edit.confirmed' | 'edit.rejected' | 'check.performed' | 'tool.registered' | 'tool.unregistered' | 'firewall.rejected';
  resourceId: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export interface HashLink {
  noteId: string;
  body: string;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface StoreSnapshot {
  notes: Note[];
  drafts: Draft[];
  auditEvents: AuditEvent[];
  hashChains: Record<string, HashLink[]>;
}
