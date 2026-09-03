import { describe, expect, it } from 'vitest';
import { appendHashLink, sha256, verifyHashChain, type HashLink } from '../src/hash.js';

describe('hash helpers', () => {
  it('computes the standard SHA-256 vector', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('creates and verifies an immutable content chain', async () => {
    const first = await appendHashLink([], 'one');
    const second = await appendHashLink([first], 'two');
    expect(await verifyHashChain([first, second])).toEqual({ valid: true });
  });

  it('detects content and link tampering', async () => {
    const first = await appendHashLink([], 'one');
    const second = await appendHashLink([first], 'two');
    const tampered: HashLink[] = [first, { ...second, contentHash: await sha256('evil') }];
    expect(await verifyHashChain(tampered)).toEqual({ valid: false, index: 1, code: 'HASH_MISMATCH' });
    expect(await verifyHashChain([{ ...first, previousHash: 'bad' }])).toEqual({ valid: false, index: 0, code: 'CHAIN_MISMATCH' });
  });
});
