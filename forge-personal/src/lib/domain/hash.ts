import type { HashLink } from './types';

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashBody(body: string): Promise<string> {
  return digest(body);
}

export async function appendHashLink(chain: HashLink[], noteId: string, body: string): Promise<HashLink[]> {
  const prevHash = chain.at(-1)?.hash ?? 'GENESIS';
  const hash = await digest(`${noteId}\n${prevHash}\n${body}`);
  return [...chain, { noteId, body, prevHash, hash, createdAt: new Date().toISOString() }];
}

export async function verifyHashChain(chain: HashLink[]): Promise<{ valid: true } | { valid: false; index: number }> {
  for (let index = 0; index < chain.length; index += 1) {
    const link = chain[index];
    if (!link) continue;
    const expectedPrev = index === 0 ? 'GENESIS' : chain[index - 1]?.hash;
    const expectedHash = await digest(`${link.noteId}\n${link.prevHash}\n${link.body}`);
    if (link.prevHash !== expectedPrev || link.hash !== expectedHash) return { valid: false, index };
  }
  return { valid: true };
}
