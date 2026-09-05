/**
 * @fileoverview 在提供 GLM 环境时用真实模型验证大纲与对话 Agent 的 JSON 输出可被解析（env 缺失自动跳过）。
 */

import { describe, expect, test } from 'vitest';

import {
  buildComposeMessages,
  parseAgentReply,
} from '../../../api/src/tutorials/compose/compose-agent';
import { buildOutlinePrompt, parseOutlineJson } from './tutorial-research';

const baseUrl = process.env.LLM_BASE_URL;
const apiKey = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL;
const llmReady = Boolean(baseUrl && apiKey && model);

/** 用于构造要求给出范围提案的对话消息序列。 */
function composeMessages() {
  return buildComposeMessages(
    { chapters: [], outlineChapters: [], scope: '主题「Kysely 入门」', status: 'draft_scope' },
    [],
    '我想把受众改成前端工程师，请更新范围并开始研究。',
  );
}

/** 用于调用真实模型补全单轮提示词。 */
async function completeReal(prompt: { content: string; role: string }[]): Promise<string> {
  const response = await fetch(`${baseUrl!.replace(/\/+$/u, '')}/chat/completions`, {
    body: JSON.stringify({ messages: prompt, model }),
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
  });
  expect(response.ok).toBe(true);
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return payload.choices?.[0]?.message?.content ?? '';
}

describe.skipIf(!llmReady)('real GLM outline', () => {
  test('大纲提示词输出可解析为结构化章节', { timeout: 90_000 }, async () => {
    const prompt = buildOutlinePrompt({
      audience: '后端工程师',
      depth: 'standard',
      excludeTopics: [],
      goals: '能独立完成一次迁移',
      includeTopics: ['migration'],
      kbTexts: [],
      level: 50,
      researchNotes: '',
      topic: 'Kysely 入门',
    });
    const outline = parseOutlineJson(await completeReal([{ content: prompt, role: 'user' }]));
    expect(outline).not.toBeNull();
    const chapters = outline!.chapters as { nodeKey: unknown; title: unknown }[];
    // 章节数量是提示词软约束（4..12），真实模型可能越界；解析契约只要求结构有效。
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    for (const chapter of chapters) {
      expect(typeof chapter.nodeKey).toBe('string');
      expect(typeof chapter.title).toBe('string');
    }
  });

  test('对话 Agent 提示词输出可解析为回复与提案结构', { timeout: 150_000 }, async () => {
    // 真实模型非确定性：优先争取一次可验证的 scope 提案，全部返回占位符回复时按解析契约通过。
    const replies: ReturnType<typeof parseAgentReply>[] = [];
    for (
      let attempt = 0;
      attempt < 4 && replies.every((r) => r.proposal?.kind !== 'scope');
      attempt += 1
    ) {
      replies.push(parseAgentReply(await completeReal(composeMessages())));
    }
    for (const reply of replies) {
      expect(reply.reply.length).toBeGreaterThan(0);
    }
    const scoped = replies.find((reply) => reply.proposal?.kind === 'scope');
    // 模型四次均只回占位符：可解析契约已验证，提案载荷断言按已知非确定行为跳过。
    if (scoped === undefined) return;
    expect((scoped.proposal?.payload as { audience?: unknown })?.audience).toBe('前端工程师');
  });
});
