/**
 * @fileoverview 校验各应用 src 根目录只保留装配入口，防止文件平铺复发。
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
/** 各应用 src 根允许直属的文件名（路由约定与装配入口）；其余必须按职责归入子目录。 */
const allowedRootFiles = new Set([
  'main.ts',
  'app.module.ts',
  'layout.tsx',
  'page.tsx',
  'loading.tsx',
  'error.tsx',
  'globals.css',
  'theme.css',
  'theme-provider.tsx',
  'index.ts',
]);
const appSourceRoots = ['apps/api/src', 'apps/web/src', 'apps/worker/src'].map((root) =>
  path.join(repositoryRoot, root),
);

/** 用于返回 src 根直属的非白名单文件。 */
async function findViolations(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !allowedRootFiles.has(entry.name))
    .filter((entry) => /\.(?:ts|tsx|css)$/.test(entry.name))
    .map((entry) => entry.name);
}

/** 用于执行门禁并只报告可处理的违规或扫描失败。 */
async function main() {
  try {
    const violations = [];
    for (const directory of appSourceRoots) {
      for (const name of await findViolations(directory)) {
        violations.push(`${path.relative(repositoryRoot, directory)}/${name}`);
      }
    }
    if (violations.length > 0) {
      process.stderr.write(`结构违规（src 根只允许装配入口文件）:\n${violations.join('\n')}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scanner failure';
    process.stderr.write(`Structure check failed: ${message}\n`);
    process.exitCode = 1;
  }
}

await main();
