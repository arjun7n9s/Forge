import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { crossrefSchema, openAlexSchema } from './schemas.js';
import type { CrossrefIntegrityEvent, CrossrefProjected, OpenAlexProjected } from './contracts.js';
import { normalizeDoi } from './doi.js';

export { openAlexSchema, crossrefSchema };

export interface FirewallError {
  code: 'INVALID_JSON' | 'SCHEMA_VALIDATION' | 'INVALID_DOI';
  /** RFC 6901 JSON pointer; never a provider-authored value. */
  path: string;
}
export type FirewallResult<T> = { ok: true; value: T } | { ok: false; error: FirewallError };

type JsonRecord = Record<string, unknown>;

function safeInput(input: unknown): FirewallResult<unknown> {
  if (typeof input !== 'string') return { ok: true, value: input };
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch {
    return { ok: false, error: { code: 'INVALID_JSON', path: '' } };
  }
}

function validationError(errors: ErrorObject[] | null | undefined): FirewallResult<never> {
  const first = errors?.[0];
  return { ok: false, error: { code: 'SCHEMA_VALIDATION', path: first?.instancePath ?? '' } };
}

function objectValue(value: unknown): JsonRecord {
  return value as JsonRecord;
}

function normalizeCrossrefType(type: unknown): CrossrefIntegrityEvent['type'] | null {
  if (type === 'retraction') return 'retraction';
  if (type === 'expression-of-concern' || type === 'expression_of_concern') return 'expression_of_concern';
  return null;
}

function normalizeSourceKind(source: unknown): CrossrefIntegrityEvent['sourceKind'] {
  if (source === 'publisher') return 'publisher';
  if (source === 'retraction-watch') return 'retraction-watch';
  return 'other';
}

export interface TrustFirewall {
  openAlex(input: unknown): FirewallResult<OpenAlexProjected>;
  crossref(input: unknown): FirewallResult<CrossrefProjected>;
}

export function createTrustFirewall(): TrustFirewall {
  const ajv = new Ajv2020({ strict: true, allErrors: false });
  const validateOpenAlex: ValidateFunction = ajv.compile(openAlexSchema);
  const validateCrossref: ValidateFunction = ajv.compile(crossrefSchema);

  return {
    openAlex(input) {
      const parsed = safeInput(input);
      if (!parsed.ok) return parsed;
      if (!validateOpenAlex(parsed.value)) return validationError(validateOpenAlex.errors);
      const raw = objectValue(parsed.value);
      const rawDoi = raw['doi'];
      const doi = rawDoi === null ? null : normalizeDoi(String(rawDoi));
      if (rawDoi !== null && doi === null) return { ok: false, error: { code: 'INVALID_DOI', path: '/doi' } };
      return {
        ok: true,
        value: {
          id: String(raw['id']),
          doi,
          title: String(raw['title']),
          isRetracted: Boolean(raw['is_retracted']),
          publicationDate: String(raw['publication_date']),
        },
      };
    },

    crossref(input) {
      const parsed = safeInput(input);
      if (!parsed.ok) return parsed;
      if (!validateCrossref(parsed.value)) return validationError(validateCrossref.errors);
      const raw = objectValue(parsed.value);
      const doi = normalizeDoi(String(raw['DOI']));
      if (doi === null) return { ok: false, error: { code: 'INVALID_DOI', path: '/DOI' } };
      const title = (raw['title'] as unknown[])[0];
      const integrityEvents: CrossrefIntegrityEvent[] = [];
      for (const relation of ['update-to', 'updated-by'] as const) {
        for (const candidate of (raw[relation] as unknown[] | undefined) ?? []) {
          const event = objectValue(candidate);
          const type = normalizeCrossrefType(event['type']);
          const noticeDoi = normalizeDoi(String(event['DOI']));
          const updated = objectValue(event['updated']);
          if (type !== null && noticeDoi !== null) {
            integrityEvents.push({
              type,
              relation,
              noticeDoi,
              sourceKind: normalizeSourceKind(event['source']),
              updatedDate: String(updated['date-time']),
            });
          }
        }
      }
      return { ok: true, value: { doi, title: String(title), integrityEvents } };
    },
  };
}
