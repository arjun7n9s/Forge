'use client';
import type { Draft } from '@/lib/domain/types';

const label: Record<Draft['cardType'], string> = { corroborated: 'Corroborated retraction', openalex_only: 'OpenAlex retraction', crossref_only: 'Crossref retraction', disagree: 'Signals disagree', eoc_only: 'Editorial concern' };
export function DraftCard({ draft, onReview }: { draft: Draft; onReview: (draft: Draft) => void }) {
  const retracted = ['corroborated', 'openalex_only', 'crossref_only'].includes(draft.cardType);
  return <article className="pendingWrapper" data-testid="pending-wrapper"><div className="pendingHeader"><span className="pendingBadge">Pending review</span><span className="draftTime">{new Date(draft.createdAt).toLocaleDateString()}</span></div><div className="draftCard"><div className={`integrityBadge ${retracted ? 'red' : 'amber'}`} data-integrity={retracted ? 'retracted' : 'eoc'}>{label[draft.cardType]}</div><h3>Proposed integrity annotation</h3><p>{draft.proposedBody.split('\n').at(-1)}</p><div className="draftFooter"><code>{draft.prevHash.slice(0, 12)}…</code><button className="secondaryButton" onClick={() => onReview(draft)}>Review</button></div></div></article>;
}
