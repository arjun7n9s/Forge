const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

async function hmac(payload: string, secret: string): Promise<Uint8Array> {
  if (secret.length < 32) throw new Error('SESSION_SECRET_TOO_SHORT');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

export async function hashAccessKey(accessKey: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(accessKey))));
}

export async function verifyAccessKey(accessKey: string, expectedHash: string): Promise<boolean> {
  const expected = fromHex(expectedHash);
  if (expected === null || accessKey.length < 12) return false;
  const actual = fromHex(await hashAccessKey(accessKey));
  return actual !== null && constantTimeEqual(actual, expected);
}

export async function hashSessionToken(token: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))));
}

export async function issueSession(
  secret: string,
  options: { nowMs?: number; ttlMs?: number; nonce?: string } = {},
): Promise<string> {
  const nowMs = options.nowMs ?? Date.now();
  const nonce = options.nonce ?? toBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const payload = toBase64Url(encoder.encode(JSON.stringify({ exp: nowMs + (options.ttlMs ?? 43_200_000), nonce })));
  return `${payload}.${toBase64Url(await hmac(payload, secret))}`;
}

export async function verifySession(
  token: string,
  secret: string,
  nowMs = Date.now(),
): Promise<{ valid: true; expiresAt: number } | { valid: false }> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };
    const [payload, signature] = parts as [string, string];
    const supplied = new Uint8Array(Buffer.from(signature, 'base64url'));
    const expected = await hmac(payload, secret);
    if (!constantTimeEqual(supplied, expected)) return { valid: false };
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown; nonce?: unknown };
    if (typeof decoded.exp !== 'number' || !Number.isSafeInteger(decoded.exp) || typeof decoded.nonce !== 'string' || decoded.nonce.length < 6 || decoded.exp <= nowMs) return { valid: false };
    return { valid: true, expiresAt: decoded.exp };
  } catch {
    return { valid: false };
  }
}
