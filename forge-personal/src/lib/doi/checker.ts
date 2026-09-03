import type { CitationResult } from '@/lib/domain/types';

const DOI_PATTERN = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:]+$/;
const GLOBAL_CACHE = new Map<string, CitationResult>();

export function normalizeDoi(value: string): string {
  return value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLowerCase();
}

export function extractCompleteDois(value: string): string[] {
  return [...new Set((value.match(DOI_PATTERN) ?? []).map((doi) => normalizeDoi(doi.replace(TRAILING_PUNCTUATION, ''))).filter((doi) => /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i.test(doi)))];
}

export function createDoiVerifier(transport: (doi: string) => Promise<CitationResult>, debounceMs = 450) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(doiInput: string): Promise<CitationResult & { cache: 'hit' | 'miss' }> {
      const doi = normalizeDoi(doiInput);
      const cached = GLOBAL_CACHE.get(doi);
      if (cached) return Promise.resolve({ ...cached, cache: 'hit' });
      if (timer) clearTimeout(timer);
      return new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          transport(doi).then((result) => {
            GLOBAL_CACHE.set(doi, result);
            resolve({ ...result, cache: 'miss' });
          }).catch(reject);
        }, debounceMs);
      });
    },
  };
}

export function clearDoiCache(): void {
  GLOBAL_CACHE.clear();
}
