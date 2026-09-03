import { securityHeaders } from './security-headers.mjs';

const enrichOrigin = process.env.NEXT_PUBLIC_ENRICH_ORIGIN ?? 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  agentRules: false,
  experimental: { typedEnv: true },
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [{
      source: '/:path*',
      headers: securityHeaders({
        frameSrc: enrichOrigin,
        frameAncestors: "'none'",
        hsts: true,
      }),
    }];
  },
};
export default nextConfig;
