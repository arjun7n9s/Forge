import { describe, expect, it } from 'vitest';
import { REQUIRED_HEADER_NAMES, securityHeaders } from '../../security-headers.mjs';
import { originTrialAllowsWebMcp, originTrialConfigured } from '@/lib/webmcp/originTrial';

describe('personal security headers', () => {
  it('matches enrich isolation headers and adds CSP plus HSTS', () => {
    const headers = securityHeaders({ frameSrc: 'https://enrich.example', frameAncestors: "'none'" });
    const names = headers.map((header) => header.key.toLowerCase());
    for (const name of REQUIRED_HEADER_NAMES) expect(names).toContain(name);
    const csp = headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('frame-src https://enrich.example');
    expect(headers.find((header) => header.key === 'Origin-Agent-Cluster')?.value).toBe('?1');
    expect(headers.find((header) => header.key === 'Permissions-Policy')?.value).toBe('tools=(self)');
    expect(headers.find((header) => header.key === 'Referrer-Policy')?.value).toBe('no-referrer');
    expect(headers.find((header) => header.key === 'X-Frame-Options')?.value).toBe('DENY');
    expect(headers.find((header) => header.key === 'Strict-Transport-Security')?.value).toContain('max-age=31536000');
  });
});

describe('origin trial fail-closed', () => {
  it('does not claim a configured trial when the token is absent', () => {
    expect(originTrialConfigured()).toBe(false);
    expect(originTrialAllowsWebMcp()).toBe(process.env.NODE_ENV !== 'production');
  });
});
