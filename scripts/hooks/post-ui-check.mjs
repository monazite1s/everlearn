/**
 * @fileoverview PostToolUse hook：UI 文件编辑后立即执行设计令牌门禁。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectDir = process.env.ZCODE_PROJECT_DIR ?? process.cwd();

/** 用于从事件载荷解析被改文件路径。 */
function readEditedPath() {
  try {
    const raw = readFileSync(0, 'utf8');
    const input = JSON.parse(raw || '{}');
    return typeof input.tool_input?.file_path === 'string' ? input.tool_input.file_path : null;
  } catch {
    return null;
  }
}

/** 用于只对 UI 层源码文件执行检查。 */
function isUiSource(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const inUiScope =
    normalized.includes('/apps/web/src/') || normalized.includes('/packages/ui/src/');
  return inUiScope && /\.(css|tsx?|mjs)$/.test(normalized);
}

/** 用于运行令牌门禁并透传失败输出。 */
function runTokenCheck() {
  const script = path.join(projectDir, 'scripts', 'check-design-tokens.mjs');
  const output = execFileSync('node', [script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output;
}

const filePath = readEditedPath();
if (filePath && isUiSource(filePath)) {
  try {
    runTokenCheck();
  } catch (error) {
    process.stderr.write(
      `check:design-tokens 违规（本次编辑 ${filePath}）：\n${error.stderr ?? error.message}\n`,
    );
    process.exit(1);
  }
}
