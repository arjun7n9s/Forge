export const openAlexSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://forge.local/schemas/openalex.projected.json',
  type: 'object',
  required: ['id', 'doi', 'title', 'is_retracted', 'publication_date'],
  properties: {
    id: { type: 'string', minLength: 1 },
    doi: { type: ['string', 'null'] },
    title: { type: 'string' },
    is_retracted: { type: 'boolean' },
    publication_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
  additionalProperties: true,
} as const;

const crossrefIntegrityEvents = {
  type: 'array',
  items: {
    type: 'object',
    required: ['type', 'DOI', 'updated'],
    properties: {
      type: { type: 'string' },
      DOI: { type: 'string' },
      source: { type: 'string' },
      updated: {
        type: 'object',
        required: ['date-time'],
        properties: { 'date-time': { type: 'string' } },
        additionalProperties: true,
      },
    },
    additionalProperties: true,
  },
} as const;

export const crossrefSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://forge.local/schemas/crossref.projected.json',
  type: 'object',
  required: ['DOI', 'title'],
  properties: {
    DOI: { type: 'string', minLength: 1 },
    title: { type: 'array', minItems: 1, maxItems: 1, items: { type: 'string' } },
    'update-to': crossrefIntegrityEvents,
    'updated-by': crossrefIntegrityEvents,
  },
  additionalProperties: true,
} as const;
