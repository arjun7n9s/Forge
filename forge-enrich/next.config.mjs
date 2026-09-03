import { securityHeaders } from './security-headers.mjs';

const personalOrigin = process.env.NEXT_PUBLIC_FORGE_ORIGIN ?? process.env.FORGE_PERSONAL_ORIGIN ?? 'http://localhost:3000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  agentRules: false,
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [{
      source: '/:path*',
      headers: securityHeaders({
        frameAncestors: personalOrigin,
        hsts: true,
      }),
    }];
  },
};
export default nextConfig;
