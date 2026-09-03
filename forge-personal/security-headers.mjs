/**
 * @param {{ frameSrc?: string, frameAncestors?: string, originTrial?: string, hsts?: boolean }} [options]
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders(options = {}) {
  const frameSrc = options.frameSrc ?? "'none'";
  const frameAncestors = options.frameAncestors ?? "'none'";
  const connectSrc = options.frameSrc && options.frameSrc !== "'none'"
    ? `'self' ${options.frameSrc}`
    : "'self'";
  const headers = [
    { key: 'Origin-Agent-Cluster', value: '?1' },
    { key: 'Permissions-Policy', value: 'tools=(self)' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'X-Frame-Options', value: frameAncestors === "'none'" ? 'DENY' : 'SAMEORIGIN' },
    {
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        `connect-src ${connectSrc}`,
        `frame-src ${frameSrc}`,
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
