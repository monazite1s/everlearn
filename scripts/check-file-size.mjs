/**
 * @fileoverview 阻止手写源码和配置文件超过规模上限。
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_LINES = 400;
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'migrations',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const checkedExtensions = new Set([
  '.cjs',
  '.css',
  '.cts',
  '.js',
  '.json',
  '.mjs',
  '.mts',
  '.sql',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const ignoredFiles = new Set(['pnpm-lock.yaml']);
/** shadcn CLI 生成的 vendored 组件源码（第三方代码豁免，ADR 001）。 */
const ignoredPathPrefixes = [path.join('packages', 'ui', 'src', 'components')];

/** 用于跳过生成目录和外部依赖目录。 */
function shouldIgnoreDirectory(name) {
  return ignoredDirectories.has(name);
}

/** 用于识别受规模门禁约束的手写文件。 */
function shouldCheckFile(filePath) {
  const relativePath = path.relative(repositoryRoot, filePath);
  const underVendoredPrefix = ignoredPathPrefixes.some((prefix) => relativePath.startsWith(prefix));
  return (
    !underVendoredPrefix &&
    !ignoredFiles.has(path.basename(filePath)) &&
    checkedExtensions.has(path.extname(filePath))
  );
}

/** 用于递归收集文件且不跟随目录链接。 */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !shouldIgnoreDirectory(entry.name)) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile() && shouldCheckFile(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

/** 用于统计物理行并忽略末尾换行产生的空项。 */
function countLines(content) {
  if (content.length === 0) {
    return 0;
  }

  const lines = content.split(/\r\n|\n|\r/u);
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

/** 用于返回超过硬上限的稳定相对路径。 */
async function findViolations() {
  const files = await collectFiles(repositoryRoot);
  const violations = [];

  for (const filePath of files.sort()) {
    const content = await readFile(filePath, 'utf8');
    const lineCount = countLines(content);
    if (lineCount > MAX_LINES) {
      violations.push(`${path.relative(repositoryRoot, filePath)}: ${lineCount} lines`);
    }
  }

  return violations;
}

/** 用于执行门禁并只报告可处理的违规或扫描失败。 */
async function main() {
  try {
    const violations = await findViolations();
    if (violations.length > 0) {
      process.stderr.write(`Files exceed ${MAX_LINES} lines:\n${violations.join('\n')}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scanner failure';
    process.stderr.write(`File-size check failed: ${message}\n`);
    process.exitCode = 1;
  }
}

await main();
