import { normalizeDoi as normalizeCoreDoi } from '@forge/core'

export function normalizeDoi(input: string): string {
  const doi = normalizeCoreDoi(input)
  if (doi === null) throw new Error('INVALID_DOI')
  return doi
}
