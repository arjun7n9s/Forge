import { classifyIntegrity, type SourceOutcome } from '@forge/core'
import type { SourceResult } from './sources/types.ts'

export type IntegrityStatus = 'ok' | 'retracted' | 'eoc' | 'unknown'
export type CardType = 'corroborated' | 'openalex_only' | 'disagree' | 'eoc_only' | 'crossref_only' | null

function openAlexOutcome(result: SourceResult<'openalex'>): SourceOutcome<'openalex'> {
  if (result.outcome === 'ok') {
    return { state: 'ok', source: 'openalex', value: {
      id: result.data.id,
      doi: result.data.doi,
      title: result.data.title,
      isRetracted: result.data.is_retracted,
      publicationDate: result.data.publication_date,
    } }
  }
  if (result.outcome === 'timeout') return { state: 'timeout', source: 'openalex' }
  return { state: 'error', source: 'openalex', code: result.outcome }
}

function crossrefOutcome(result: SourceResult<'crossref'>): SourceOutcome<'crossref'> {
  if (result.outcome === 'ok') {
    return { state: 'ok', source: 'crossref', value: {
      doi: result.data.doi,
      title: result.data.title,
      integrityEvents: result.data.integrity_events.map((event) => ({
        type: event.type === 'expression-of-concern' ? 'expression_of_concern' : event.type,
        relation: event.relation,
        noticeDoi: event.notice_doi,
        sourceKind: event.source_kind,
        updatedDate: event.updated_date,
      })).filter((event): event is { type: 'retraction' | 'expression_of_concern'; relation: 'update-to' | 'updated-by'; noticeDoi: string; sourceKind: 'publisher' | 'retraction-watch' | 'other'; updatedDate: string } => event.type === 'retraction' || event.type === 'expression_of_concern'),
    } }
  }
  if (result.outcome === 'timeout') return { state: 'timeout', source: 'crossref' }
  return { state: 'error', source: 'crossref', code: result.outcome }
}

export function classify(openalex: SourceResult<'openalex'>, crossref: SourceResult<'crossref'>): { status: IntegrityStatus; card_type: CardType } {
  const classification = classifyIntegrity(openAlexOutcome(openalex), crossrefOutcome(crossref))
  return { status: classification.status, card_type: classification.cardType ?? null }
}
