/** @fileoverview Configures shared packages and the transparent same-origin API boundary. */

import type { NextConfig } from 'next';

const DEFAULT_API_ORIGIN = 'http://127.0.0.1:3001';

/** Validates the server-only API origin before Next emits rewrite rules. */
function resolveApiOrigin(): string {
  const configured = process.env.API_INTERNAL_URL ?? DEFAULT_API_ORIGIN;
  const url = new URL(configured);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    Boolean(url.username || url.password || url.search || url.hash)
  ) {
    throw new Error('API_INTERNAL_URL must be an HTTP(S) origin without a path.');
  }
  return url.origin;
}

/** Proxies browser API requests without changing status codes, DTOs, or errors. */
function createApiRewrites() {
  return Promise.resolve([
    {
      destination: `${resolveApiOrigin()}/api/v1/:path*`,
      source: '/api/v1/:path*',
    },
  ]);
}

const nextConfig: NextConfig = {
  rewrites: createApiRewrites,
  transpilePackages: ['@everlearn/ui'],
};

export default nextConfig;
