import { describe, expect, it } from 'vitest';
import { appendHashLink, verifyHashChain } from '@/lib/domain/hash';

describe('hash chain', () => {
  it('detects tampering at the exact link', async () => {
    const first = await appendHashLink([], 'note-a', 'first');
    const chain = await appendHashLink(first, 'note-a', 'second');
    expect(await verifyHashChain(chain)).toEqual({ valid: true });
    const tampered = chain.map((link, index) => index === 0 ? { ...link, body: 'changed' } : link);
    expect(await verifyHashChain(tampered)).toMatchObject({ valid: false, index: 0 });
  });
});
