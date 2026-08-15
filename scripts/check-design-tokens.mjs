/**
 * @fileoverview 校验 Tailwind 语义令牌纪律（ADR 001）：引用完整性、断点双档制与裸值禁令。
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const tokenSource = path.join(repositoryRoot, 'packages/ui/src/styles/globals.css');
const scanRoots = ['apps/web/src', 'packages/ui/src'].map((root) =>
  path.join(repositoryRoot, root),
);
/** shadcn CLI 生成的 vendored 组件不受项目纪律约束。 */
const vendoredPrefix = path.join('packages', 'ui', 'src', 'components');
/** CSS 与 Tailwind 断点双档制：md=48em 与 xl=80em。 */
const allowedBreakpoints = new Set(['48em', '80em']);
/** 业务源码禁止的断点变体与反模式类（ADR 002：dark: 仅限官方模式类，经评审把关）。 */
const forbiddenClassPatterns = [
  /\b(?:sm|lg|2xl|3xl):/u,
  /min-\[/u,
  /\bspace-[xy]-/u,
  /\bz-\[/u,
  /#[0-9a-fA-F]{3,8}\b/u,
  /(?:bg|text|border|ring|fill|stroke|from|to)-\[/u,
];

/** 用于递归收集受门禁约束的文件且不进入生成目录。 */
async function collectFiles(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const relative = path.relative(repositoryRoot, entryPath);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.next', '.turbo'].includes(entry.name)) continue;
      if (relative.startsWith(vendoredPrefix)) continue;
      files.push(...(await collectFiles(entryPath, extensions)));
    } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      if (!relative.startsWith(vendoredPrefix)) files.push(entryPath);
    }
  }
  return files;
}

/** 用于从主题入口提取全部自定义属性定义（裸值层 + @theme 映射层）。 */
async function readDefinedTokens() {
  const content = await readFile(tokenSource, 'utf8');
  return new Set([...content.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gmu)].map((match) => match[1]));
}

/** 用于确保普通链接在关闭浏览器默认描边后仍保留键盘焦点反馈。 */
async function checkLinkFocusStyle() {
  const content = await readFile(tokenSource, 'utf8');
  return /a:focus-visible\s*\{[^}]*outline:/su.test(content)
    ? []
    : ['packages/ui/src/styles/globals.css: missing visible focus style for links'];
}

/** 用于返回 CSS 文件中引用但未定义的令牌。 */
function findUndefinedTokens(content, defined) {
  const referenced = [...content.matchAll(/var\((--[a-z0-9-]+)/gu)].map((match) => match[1]);
  return referenced.filter((name) => !defined.has(name));
}

/** 用于返回 @media 中超出双档制的断点字面量。 */
function findIllegalBreakpoints(content) {
  const mediaBlocks = [...content.matchAll(/@media[^{]+/gu)].map((match) => match[0]);
  const violations = [];
  for (const block of mediaBlocks) {
    if (block.includes('prefers-')) continue;
    const lengths = [...block.matchAll(/(\d+(?:\.\d+)?(?:px|rem|em))/gu)].map((match) => match[1]);
    for (const length of lengths) {
      if (!allowedBreakpoints.has(length)) violations.push(length);
    }
  }
  return violations;
}

/** 用于返回业务源码中违反 Tailwind 纪律的类名片段。 */
function findForbiddenClasses(content) {
  const violations = [];
  for (const pattern of forbiddenClassPatterns) {
    for (const match of content.matchAll(new RegExp(pattern.source, 'gu'))) {
      violations.push(match[0]);
    }
  }
  return [...new Set(violations)];
}

/** 用于扫描 CSS 与 TSX 并汇总可定位的违规。 */
async function findViolations(defined) {
  const violations = [];
  const cssFiles = (
    await Promise.all(scanRoots.map((root) => collectFiles(root, new Set(['.css']))))
  )
    .flat()
    .sort();
  const codeFiles = (
    await Promise.all(scanRoots.map((root) => collectFiles(root, new Set(['.ts', '.tsx']))))
  )
    .flat()
    .sort();

  for (const filePath of cssFiles) {
    const content = await readFile(filePath, 'utf8');
    const relative = path.relative(repositoryRoot, filePath);
    if (filePath !== tokenSource) {
      for (const token of findUndefinedTokens(content, defined)) {
        violations.push(`${relative}: references undefined token var(${token})`);
      }
      for (const breakpoint of findIllegalBreakpoints(content)) {
        violations.push(`${relative}: non-canonical media breakpoint ${breakpoint}`);
      }
    }
  }

  for (const filePath of codeFiles) {
    const content = await readFile(filePath, 'utf8');
    const relative = path.relative(repositoryRoot, filePath);
    for (const token of findUndefinedTokens(content, defined)) {
      violations.push(`${relative}: references undefined token var(${token})`);
    }
    if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path.basename(filePath))) continue;
    for (const fragment of findForbiddenClasses(content)) {
      violations.push(`${relative}: forbidden Tailwind class "${fragment}"`);
    }
  }
  return violations;
}

/** 用于执行门禁并只报告可处理的违规或扫描失败。 */
async function main() {
  try {
    const defined = await readDefinedTokens();
    const violations = [...(await findViolations(defined)), ...(await checkLinkFocusStyle())];
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
