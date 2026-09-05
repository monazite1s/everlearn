/**
 * @fileoverview 提供教程章节的单章重试端点（路径形态以 api-and-events.md 为准）。
 */

import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { ChapterIdParamDto } from './tutorial-params.dto';
import { TutorialService } from './tutorial.service';

/** 用于把章节重试请求映射到教程应用服务。 */
@Controller('tutorial-chapters')
export class TutorialChaptersController {
  /** 用于注入教程应用服务。 */
  constructor(private readonly tutorialService: TutorialService) {}

  /** 用于重试失败或取消的章节。 */
  @Post(':chapterId/retry')
  @HttpCode(HttpStatus.OK)
  retryChapter(@Param() params: ChapterIdParamDto): Promise<{ chapterId: string }> {
    return this.tutorialService.retryChapter(params.chapterId);
  }
}
