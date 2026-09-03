import { normalizeDoi } from '../doi.ts'
import type { createVerificationService } from '../verification.ts'
import { registerConformantTool, type ModelContext, type ModelContextTool, type ModelContextToolResult } from '@forge/core'

type Service = ReturnType<typeof createVerificationService>
type JsonSchema = Readonly<Record<string, unknown>>

export type ProviderTool = Omit<ModelContextTool, 'name' | 'inputSchema' | 'execute'> & {
  name: 'list_source_kinds' | 'verify_citation' | 'scan_citations'
  inputSchema: JsonSchema
  execute(input: unknown): Promise<ModelContextToolResult>
}
type ProviderContext = Pick<ModelContext, 'registerTool'>

const annotations = { readOnlyHint: true, idempotentHint: true, untrustedContentHint: false } as const
const doiProperty = { type: 'string', pattern: '^10\\.\\d{4,9}/[-._;()/:A-Za-z0-9]+$' } as const

function inputRecord(input: unknown): Record<string, unknown> | null {
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : null
}

export function buildProviderTools(service: Service): ProviderTool[] {
  return [
    {
      name: 'list_source_kinds',
      description: 'List citation integrity source kinds.',
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      annotations,
      execute: async () => ({ kinds: ['openalex', 'crossref'] }),
    },
    {
      name: 'verify_citation',
      description: 'Verify one canonical DOI with OpenAlex and Crossref.',
      inputSchema: { type: 'object', properties: { doi: doiProperty }, required: ['doi'], additionalProperties: false },
      annotations,
      execute: async (input) => {
        const record = inputRecord(input)
        if (record === null || typeof record.doi !== 'string' || Object.keys(record).some((key) => key !== 'doi')) throw new Error('INVALID_DOI')
        return service.verify(normalizeDoi(record.doi))
      },
    },
    {
      name: 'scan_citations',
      description: 'Verify up to 50 canonical DOI strings with bounded parallelism.',
      inputSchema: { type: 'object', properties: { dois: { type: 'array', items: doiProperty, maxItems: 50 } }, required: ['dois'], additionalProperties: false },
      annotations,
      execute: async (input) => {
        const record = inputRecord(input)
        if (record === null || !Array.isArray(record.dois) || record.dois.length > 50 || Object.keys(record).some((key) => key !== 'dois')) throw new Error('SCAN_LIMIT')
        const dois = record.dois.map((value) => {
          if (typeof value !== 'string') throw new Error('INVALID_DOI')
          return normalizeDoi(value)
        })
        return { results: await service.scan(dois) }
      },
    },
  ]
}

export async function registerProviderTools(context: ProviderContext, service: Service, origin: string, signal?: AbortSignal): Promise<void> {
  if (origin === '*' || origin.includes('*')) throw new Error('EXPOSED_TO_WILDCARD')
  let parsed: URL
  try { parsed = new URL(origin) } catch { throw new Error('EXPOSED_TO_INVALID') }
  const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.origin !== origin || (parsed.protocol !== 'https:' && !localHttp)) throw new Error('EXPOSED_TO_INVALID')

  for (const tool of buildProviderTools(service)) {
    if (signal?.aborted) break
    const options = signal === undefined ? { exposedTo: [origin] } : { exposedTo: [origin], signal }
    await registerConformantTool(context, tool, options)
  }
}
