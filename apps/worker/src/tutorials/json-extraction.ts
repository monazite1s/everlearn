/**
 * @fileoverview 从 LLM 输出中稳健提取首个平衡 JSON 对象。
 */

// ponytail: 与 apps/api/src/ai/json-extraction.ts 逐行同源复制；
// Worker rootDir 限制无法跨包共享，升级条件为提取函数下沉到共享 packages。

/** 用于剥除 Markdown 代码栅栏并返回正文。 */
function stripFences(text: string): string {
  return text.replace(/```[a-zA-Z]*\s*\n?/gu, '');
}

/** 用于扫描字符串字面量的结束引号下标，转义不终止扫描。 */
function findStringEnd(text: string, quoteStart: number): number {
  for (let index = quoteStart + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === '"') return index;
  }
  return -1;
}

/** 用于从对象起点扫描平衡花括号并返回结束下标，缺失返回 -1。 */
function findObjectEnd(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      index = findStringEnd(text, index);
      if (index < 0) return -1;
    } else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** 用于从 LLM 文本提取首个完整 JSON 对象，失败返回 null。 */
export function extractJsonObject(text: string): unknown {
  const cleaned = stripFences(text);
  for (let index = cleaned.indexOf('{'); index >= 0; index = cleaned.indexOf('{', index + 1)) {
    const end = findObjectEnd(cleaned, index);
    if (end < 0) break;
    try {
      return JSON.parse(cleaned.slice(index, end + 1)) as unknown;
    } catch {
      continue;
    }
  }
  return null;
}
