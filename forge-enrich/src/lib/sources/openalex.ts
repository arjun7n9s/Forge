import { createTrustFirewall } from '@forge/core'
import { normalizeDoi } from '../doi.ts'
import { isRecord, timedFetch } from './shared.ts'
import type { AdapterOptions, OpenAlexProjection, SourceResult } from './types.ts'

const firewall = createTrustFirewall()

export async function fetchOpenAlex(input: string, options: AdapterOptions = {}): Promise<SourceResult<'openalex'>> {
  const doi = normalizeDoi(input)
  const mailto = options.mailto ?? process.env.OPENALEX_MAILTO
  const source_url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ''}`
  const result = await timedFetch(source_url, { headers: { Accept: 'application/json' } }, options.fetcher ?? fetch, options.timeoutMs ?? 4000)
  if (typeof result === 'string') return { outcome: result, source_url }
  if (result.status === 404) return { outcome: 'not_found', source_url }
  if (!result.ok) return { outcome: 'upstream_error', source_url }

  let raw: unknown
  try { raw = await result.json() } catch { return { outcome: 'malformed', source_url } }
  if (!isRecord(raw)) return { outcome: 'malformed', source_url }

  const projected = {
    id: raw.id,
    doi: raw.doi,
    title: raw.title,
    is_retracted: raw.is_retracted,
    publication_date: raw.publication_date,
  }
  const trusted = firewall.openAlex(projected)
  if (!trusted.ok || trusted.value.doi === null) return { outcome: 'malformed', source_url }

  const data: OpenAlexProjection = {
    id: trusted.value.id,
    doi: trusted.value.doi,
    title: trusted.value.title,
    is_retracted: trusted.value.isRetracted,
    publication_date: trusted.value.publicationDate,
  }
  return { outcome: 'ok', data, source_url }
}
