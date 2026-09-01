/**
 * @fileoverview 验证引用校验过滤非法候选与伪 Provider 的确定性输出。
 */

import { describe, expect, it } from 'vitest';

import { FakeLlmProvider } from './fake-llm-provider';
import { sanitizeCitations } from './ai-qa.service';

describe('sanitizeCitations', () => {
  const candidates = new Map([['doc-1\u0000block-1', 'doc-1']]);

  it('保留候选集内引用并过滤候选集外引用', () => {
    const result = sanitizeCitations(
      {
        answer: '答案',
        citations: [
          { blockId: 'block-1', documentId: 'doc-1' },
          { blockId: 'block-x', documentId: 'doc-x' },
        ],
      },
      candidates,
    );
    expect(result.answer).toBe('答案');
    expect(result.citations).toEqual([{ blockId: 'block-1', documentId: 'doc-1' }]);
  });

  it('容忍缺失字段与非数组 citations', () => {
    expect(sanitizeCitations({ answer: 42 }, candidates)).toEqual({ answer: '', citations: [] });
    expect(sanitizeCitations({ citations: 'oops' }, candidates).citations).toEqual([]);
  });
});

describe('FakeLlmProvider', () => {
  it('complete 输出仅由最后一条用户消息决定的确定性文本', async () => {
    const provider = new FakeLlmProvider('T');
    const first = await provider.complete([
      { content: 'system', role: 'system' },
      { content: 'abcd', role: 'user' },
    ]);
    expect(first).toBe('T:4');
    expect(await provider.complete([{ content: 'abcd', role: 'user' }])).toBe(first);
  });

  it('stream 分段产出并拼接为与 complete 一致的全文', async () => {
    const provider = new FakeLlmProvider();
    let joined = '';
    for await (const delta of provider.stream([{ content: 'hello', role: 'user' }]))
      joined += delta;
    expect(joined).toBe(await provider.complete([{ content: 'hello', role: 'user' }]));
  });
});
