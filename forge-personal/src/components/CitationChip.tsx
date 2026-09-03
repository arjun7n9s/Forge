'use client';

import type { IntegrityStatus } from '@/lib/domain/types';
import { integrityPresentation } from '@/lib/domain/integrity';

export function CitationChip({ status }: { status: IntegrityStatus }) {
  const presentation = integrityPresentation(status);
  if (status === 'ok') return <span className="cleanDot" aria-label="Citation verified clean" title="Verified clean" />;
  if (status === 'unknown') return <span className="unknownDot" aria-label="Citation status unknown" title="Status unknown" />;
  return <span className={`citationChip ${presentation.tone}`} data-integrity={status}>{presentation.label}</span>;
}
