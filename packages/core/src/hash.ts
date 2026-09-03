export interface HashLink {
  previousHash: string;
  contentHash: string;
  linkHash: string;
}

const GENESIS_HASH = '0'.repeat(64);
const encoder = new TextEncoder();

export async function sha256(content: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deriveLinkHash(previousHash: string, contentHash: string): Promise<string> {
  return sha256(`${previousHash}:${contentHash}`);
}

export async function appendHashLink(chain: readonly HashLink[], content: string): Promise<HashLink> {
  const previousHash = chain.at(-1)?.linkHash ?? GENESIS_HASH;
  const contentHash = await sha256(content);
  const linkHash = await deriveLinkHash(previousHash, contentHash);
  return Object.freeze({ previousHash, contentHash, linkHash });
}

export type ChainVerification =
  | { valid: true }
  | { valid: false; index: number; code: 'CHAIN_MISMATCH' | 'HASH_MISMATCH' };

export async function verifyHashChain(chain: readonly HashLink[]): Promise<ChainVerification> {
  let expectedPrevious = GENESIS_HASH;
  for (let index = 0; index < chain.length; index += 1) {
    const link = chain[index];
    if (link === undefined || link.previousHash !== expectedPrevious) return { valid: false, index, code: 'CHAIN_MISMATCH' };
    if (link.linkHash !== await deriveLinkHash(link.previousHash, link.contentHash)) return { valid: false, index, code: 'HASH_MISMATCH' };
    expectedPrevious = link.linkHash;
  }
  return { valid: true };
}
