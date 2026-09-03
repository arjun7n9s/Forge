export const DOI_REGEX = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;

const DOI_URL_PREFIX = /^https:\/\/doi\.org\//i;
const DOI_LABEL_PREFIX = /^doi:\s*/i;

/** Return the lower-case DOI cache key, or null for non-canonical/partial input. */
export function normalizeDoi(input: string): string | null {
  const trimmed = input.trim();
  const candidate = DOI_URL_PREFIX.test(trimmed)
    ? trimmed.replace(DOI_URL_PREFIX, '')
    : DOI_LABEL_PREFIX.test(trimmed)
      ? trimmed.replace(DOI_LABEL_PREFIX, '')
      : trimmed;
  if (!DOI_REGEX.test(candidate)) return null;
  return candidate.toLowerCase();
}
