/**
 * @fileoverview 验证章节依赖释放调度与大纲解析纯函数。
 */

import { describe, expect, test } from 'vitest';

import { selectReadyChapters } from '../../../api/src/tutorials/chapter-scheduling';
import { buildResearchQueries, parseOutlineJson } from './tutorial-research';

describe('chapter-scheduling', () => {
  test('仅无依赖章节可首次领取', () => {
    const pending = [
      { chapterId: '1', dependsOn: [], nodeKey: 'intro', sessionId: 's' },
      { chapterId: '2', dependsOn: ['intro'], nodeKey: 'body', sessionId: 's' },
    ];
    const ready = selectReadyChapters(pending, new Map([['s:body', 'pending']]));
    expect(ready.map((chapter) => chapter.chapterId)).toEqual(['1']);
  });

  test('依赖成功后对应章节被释放', () => {
    const pending = [{ chapterId: '2', dependsOn: ['intro'], nodeKey: 'body', sessionId: 's' }];
    expect(selectReadyChapters(pending, new Map([['s:intro', 'generating']]))).toHaveLength(0);
    expect(selectReadyChapters(pending, new Map([['s:intro', 'succeeded']]))).toHaveLength(1);
  });

  test('依赖失败或被取消的章节不会被释放', () => {
    const pending = [{ chapterId: '2', dependsOn: ['intro'], nodeKey: 'body', sessionId: 's' }];
    expect(selectReadyChapters(pending, new Map([['s:intro', 'failed']]))).toHaveLength(0);
    expect(selectReadyChapters(pending, new Map([['s:intro', 'canceled']]))).toHaveLength(0);
  });
});

describe('tutorial-research', () => {
  test('研究查询为主题加最多三个覆盖词', () => {
    expect(buildResearchQueries('t', ['a', 't', 'b', 'c', 'd'])).toEqual(['t', 'a', 'b', 'c']);
  });

  test('大纲解析容忍栅栏文本并拒绝非 JSON 结构', () => {
    const outline = '前置说明\n```json\n{"chapters":[{"nodeKey":"a"}]}\n```\n后缀';
    expect(parseOutlineJson(outline)).toEqual({ chapters: [{ nodeKey: 'a' }] });
    expect(parseOutlineJson('{"chapters": 1}')).toBeNull();
    expect(parseOutlineJson('没有 JSON')).toBeNull();
  });
});
