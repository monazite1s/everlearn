/**
 * @fileoverview 验证对话 Agent 回复解析与提示词构造纯函数。
 */

import { describe, expect, test } from 'vitest';

import { buildComposeMessages, parseAgentReply } from './compose-agent';

const state = {
  chapters: [{ nodeKey: 'intro', status: 'succeeded', title: '入门' }],
  outlineChapters: [{ nodeKey: 'intro', summary: '基础', title: '入门' }],
  scope: '主题「Kysely」',
  status: 'outline_ready',
};

describe('parseAgentReply', () => {
  test('解析携带提案的标准 JSON 回复', () => {
    const reply = parseAgentReply(
      '{"reply":"建议更新大纲","proposal":{"kind":"outline","payload":{"chapters":[{"nodeKey":"a","title":"A"}]}}}',
    );
    expect(reply.reply).toBe('建议更新大纲');
    expect(reply.proposal?.kind).toBe('outline');
    expect(reply.proposal?.payload).toEqual({ chapters: [{ nodeKey: 'a', title: 'A' }] });
  });

  test('容忍代码栅栏与前后缀文本', () => {
    const reply = parseAgentReply('说明\n```json\n{"reply":"好","proposal":null}\n```\n尾注');
    expect(reply).toEqual({ proposal: null, reply: '好' });
  });

  test('非 JSON 输出整段降级为纯文本回复', () => {
    expect(parseAgentReply('这是普通回复，不含 JSON。')).toEqual({
      proposal: null,
      reply: '这是普通回复，不含 JSON。',
    });
  });

  test('未知提案类型或数组载荷被丢弃', () => {
    const reply = parseAgentReply('{"reply":"r","proposal":{"kind":"delete","payload":{"x":1}}}');
    expect(reply.proposal).toBeNull();
    const arrayPayload = parseAgentReply('{"reply":"r","proposal":{"kind":"scope","payload":[1]}}');
    expect(arrayPayload.proposal).toBeNull();
  });

  test('缺失 reply 时不丢弃合法提案，scope 场景正文兜底为要点摘要', () => {
    const reply = parseAgentReply(
      '{"proposal":{"kind":"scope","payload":{"topic":"T","audience":"A","level":null}}}',
    );
    expect(reply.reply).toContain('主题「T」');
    expect(reply.reply).toContain('受众「A」');
    expect(reply.proposal?.kind).toBe('scope');
    expect(reply.proposal?.payload).toEqual({ topic: 'T', audience: 'A', level: null });
  });

  test('scope 提案缺失 reply 时正文兜底为一行式范围要点', () => {
    const reply = parseAgentReply(
      '{"proposal":{"kind":"scope","payload":{"topic":"Kysely","audience":"后端工程师","level":60,"depth":"standard","goals":"会写迁移","includeTopics":["迁移"],"excludeTopics":[],"knowledgeBaseIds":["a","b"]}}}',
    );
    expect(reply.reply).toContain('受众');
    expect(reply.reply).toContain('后端工程师');
    expect(reply.reply).toContain('深度');
    expect(reply.reply).toContain('来源范围 2 个知识库');
  });
});

describe('buildComposeMessages', () => {
  test('系统提示词携带状态与输出契约，历史被截断到上限', () => {
    const history = Array.from({ length: 30 }, (_, index) => ({
      content: `m${index}`,
      role: 'user' as const,
    }));
    const messages = buildComposeMessages(state, history, '请调整大纲');
    expect(messages).toHaveLength(1 + 20 + 1);
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toContain('outline_ready');
    expect(messages[0]!.content).toContain('[intro] 入门');
    expect(messages[0]!.content).toContain('一行式范围要点');
    expect(messages.at(-1)).toEqual({ content: '请调整大纲', role: 'user' });
  });
});
