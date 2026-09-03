/**
 * @param {{ frameAncestors?: string, originTrial?: string, hsts?: boolean }} [options]
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders(options = {}) {
  const frameAncestors = options.frameAncestors ?? "'none'";
  const headers = [
    { key: 'Origin-Agent-Cluster', value: '?1' },
    { key: 'Permissions-Policy', value: 'tools=(self)' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    {
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self' https://api.openalex.org https://api.crossref.org",
        "frame-src 'none'",
        `frame-ancestors ${frameAncestors}`,
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    },
  ];
  if (options.hsts !== false) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
  }
  if (options.originTrial) headers.push({ key: 'Origin-Trial', value: options.originTrial });
  return headers;
}

export const REQUIRED_HEADER_NAMES = [
  'origin-agent-cluster',
  'permissions-policy',
  'x-content-type-options',
  'referrer-policy',
  'content-security-policy',
  'strict-transport-security',
];
