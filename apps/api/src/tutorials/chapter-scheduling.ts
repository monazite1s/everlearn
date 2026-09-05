/**
 * @fileoverview 实现章节依赖释放的纯函数调度：依赖全部成功才可领取。
 */

/** 待执行章节的最小调度视图。 */
export interface SchedulableChapter {
  readonly chapterId: string;
  readonly dependsOn: readonly string[];
  readonly nodeKey: string;
  readonly sessionId: string;
}

/** 用于筛选依赖全部完成的待执行章节（完成即释放语义）。 */
export function selectReadyChapters(
  pending: readonly SchedulableChapter[],
  statuses: ReadonlyMap<string, string>,
): readonly SchedulableChapter[] {
  return pending.filter((chapter) =>
    chapter.dependsOn.every((key) => statuses.get(`${chapter.sessionId}:${key}`) === 'completed'),
  );
}
