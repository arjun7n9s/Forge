import type { SourceOutcome } from './contracts.js';

export type IntegrityStatus = 'ok' | 'retracted' | 'eoc' | 'unknown';
export type IntegrityColor = 'green' | 'red' | 'amber' | 'gray';
export type CardType = 'corroborated' | 'openalex_only' | 'disagree' | 'eoc_only' | 'crossref_only';
export type IntegrityConflict = 'OPENALEX_RETRACTED_CROSSREF_EOC';

export interface IntegrityClassification {
  color: IntegrityColor;
  status: IntegrityStatus;
  cardType?: CardType;
  sources: {
    openalex: SourceOutcome<'openalex'>;
    crossref: SourceOutcome<'crossref'>;
  };
  conflicts: IntegrityConflict[];
}

export type { SourceOutcome } from './contracts.js';

export function classifyIntegrity(
  openalex: SourceOutcome<'openalex'>,
  crossref: SourceOutcome<'crossref'>,
): IntegrityClassification {
  const sources = { openalex, crossref };
  if (openalex.state !== 'ok' || crossref.state !== 'ok') {
    return { color: 'gray', status: 'unknown', sources, conflicts: [] };
  }

  const oaRetracted = openalex.value.isRetracted;
  const crRetracted = crossref.value.integrityEvents.some((event) => event.type === 'retraction');
  const crEoc = crossref.value.integrityEvents.some((event) => event.type === 'expression_of_concern');

  if (oaRetracted && crRetracted) return { color: 'red', status: 'retracted', cardType: 'corroborated', sources, conflicts: [] };
  if (oaRetracted && crEoc) return { color: 'amber', status: 'eoc', cardType: 'disagree', sources, conflicts: ['OPENALEX_RETRACTED_CROSSREF_EOC'] };
  if (oaRetracted) return { color: 'red', status: 'retracted', cardType: 'openalex_only', sources, conflicts: [] };
  if (crRetracted) return { color: 'red', status: 'retracted', cardType: 'crossref_only', sources, conflicts: [] };
  if (crEoc) return { color: 'amber', status: 'eoc', cardType: 'eoc_only', sources, conflicts: [] };
  return { color: 'green', status: 'ok', sources, conflicts: [] };
}
