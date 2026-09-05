/** @fileoverview 定义教程路由复用的多字段 UUID 参数校验边界。 */
/* eslint-disable max-classes-per-file -- 参数校验边界按路由形态同文件声明组合 DTO。 */

import { IsUUID } from 'class-validator';

/** 用于校验教程 id 与消息 id 组合的提案路由参数。 */
export class TutorialMessageParamDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  messageId!: string;
}

/** 用于校验教程 id 与章节 id 组合的差异接受路由参数。 */
export class TutorialChapterParamDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  chapterId!: string;
}

/** 用于校验独立章节 id 的单字段路由参数。 */
export class ChapterIdParamDto {
  @IsUUID()
  chapterId!: string;
}
