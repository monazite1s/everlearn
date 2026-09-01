/** @fileoverview 从已校验正文 JSON 中深度优先收集 docLink 内部链接及其所在块。 */

// 与共享契约 blockId 同为标准 UUID，运行时以本文件常量校验避免 ESM 互操作。
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 单条待落库的文档内部链接投影。 */
export interface ParsedDocumentLink {
  readonly blockId: string | null;
  readonly targetDocumentId: string;
}

/** 用于区分普通对象与数组、null 等伪对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 用于读取 docLink 标记中合法的目标文档 ID，非法或缺失时返回 undefined。 */
function docLinkTarget(mark: unknown): string | undefined {
  if (!isPlainObject(mark) || mark.type !== 'docLink' || !isPlainObject(mark.attrs)) {
    return undefined;
  }
  const target = mark.attrs.documentId;
  return typeof target === 'string' && UUID_PATTERN.test(target) ? target : undefined;
}

/** 用于读取节点自身携带的合法块 ID，缺失时回退继承值。 */
function ownBlockId(node: Record<string, unknown>, fallback: string | null): string | null {
  const attrs = isPlainObject(node.attrs) ? node.attrs : undefined;
  const blockId = attrs?.blockId;
  return typeof blockId === 'string' && UUID_PATTERN.test(blockId) ? blockId : fallback;
}

/** 用于把节点标记中的新链接追加进去重集合。 */
function appendMarkLinks(
  node: Record<string, unknown>,
  blockId: string | null,
  links: ParsedDocumentLink[],
  seen: Set<string>,
): void {
  const marks = node.marks;
  if (!Array.isArray(marks)) return;
  for (const mark of marks) {
    const target = docLinkTarget(mark);
    const key = `${blockId ?? ''}|${target}`;
    if (target === undefined || seen.has(key)) continue;
    seen.add(key);
    links.push({ blockId, targetDocumentId: target });
  }
}

/** 用于宽容遍历正文 JSON 并按块与目标去重收集内部链接。 */
export function collectDocumentLinks(contentJson: unknown): ParsedDocumentLink[] {
  const links: ParsedDocumentLink[] = [];
  const seen = new Set<string>();
  /** 用于携带最近祖先块的块 ID 递归访问节点。 */
  function visit(node: unknown, blockId: string | null): void {
    if (!isPlainObject(node)) return;
    const nextBlockId = ownBlockId(node, blockId);
    appendMarkLinks(node, nextBlockId, links, seen);
    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child, nextBlockId);
    }
  }
  visit(contentJson, null);
  return links;
}
