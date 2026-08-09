/** @fileoverview Configures Next.js to compile shared workspace source packages. */

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@everlearn/ui'],
};

export default nextConfig;
