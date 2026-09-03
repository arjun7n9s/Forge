import { describe, expect, it, vi } from 'vitest';
import { createDoiVerifier, extractCompleteDois } from '@/lib/doi/checker';

describe('DOI preventive checker', () => {
  it('only extracts complete normalized DOIs', () => {
    expect(extractCompleteDois('partial 10.1038/ and complete DOI:10.1038/nature14539.')).toEqual(['10.1038/nature14539']);
  });

  it('debounces and globally caches the same DOI', async () => {
    vi.useFakeTimers();
    const transport = vi.fn().mockResolvedValue({ status: 'ok', sources: {} });
    const verifier = createDoiVerifier(transport, 450);
    const first = verifier.schedule('10.1038/nature14539');
    await vi.advanceTimersByTimeAsync(450);
    await expect(first).resolves.toMatchObject({ status: 'ok', cache: 'miss' });
    await expect(verifier.schedule('10.1038/NATURE14539')).resolves.toMatchObject({ cache: 'hit' });
    expect(transport).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
