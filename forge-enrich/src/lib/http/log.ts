const REDACTED_KEYS = /^(doi|dois|authorization|cookie|access[-_]?key|x-access-key|forge_session)$/i;

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACTED_KEYS.test(key) || key.toLowerCase().includes('doi')) {
      out[`${key}Fingerprint`] = typeof value === 'string' ? fingerprint(value) : Array.isArray(value) ? value.length : 'redacted';
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...redact(fields) }));
}
