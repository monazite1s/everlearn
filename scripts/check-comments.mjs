/**
 * @fileoverview 检查手写源码的中文注释和非脚本文件头。
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const codeExtensions = new Set(['.cjs', '.cts', '.js', '.mjs', '.mts', '.ts', '.tsx']);
const headerExtensions = new Set(['.css', '.sh', '.sql', '.yaml', '.yml']);
const headerFiles = new Set([
  '.env.example',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.prettierignore',
]);
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  '.cache',
  'blob-report',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
  'tmp',
]);
const ignoredFiles = new Set(['next-env.d.ts', 'pnpm-lock.yaml']);
/** shadcn CLI 生成的 vendored 组件源码（第三方代码豁免，ADR 001）。 */
const ignoredPathPrefixes = [path.join('packages', 'ui', 'src', 'components')];
const chineseText = /\p{Script=Han}/u;

/** 用于判断目录是否由工具生成或由外部依赖拥有。 */
function shouldIgnoreDirectory(name) {
  return ignoredDirectories.has(name);
}

/** 用于识别需要检查自然语言注释的手写文件。 */
function shouldCheckFile(filePath) {
  const relativePath = path.relative(repositoryRoot, filePath);
  const underVendoredPrefix = ignoredPathPrefixes.some((prefix) => relativePath.startsWith(prefix));
  const extension = path.extname(filePath);
  return (
    !underVendoredPrefix &&
    !ignoredFiles.has(path.basename(filePath)) &&
    (codeExtensions.has(extension) ||
      headerExtensions.has(extension) ||
      headerFiles.has(path.basename(filePath)))
  );
}

/** 用于递归收集受注释规范约束的文件。 */
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

/** 用于排除 shebang 和纯工具指令，工具指令不属于自然语言。 */
function isMachineDirective(comment) {
  return /^(?:#!|#\s*shellcheck\b|#\s*[A-Z][A-Z0-9_]*=|\/\/\/\s*<reference\b)/u.test(
    comment.trim(),
  );
}

/** 用于通过 TypeScript 语法树提取代码注释并避开字符串和正则内容。 */
function extractCodeComments(content, filePath) {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const ranges = new Map();

  /** 用于按起始位置去重语法树返回的注释范围。 */
  function addRanges(commentRanges = []) {
    for (const range of commentRanges) {
      ranges.set(range.pos, range);
    }
  }

  /** 用于收集每个语法节点前后的注释范围。 */
  function visit(node) {
    addRanges(ts.getLeadingCommentRanges(content, node.getFullStart()));
    addRanges(ts.getTrailingCommentRanges(content, node.end));
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...ranges.values()]
    .sort((left, right) => left.pos - right.pos)
    .map((range) => ({
      line: sourceFile.getLineAndCharacterOfPosition(range.pos).line + 1,
      text: content.slice(range.pos, range.end),
    }));
}

/** 用于提取 CSS、SQL、Shell 和 YAML 中独占一行的注释。 */
function extractHeaderLanguageComments(content, extension) {
  const pattern =
    extension === '.css'
      ? /\/\*[\s\S]*?\*\//gu
      : extension === '.sql'
        ? /\/\*[\s\S]*?\*\/|--[^\r\n]*/gu
        : /(?:^|[ \t])(#[^\r\n]*)/gmu;
  return [...content.matchAll(pattern)].map((match) => {
    const text = match[1] ?? match[0];
    const position = match.index + match[0].indexOf(text);
    return { line: content.slice(0, position).split('\n').length, text };
  });
}

/** 用于确认非脚本文件的首个有效内容是中文说明。 */
function hasChineseHeader(content, extension) {
  const body = extension === '.sh' ? content.replace(/^#![^\r\n]*(?:\r?\n)?/u, '') : content;
  const firstLine = body.trimStart().split(/\r?\n/u)[0] ?? '';
  return chineseText.test(firstLine);
}

/** 用于收集缺少中文的注释和文件头。 */
async function findViolations() {
  const violations = [];
  const files = await collectFiles(repositoryRoot);
  let commentCount = 0;
  for (const filePath of files.sort()) {
    const content = await readFile(filePath, 'utf8');
    const extension = path.extname(filePath);
    const relativePath = path.relative(repositoryRoot, filePath);
    const requiresHeader =
      headerExtensions.has(extension) || headerFiles.has(path.basename(filePath));
    if (requiresHeader && !hasChineseHeader(content, extension)) {
      violations.push(`${relativePath}:1 缺少中文文件说明`);
    }
    const comments = codeExtensions.has(extension)
      ? extractCodeComments(content, filePath)
      : extractHeaderLanguageComments(content, extension);
    commentCount += comments.length;
    for (const comment of comments) {
      if (!isMachineDirective(comment.text) && !chineseText.test(comment.text)) {
        violations.push(`${relativePath}:${comment.line} 注释缺少中文`);
      }
    }
  }
  return { commentCount, fileCount: files.length, violations };
}

/** 用于执行全仓注释门禁并返回稳定错误列表。 */
async function main() {
  try {
    const { commentCount, fileCount, violations } = await findViolations();
    if (violations.length > 0) {
      process.stderr.write(`注释规范检查失败：\n${violations.join('\n')}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`注释规范检查通过：${fileCount} 个文件，${commentCount} 条注释。\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知扫描错误';
    process.stderr.write(`注释检查无法完成：${message}\n`);
    process.exitCode = 1;
  }
}

await main();
