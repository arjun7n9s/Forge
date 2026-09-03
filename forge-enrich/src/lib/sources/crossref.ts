import { createTrustFirewall } from '@forge/core'
import { normalizeDoi } from '../doi.ts'
import { isRecord, timedFetch } from './shared.ts'
import type { AdapterOptions, CrossrefProjection, IntegrityEvent, SourceResult } from './types.ts'

const firewall = createTrustFirewall()
export async function fetchCrossref(input: string, options: AdapterOptions = {}): Promise<SourceResult<'crossref'>> {
  const doi = normalizeDoi(input)
  const source_url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
  const mailto = options.mailto ?? process.env.CROSSREF_MAILTO ?? 'contact@forge.local'
  const result = await timedFetch(
    source_url,
    { headers: { Accept: 'application/json', 'User-Agent': `FORGE/0.1 (mailto:${mailto})` } },
    options.fetcher ?? fetch,
    options.timeoutMs ?? 4000,
  )
  if (typeof result === 'string') return { outcome: result, source_url }
  if (result.status === 404) return { outcome: 'not_found', source_url }
  if (!result.ok) return { outcome: 'upstream_error', source_url }

  let raw: unknown
  try { raw = await result.json() } catch { return { outcome: 'malformed', source_url } }
  if (!isRecord(raw) || !isRecord(raw.message)) return { outcome: 'malformed', source_url }

  const trusted = firewall.crossref(raw.message)
  if (!trusted.ok) return { outcome: 'malformed', source_url }

  const integrity_events: IntegrityEvent[] = trusted.value.integrityEvents.map((event) => ({
    relation: event.relation,
    type: event.type,
    notice_doi: event.noticeDoi,
    source_kind: event.sourceKind,
    updated_date: event.updatedDate,
  }))
  const data: CrossrefProjection = { doi: trusted.value.doi, title: trusted.value.title, integrity_events }
  return { outcome: 'ok', data, source_url }
}
