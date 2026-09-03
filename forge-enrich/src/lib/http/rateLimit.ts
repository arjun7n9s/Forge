interface Bucket { count: number; resetAt: number }

export interface RateLimitResult {
  ok: boolean;
  scope?: 'ip' | 'doi';
  remaining: number;
  resetAt: number;
}

export function createRateLimiter(options: { windowMs: number; ipMax: number; doiMax: number }) {
  const ipBuckets = new Map<string, Bucket>();
  const doiBuckets = new Map<string, Bucket>();

  const inspect = (buckets: Map<string, Bucket>, key: string, max: number, now: number): RateLimitResult => {
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) return { ok: true, remaining: max - 1, resetAt: now + options.windowMs };
    if (current.count >= max) return { ok: false, remaining: 0, resetAt: current.resetAt };
    return { ok: true, remaining: max - current.count - 1, resetAt: current.resetAt };
  };
  const commit = (buckets: Map<string, Bucket>, key: string, max: number, now: number): RateLimitResult => {
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + options.windowMs;
      buckets.set(key, { count: 1, resetAt });
      return { ok: true, remaining: max - 1, resetAt };
    }
    current.count += 1;
    return { ok: true, remaining: max - current.count, resetAt: current.resetAt };
  };

  const api = {
    check(ip: string, doi?: string): RateLimitResult {
      return api.checkMany(ip, doi ? [doi] : []);
    },
    checkMany(ip: string, dois: readonly string[]): RateLimitResult {
      const now = Date.now();
      const ipInspect = inspect(ipBuckets, ip, options.ipMax, now);
      if (!ipInspect.ok) return { ...ipInspect, scope: 'ip' };
      for (const doi of dois) {
        const doiInspect = inspect(doiBuckets, `${ip}:${doi}`, options.doiMax, now);
        if (!doiInspect.ok) return { ...doiInspect, scope: 'doi' };
      }
      for (const doi of dois) commit(doiBuckets, `${ip}:${doi}`, options.doiMax, now);
      return { ...commit(ipBuckets, ip, options.ipMax, now) };
    },
  };
  return api;
}

export const verificationLimiter = createRateLimiter({ windowMs: 60_000, ipMax: 60, doiMax: 20 });

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function retryAfterSeconds(resetAt: number): string {
  return String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
}
