/** @fileoverview 从可信数据库文本生成不含 HTML 的 Unicode 高亮段与正文摘要。 */

import type { SearchContentSnippet, SearchHighlightSegment } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

const MAX_TITLE_MATCHES = 16;
const MAX_SNIPPET_CHARACTERS = 240;
const SNIPPET_CONTEXT_BEFORE = 80;
const WORD_PATTERN = /[\p{L}\p{N}_]+/gu;

interface MatchRange {
  readonly end: number;
  readonly start: number;
}

/** 用于按 Unicode code point 限制公开路径标题长度。 */
export function sliceSearchText(text: string, maximum: number): string {
  return Array.from(text).slice(0, maximum).join('');
}

/** 用于把查询拆为与 simple FTS 接近的唯一小写词项。 */
function searchTerms(query: string): readonly string[] {
  const lexical = query.match(WORD_PATTERN) ?? [];
  const source = lexical.length === 0 ? [query] : lexical;
  return [...new Set(source.map((term) => term.toLowerCase()).filter(Boolean))];
}

/** 用于按最早位置和最长优先合并不重叠文本命中。 */
function findMatchRanges(text: string, query: string, maximum: number): readonly MatchRange[] {
  const lower = text.toLowerCase();
  const candidates: MatchRange[] = [];
  for (const term of searchTerms(query)) {
    let offset = 0;
    while (offset <= lower.length - term.length) {
      const start = lower.indexOf(term, offset);
      if (start < 0) break;
      candidates.push({ end: start + term.length, start });
      offset = start + Math.max(term.length, 1);
    }
  }
  candidates.sort((left, right) => left.start - right.start || right.end - left.end);
  const accepted: MatchRange[] = [];
  for (const candidate of candidates) {
    const previous = accepted.at(-1);
    if (previous !== undefined && candidate.start < previous.end) continue;
    accepted.push(candidate);
    if (accepted.length === maximum) break;
  }
  return accepted;
}

/** 用于把文本和命中范围转换为仅含文本与布尔值的连续分段。 */
function segmentRanges(
  text: string,
  ranges: readonly MatchRange[],
): readonly SearchHighlightSegment[] {
  if (ranges.length === 0) return [{ highlighted: false, text }];
  const segments: SearchHighlightSegment[] = [];
  let offset = 0;
  for (const range of ranges) {
    if (range.start > offset)
      segments.push({ highlighted: false, text: text.slice(offset, range.start) });
    segments.push({ highlighted: true, text: text.slice(range.start, range.end) });
    offset = range.end;
  }
  if (offset < text.length) segments.push({ highlighted: false, text: text.slice(offset) });
  return segments;
}

/** 用于返回完整标题并最多标记前十六处命中。 */
export function highlightSearchTitle(
  title: string,
  query: string,
  enabled: boolean,
): readonly SearchHighlightSegment[] {
  return enabled
    ? segmentRanges(title, findMatchRanges(title, query, MAX_TITLE_MATCHES))
    : [{ highlighted: false, text: title }];
}

/** 用于仅定位每个词项的首次命中，避免按全文命中数分配。 */
function findFirstMatch(text: string, query: string): MatchRange | undefined {
  const lower = text.toLowerCase();
  let first: MatchRange | undefined;
  for (const term of searchTerms(query)) {
    const start = lower.indexOf(term);
    if (start < 0) continue;
    const candidate = { end: start + term.length, start };
    if (
      first === undefined ||
      candidate.start < first.start ||
      (candidate.start === first.start && candidate.end > first.end)
    )
      first = candidate;
  }
  return first;
}

/** 用于在不物化全文字符数组的前提下向前移动 Unicode 字符。 */
function moveCodePointsBackward(text: string, offset: number, count: number): number {
  let cursor = offset;
  for (let moved = 0; moved < count && cursor > 0; moved += 1) {
    cursor -= 1;
    const code = text.charCodeAt(cursor);
    const previous = text.charCodeAt(cursor - 1);
    if (code >= 0xdc00 && code <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff) cursor -= 1;
  }
  return cursor;
}

/** 用于在不物化全文字符数组的前提下向后移动 Unicode 字符。 */
function moveCodePointsForward(text: string, offset: number, count: number): number {
  let cursor = offset;
  for (let moved = 0; moved < count && cursor < text.length; moved += 1) {
    const code = text.charCodeAt(cursor);
    const next = text.charCodeAt(cursor + 1);
    cursor += code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? 2 : 1;
  }
  return cursor;
}

/** 用于选择包含首个命中的 240 字符稳定摘要窗口。 */
function snippetWindow(
  text: string,
  firstMatch: MatchRange,
): {
  readonly end: number;
  readonly start: number;
} {
  let start = moveCodePointsBackward(text, firstMatch.start, SNIPPET_CONTEXT_BEFORE);
  const end = moveCodePointsForward(text, start, MAX_SNIPPET_CHARACTERS);
  if (end === text.length) start = moveCodePointsBackward(text, end, MAX_SNIPPET_CHARACTERS);
  return { end, start };
}

/** 用于返回最多 240 字符且至少包含首个数据库命中的正文摘要。 */
export function createSearchSnippet(text: string, query: string): SearchContentSnippet {
  const firstMatch = findFirstMatch(text, query) ?? { end: Math.min(text.length, 1), start: 0 };
  const window = snippetWindow(text, firstMatch);
  const excerpt = text.slice(window.start, window.end);
  return {
    leadingTruncated: window.start > 0,
    segments: segmentRanges(excerpt, findMatchRanges(excerpt, query, MAX_TITLE_MATCHES)),
    trailingTruncated: window.end < text.length,
  };
}
