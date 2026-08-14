/**
 * @fileoverview 校验 CSS 设计令牌引用与断点纪律，防止静默失效的样式进入仓库。
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const tokenSource = path.join(repositoryRoot, 'apps/web/src/app/theme.css');
const scanRoots = ['apps/web/src', 'packages/ui/src'].map((root) =>
  path.join(repositoryRoot, root),
);
/** 断点双档制：48em 与 80em。 */
const allowedBreakpoints = new Set(['48em', '80em']);
const mantineInternalVariables = new Set(['--mantine-breakpoint-xs']);

/** 用于递归收集 CSS 文件且不进入生成目录。 */
async function collectCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist', '.next', '.turbo'].includes(entry.name)) {
      files.push(...(await collectCssFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      files.push(entryPath);
    }
  }
  return files;
}

/** 用于从 theme.css 提取全部自定义属性定义。 */
async function readDefinedTokens() {
  const content = await readFile(tokenSource, 'utf8');
  return new Set([...content.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gmu)].map((match) => match[1]));
}

/** 用于返回 CSS 文件中引用但未定义的令牌。 */
function findUndefinedTokens(content, defined) {
  const referenced = [...content.matchAll(/var\((--[a-z0-9-]+)/gu)].map((match) => match[1]);
  return referenced.filter((name) => !defined.has(name) && !mantineInternalVariables.has(name));
}

/** 用于返回 @media 中超出双档制的断点字面量。 */
function findIllegalBreakpoints(content) {
  const mediaBlocks = [...content.matchAll(/@media[^{]+/gu)].map((match) => match[0]);
  const violations = [];
  for (const block of mediaBlocks) {
    const lengths = [...block.matchAll(/(\d+(?:\.\d+)?(?:px|rem|em))/gu)].map((match) => match[1]);
    if (block.includes('prefers-')) continue;
    for (const length of lengths) {
      if (!allowedBreakpoints.has(length)) violations.push(length);
    }
  }
  return violations;
}

/** 用于扫描全部 CSS 并汇总可定位的违规。 */
async function findViolations(defined) {
  const files = (await Promise.all(scanRoots.map(collectCssFiles))).flat().sort();
  const violations = [];
  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8');
    const relative = path.relative(repositoryRoot, filePath);
    for (const token of findUndefinedTokens(content, defined)) {
      violations.push(`${relative}: references undefined token var(${token})`);
    }
    for (const breakpoint of findIllegalBreakpoints(content)) {
      violations.push(`${relative}: non-canonical media breakpoint ${breakpoint}`);
    }
  }
  return violations;
}

/** 用于执行门禁并只报告可处理的违规或扫描失败。 */
async function main() {
  try {
    const defined = await readDefinedTokens();
    const violations = await findViolations(defined);
    if (violations.length > 0) {
      process.stderr.write(`Design token violations:\n${violations.join('\n')}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scanner failure';
    process.stderr.write(`Design token check failed: ${message}\n`);
    process.exitCode = 1;
  }
}

await main();
