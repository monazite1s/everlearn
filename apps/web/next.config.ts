/** @fileoverview 配置共享包和透明同源 API 边界。 */

import type { NextConfig } from 'next';

const DEFAULT_API_ORIGIN = 'http://127.0.0.1:3001';

/** 用于在 Next 生成重写规则前校验服务端 API Origin。 */
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

/** 用于代理浏览器 API 请求且不改写状态码、DTO 或错误。 */
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
