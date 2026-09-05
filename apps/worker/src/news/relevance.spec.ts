/**
 * @fileoverview 验证三合一判定输出的健壮解析与失败降级语义。
 */

import { describe, expect, it } from 'vitest';

import { judgeNewsDigest, parseJudgeResult } from './relevance';

describe('parseJudgeResult', () => {
  it('解析标准 items 数组并保留评级与摘要', () => {
    const text =
      '{"items":[{"index":0,"keep":true,"importance":"high","summary":"摘要一"},{"index":1,"keep":false,"importance":"low","summary":"摘要二"}]}';
    const parsed = parseJudgeResult(text, 2)!;
    expect([...parsed.keep]).toEqual([0]);
    expect(parsed.importance.get(0)).toBe('high');
    expect(parsed.summaries.get(1)).toBe('摘要二');
  });

  it('容忍代码围栏与越界或非法条目', () => {
    const text =
      '```json\n{"items":[{"index":7,"keep":true},{"index":1,"keep":true,"importance":"high","summary":"有效"}]}\n```';
    const parsed = parseJudgeResult(text, 2)!;
    expect([...parsed.keep]).toEqual([1]);
    expect(parsed.importance.size).toBe(1);
  });

  it('空 items 或无法提取 JSON 时返回 null', () => {
    expect(parseJudgeResult('{"items":[]}', 2)).toBeNull();
    expect(parseJudgeResult('完全不是 JSON', 2)).toBeNull();
  });
});

describe('judgeNewsDigest 降级', () => {
  it('LLM 调用失败时保留全部候选并返回警告', async () => {
    const result = await judgeNewsDigest({
      apiInternalUrl: 'http://127.0.0.1:9',
      entries: [{ item: { summary: 's1', title: 't1' } }, { item: { summary: 's2', title: 't2' } }],
      recentItemTitles: [],
      runId: 'run',
      secret: 'secret',
      topic: '主题',
    });
    expect([...result.keepIndexes]).toEqual([0, 1]);
    expect(result.importanceByIndex.size).toBe(0);
    expect(result.summaryByIndex.size).toBe(0);
    expect(result.warning).toContain('相关性判定失败');
  });
});
