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

/** JSON 字符串字面量内反斜杠后允许跟随的转义目标字符。 */
const VALID_ESCAPE_CHARS = '"\\/bfnrtu';

/** 用于把字符串字面量内的裸控制字符映射为对应 JSON 转义。 */
const CONTROL_ESCAPES: Record<string, string> = {
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

/** 用于修复候选 JSON 中字符串字面量内的裸控制字符与非法转义序列。 */
function repairJsonText(text: string): string {
  let repaired = '';
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (!inString) {
      if (char === '"') inString = true;
      repaired += char;
      continue;
    }
    if (char === '"') {
      inString = false;
      repaired += char;
      continue;
    }
    if (char === '\\') {
      const next = text[index + 1];
      if (next !== undefined && VALID_ESCAPE_CHARS.includes(next)) {
        repaired += char + next;
        index += 1;
      } else {
        repaired += '\\\\';
      }
      continue;
    }
    const escaped = CONTROL_ESCAPES[char];
    if (escaped !== undefined) repaired += escaped;
    else if (char < ' ') repaired += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
    else repaired += char;
  }
  return repaired;
}

/** 用于尝试解析 JSON 文本，失败时返回 undefined 以区分合法的 null 解析值。 */
function tryParseJson(text: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return undefined;
  }
}

/** 用于在最后一个转义引号前补一个反斜杠使字符串得以闭合，无转义引号返回 null。 */
function fixTrailingEscapedQuote(text: string): string | null {
  const at = text.lastIndexOf('\\"');
  if (at < 0) return null;
  return `${text.slice(0, at)}\\\\"${text.slice(at + 2)}`;
}

/** 用于扫描候选并补齐末尾缺失的字符串闭合引号与右花括号。 */
function closeUnbalancedObject(text: string): string {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
  }
  let closed = inString ? `${text}"` : text;
  if (depth > 0) closed += '}'.repeat(depth);
  return closed;
}

/** 用于闭合失败时修复候选：优先修复尾段非法 \"，再补全闭合引号与花括号后解析。 */
function recoverUnclosedObject(candidate: string): { value: unknown } | undefined {
  const fixed = fixTrailingEscapedQuote(candidate);
  for (const variant of fixed === null ? [candidate] : [fixed, candidate]) {
    const repaired = repairJsonText(variant);
    const end = findObjectEnd(repaired, 0);
    const completed = end >= 0 ? repaired.slice(0, end + 1) : closeUnbalancedObject(repaired);
    const parsed = tryParseJson(completed);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

/** 用于从 LLM 文本提取首个完整 JSON 对象，闭合或解析失败时修复重试，仍失败返回 null。 */
export function extractJsonObject(text: string): unknown {
  const cleaned = stripFences(text);
  for (let index = cleaned.indexOf('{'); index >= 0; index = cleaned.indexOf('{', index + 1)) {
    const end = findObjectEnd(cleaned, index);
    if (end < 0) return recoverUnclosedObject(cleaned.slice(index))?.value ?? null;
    const candidate = cleaned.slice(index, end + 1);
    const parsed = tryParseJson(candidate) ?? tryParseJson(repairJsonText(candidate));
    if (parsed !== undefined) return parsed.value;
  }
  return null;
}
