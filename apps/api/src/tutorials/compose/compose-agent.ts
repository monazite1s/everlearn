/**
 * @fileoverview 定义对话 Agent 的提示词构造与回复解析纯函数。
 */

import { extractJsonObject } from '../../ai/json-extraction';
import type { LlmMessage } from '../../ai/llm-provider';

/** Agent 可提议的动作类型。 */
export type ComposeProposalKind = 'chapter' | 'outline' | 'scope';

/** Agent 回复中携带的结构化提案。 */
export interface ComposeProposal {
  readonly kind: ComposeProposalKind;
  readonly payload: Record<string, unknown>;
}

/** 解析后的 Agent 回复：自然语言答复与可选提案。 */
export interface ComposeAgentReply {
  readonly proposal: ComposeProposal | null;
  readonly reply: string;
}

/** 传入提示词的对话历史条目。 */
export interface ComposeHistoryItem {
  readonly content: string;
  readonly kind?: ComposeProposalKind;
  readonly role: 'agent' | 'user';
}

/** 传入提示词的教程状态摘要。 */
export interface ComposeTutorialState {
  readonly chapters: readonly {
    readonly nodeKey: string;
    readonly status: string;
    readonly title: string;
  }[];
  readonly outlineChapters: readonly {
    readonly nodeKey: string;
    readonly summary: string;
    readonly title: string;
  }[];
  readonly scope: string;
  readonly status: string;
}

/** 历史消息携带上限，防止提示词无限增长。 */
const HISTORY_LIMIT = 20;

/** 用于把提案类型规范为受支持的枚举值。 */
function toProposalKind(value: unknown): ComposeProposalKind | null {
  return value === 'scope' || value === 'outline' || value === 'chapter' ? value : null;
}

/** 用于把 LLM 输出解析为回复与提案，解析失败时整段降级为纯文本回复。 */
export function parseAgentReply(text: string): ComposeAgentReply {
  const parsed = extractJsonObject(text);
  if (typeof parsed !== 'object' || parsed === null) {
    return { proposal: null, reply: text.trim().slice(0, 20000) };
  }
  const record = parsed as { proposal?: unknown; reply?: unknown };
  const proposal = readProposal(record.proposal);
  if (proposal === null && typeof record.reply !== 'string') {
    return { proposal: null, reply: text.trim().slice(0, 20000) };
  }
  return {
    proposal,
    reply: typeof record.reply === 'string' ? record.reply.slice(0, 20000) : '',
  };
}

/** 用于从提案字段读取合法提案，缺省或形态非法时返回 null。 */
function readProposal(value: unknown): ComposeProposal | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { kind?: unknown; payload?: unknown };
  const kind = toProposalKind(candidate.kind);
  if (
    kind === null ||
    typeof candidate.payload !== 'object' ||
    candidate.payload === null ||
    Array.isArray(candidate.payload)
  ) {
    return null;
  }
  return { kind, payload: candidate.payload as Record<string, unknown> };
}

/** 用于构造携带教程状态、对话历史与输出契约的 Agent 消息序列。 */
export function buildComposeMessages(
  state: ComposeTutorialState,
  history: readonly ComposeHistoryItem[],
  userMessage: string,
): LlmMessage[] {
  const outlineText =
    state.outlineChapters.length === 0
      ? '暂无大纲'
      : state.outlineChapters
          .map(
            (chapter, index) =>
              `${index + 1}. [${chapter.nodeKey}] ${chapter.title}：${chapter.summary}`,
          )
          .join('\n');
  const chaptersText =
    state.chapters.length === 0
      ? '无（尚未建库）'
      : state.chapters
          .map((chapter) => `- [${chapter.nodeKey}] ${chapter.title}（${chapter.status}）`)
          .join('\n');
  const system = [
    '你是 Everlearn 教程创作助手，与用户通过对话共同创作教程。',
    `当前教程状态：${state.status}。范围：${state.scope}`,
    `当前大纲：\n${outlineText}`,
    `章节与生成状态：\n${chaptersText}`,
    '你可以在需要用户确认的动作时给出提案，提案只在用户明确接受后才执行：',
    '- kind=scope：调整研究范围，payload 为完整范围字段 {topic,audience,level,goals,depth,includeTopics,excludeTopics,knowledgeBaseIds}，仅限 draft_scope 态；接受后将确认范围并开始研究。',
    '- kind=outline：调整大纲，payload 为 {chapters:[{nodeKey,title,summary,dependsOn}]}，仅限 awaiting_outline 态；接受后将确认大纲并创建教程知识库开始生成。',
    '- kind=chapter：重写某章正文，payload 为 {nodeKey,markdown}（中文 Markdown，事实句以 [n] 标注引用），仅限章节已存在的状态；接受后将写入该章文档新修订。',
    '重要：你没有直接执行任何动作的能力。当用户请求涉及上述动作（如调整范围、修改大纲、重写章节）时，必须给出对应提案并把完整的 payload 填完整；禁止在 reply 中声称已经执行，执行只发生在用户接受提案之后。',
    'scope 提案的 payload 必须包含全部字段：未知的字符串字段填空字符串、未知列表填空数组、level 填 1..100 的整数估计。',
    '严格只输出一个 JSON 对象，不要输出解释文字或代码栅栏，格式：',
    '{"reply":"给用户的自然语言回复","proposal":null} 或 {"reply":"...","proposal":{"kind":"scope|outline|chapter","payload":{...}}}',
    '无需动作时 proposal 必须为 null。',
  ].join('\n');
  const historyMessages = history.slice(-HISTORY_LIMIT).map<LlmMessage>((item) => ({
    content:
      item.kind === undefined
        ? item.content
        : `${item.content}（提案 ${item.kind}，执行结果以最新教程状态为准）`,
    role: item.role === 'agent' ? 'assistant' : 'user',
  }));
  return [
    { content: system, role: 'system' },
    ...historyMessages,
    { content: userMessage, role: 'user' },
  ];
}
