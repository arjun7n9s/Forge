import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import { normalizeDoi } from './doi.js';

const outcomes = ['ok', 'not_found', 'timeout', 'upstream_error', 'malformed'] as const;
const failureOutcomes = outcomes.filter((outcome) => outcome !== 'ok');
const sourceUrl = { type: 'string', minLength: 1 } as const;
const openAlexData = {
  type: 'object', additionalProperties: false,
  required: ['id', 'doi', 'title', 'is_retracted', 'publication_date'],
  properties: { id: { type: 'string' }, doi: { type: 'string' }, title: { type: 'string' }, is_retracted: { type: 'boolean' }, publication_date: { type: 'string' } },
} as const;
const integrityEvent = {
  type: 'object', additionalProperties: false,
  required: ['relation', 'type', 'notice_doi', 'source_kind', 'updated_date'],
  properties: {
    relation: { enum: ['update-to', 'updated-by'] }, type: { enum: ['retraction', 'expression_of_concern'] }, notice_doi: { type: 'string' },
    source_kind: { enum: ['publisher', 'retraction-watch', 'other'] }, updated_date: { type: 'string' },
  },
} as const;
const crossrefData = {
  type: 'object', additionalProperties: false,
  required: ['doi', 'title', 'integrity_events'],
  properties: { doi: { type: 'string' }, title: { type: 'string' }, integrity_events: { type: 'array', items: integrityEvent } },
} as const;
function sourceSchema(data: object) {
  return { oneOf: [
    { type: 'object', additionalProperties: false, required: ['outcome', 'data', 'source_url'], properties: { outcome: { const: 'ok' }, data, source_url: sourceUrl } },
    { type: 'object', additionalProperties: false, required: ['outcome', 'source_url'], properties: { outcome: { enum: failureOutcomes }, source_url: sourceUrl } },
  ] } as const;
}

export const verificationResultSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object', additionalProperties: false,
  required: ['doi', 'status', 'card_type', 'colors', 'sources', 'timings_ms', 'cache'],
  properties: {
    doi: { type: 'string' }, status: { enum: ['ok', 'retracted', 'eoc', 'unknown'] },
    card_type: { type: ['string', 'null'], enum: ['corroborated', 'openalex_only', 'crossref_only', 'disagree', 'eoc_only', null] },
    colors: { type: 'object', additionalProperties: false, required: ['integrity'], properties: { integrity: { enum: ['red', 'amber', 'green', 'gray'] } } },
    sources: { type: 'object', additionalProperties: false, required: ['openalex', 'crossref'], properties: { openalex: sourceSchema(openAlexData), crossref: sourceSchema(crossrefData) } },
    timings_ms: { type: 'object', additionalProperties: false, required: ['total', 'openalex', 'crossref'], properties: { total: { type: 'number', minimum: 0 }, openalex: { type: 'number', minimum: 0 }, crossref: { type: 'number', minimum: 0 } } },
    cache: { type: 'object', additionalProperties: false, required: ['state'], properties: { state: { enum: ['hit', 'miss', 'shared'] } } },
  },
} as const;

type VerificationCardType = 'corroborated' | 'openalex_only' | 'crossref_only' | 'disagree' | 'eoc_only';
export interface VerificationProjection {
  doi: string;
  status: 'ok' | 'retracted' | 'eoc' | 'unknown';
  cardType?: VerificationCardType;
  integrityColor: 'red' | 'amber' | 'green' | 'gray';
  sources: Record<'openalex' | 'crossref', { outcome: typeof outcomes[number]; source_url: string }>;
}
export type VerificationFirewallResult =
  | { ok: true; value: VerificationProjection }
  | { ok: false; error: { code: 'INVALID_JSON' | 'SCHEMA_VALIDATION' | 'INVALID_DOI' | 'UNSAFE_PROVENANCE_URL'; path: string } };

const validate = new Ajv2020({ strict: true, allErrors: false }).compile(verificationResultSchema);
const allowedHosts = { openalex: 'api.openalex.org', crossref: 'api.crossref.org' } as const;

function pointer(errors: ErrorObject[] | null | undefined): string {
  return errors?.[0]?.instancePath ?? '';
}

export function parseVerificationResult(input: unknown): VerificationFirewallResult {
  let value = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input) as unknown; }
    catch { return { ok: false, error: { code: 'INVALID_JSON', path: '' } }; }
  }
  if (!validate(value)) return { ok: false, error: { code: 'SCHEMA_VALIDATION', path: pointer(validate.errors) } };
  const raw = value as {
    doi: string; status: VerificationProjection['status']; card_type: VerificationCardType | null;
    colors: { integrity: VerificationProjection['integrityColor'] };
    sources: Record<'openalex' | 'crossref', { outcome: typeof outcomes[number]; source_url: string }>;
  };
  const doi = normalizeDoi(raw.doi);
  if (doi === null) return { ok: false, error: { code: 'INVALID_DOI', path: '/doi' } };
  for (const source of ['openalex', 'crossref'] as const) {
    const path = `/sources/${source}/source_url`;
    try {
      const url = new URL(raw.sources[source].source_url);
      if (url.protocol !== 'https:' || url.hostname !== allowedHosts[source] || url.username !== '' || url.password !== '') {
        return { ok: false, error: { code: 'UNSAFE_PROVENANCE_URL', path } };
      }
    } catch { return { ok: false, error: { code: 'UNSAFE_PROVENANCE_URL', path } }; }
  }
  const projected = {
    doi, status: raw.status, integrityColor: raw.colors.integrity,
    sources: {
      openalex: { outcome: raw.sources.openalex.outcome, source_url: raw.sources.openalex.source_url },
      crossref: { outcome: raw.sources.crossref.outcome, source_url: raw.sources.crossref.source_url },
    },
  };
  return raw.card_type === null ? { ok: true, value: projected } : { ok: true, value: { ...projected, cardType: raw.card_type } };
}
