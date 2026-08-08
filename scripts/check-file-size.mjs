/**
 * @fileoverview Rejects oversized handwritten source and configuration files.
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
  '.js',
  '.json',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const ignoredFiles = new Set(['pnpm-lock.yaml']);

/** Returns whether a directory is generated or externally owned. */
function shouldIgnoreDirectory(name) {
  return ignoredDirectories.has(name);
}

/** Returns whether a file belongs to the handwritten formats covered by the limit. */
function shouldCheckFile(filePath) {
  return (
    !ignoredFiles.has(path.basename(filePath)) && checkedExtensions.has(path.extname(filePath))
  );
}

/** Recursively collects eligible files without following directory links. */
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

/** Counts physical lines without treating a final newline as an empty extra line. */
function countLines(content) {
  if (content.length === 0) {
    return 0;
  }

  const lines = content.split(/\r\n|\n|\r/u);
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

/** Finds files that exceed the hard line limit and returns stable relative paths. */
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

/** Runs the repository check and reports only actionable violations or scanner failures. */
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
