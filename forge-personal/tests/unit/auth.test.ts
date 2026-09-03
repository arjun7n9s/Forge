import { describe, expect, it } from 'vitest';
import { hashAccessKey, issueSession, verifyAccessKey, verifySession } from '@/lib/server/auth';

describe('workspace session authentication', () => {
  it('verifies only the configured access-key hash', async () => {
    const expected = await hashAccessKey('correct horse battery staple');
    await expect(verifyAccessKey('correct horse battery staple', expected)).resolves.toBe(true);
    await expect(verifyAccessKey('wrong key', expected)).resolves.toBe(false);
  });

  it('issues a signed expiring session and rejects tampering', async () => {
    const secret = 'session-secret-with-at-least-32-characters';
    const token = await issueSession(secret, { nowMs: 1_000, ttlMs: 60_000, nonce: 'fixed-nonce' });
    await expect(verifySession(token, secret, 30_000)).resolves.toMatchObject({ valid: true, expiresAt: 61_000 });
    await expect(verifySession(`${token.slice(0, -1)}x`, secret, 30_000)).resolves.toEqual({ valid: false });
    await expect(verifySession(token, 'different-session-secret-32-characters', 30_000)).resolves.toEqual({ valid: false });
  });

  it('rejects an expired or malformed session without throwing', async () => {
    const secret = 'session-secret-with-at-least-32-characters';
    const token = await issueSession(secret, { nowMs: 1_000, ttlMs: 500, nonce: 'fixed-nonce' });
    await expect(verifySession(token, secret, 1_501)).resolves.toEqual({ valid: false });
    await expect(verifySession('not-a-token', secret, 1_000)).resolves.toEqual({ valid: false });
  });
});
