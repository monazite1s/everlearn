/**
 * @fileoverview 隔离单元、集成和组件测试并统一覆盖率门禁。
 */

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      exclude: [
        '**/*.spec.{ts,tsx}',
        'apps/{api,worker}/src/main.ts',
        'apps/web/src/app/layout.tsx',
        'apps/web/src/test/**',
      ],
      include: [
        'apps/{api,worker}/src/**/*.ts',
        'apps/web/src/app/**/*.{ts,tsx}',
        'packages/*/src/**/*.{ts,tsx}',
      ],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
    },
    projects: [
      {
        extends: true,
        test: {
          environment: 'node',
          exclude: ['**/*.integration.spec.ts'],
          include: ['apps/{api,worker}/src/**/*.spec.ts'],
          name: 'unit',
        },
      },
      {
        extends: true,
        test: {
          environment: 'node',
          // 集成测试共享真实 PostgreSQL，Kysely 内省在并行 schema 间相互污染，固定串行。
          fileParallelism: false,
          include: ['apps/api/src/**/*.integration.spec.ts'],
          name: 'integration',
          pool: 'forks',
        },
      },
      {
        extends: true,
        test: {
          environment: 'jsdom',
          include: [
            'apps/web/src/**/*.component.spec.tsx',
            'packages/ui/src/**/*.component.spec.tsx',
          ],
          name: 'component',
          setupFiles: ['apps/web/src/test/setup.ts'],
        },
      },
    ],
  },
});
