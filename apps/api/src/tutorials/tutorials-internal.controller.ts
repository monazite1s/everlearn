/**
 * @fileoverview 提供受内部密钥保护的 Worker 教程执行端点。
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { secretsMatch } from '../http-boundary/timing-safe-secret';
import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { CompleteTutorialChapterDto } from './complete-tutorial-chapter.dto';
import { CompleteTutorialOutlineDto } from './complete-tutorial-outline.dto';
import { TutorialDispatchDto } from './tutorial-dispatch.dto';
import type { ChapterDispatchItem, OutlineDispatchItem } from './tutorial-runs.service';
import { TutorialRunsService } from './tutorial-runs.service';

// 沿用现有 Worker 内部密钥边界，避免在本切片扩大运行时配置迁移。
const INTERNAL_SECRET_HEADER = 'x-purge-secret';

/** 用于让 Worker 经 API 边界领取与完结教程研究及章节生成。 */
@Controller('internal/tutorials')
export class TutorialsInternalController {
  /** 用于注入内部密钥配置与运行服务。 */
  constructor(
    private readonly config: ConfigService<Record<string, string>, false>,
    private readonly runsService: TutorialRunsService,
  ) {}

  /** 用于校验内部密钥且拒绝未配置密钥的部署。 */
  private requireSecret(request: Request): void {
    const expected = this.config.get<string>('PURGE_TRIGGER_SECRET');
    const provided = request.headers[INTERNAL_SECRET_HEADER];
    if (
      expected === undefined ||
      expected.length === 0 ||
      typeof provided !== 'string' ||
      !secretsMatch(expected, provided)
    ) {
      throw new UnauthorizedException();
    }
  }

  /** 用于原子领取一批待研究教程会话。 */
  @Post('outline/dispatch')
  @HttpCode(HttpStatus.OK)
  dispatchOutline(
    @Req() request: Request,
    @Body() input: TutorialDispatchDto,
  ): Promise<readonly OutlineDispatchItem[]> {
    this.requireSecret(request);
    return this.runsService.claimOutlineSessions(input.limit ?? 3);
  }

  /** 用于把大纲运行推进到终态。 */
  @Post('outline/:id/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async completeOutline(
    @Req() request: Request,
    @Param() params: UuidParamDto,
    @Body() input: CompleteTutorialOutlineDto,
  ): Promise<void> {
    this.requireSecret(request);
    await this.runsService.completeOutlineRun(params.id, input);
  }

  /** 用于原子领取依赖已满足的待生成章节。 */
  @Post('chapters/dispatch')
  @HttpCode(HttpStatus.OK)
  dispatchChapters(
    @Req() request: Request,
    @Body() input: TutorialDispatchDto,
  ): Promise<readonly ChapterDispatchItem[]> {
    this.requireSecret(request);
    return this.runsService.claimReadyChapters(input.limit ?? 3);
  }

  /** 用于把章节运行推进到终态并写入正文修订。 */
  @Post('chapters/:chapterId/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async completeChapter(
    @Req() request: Request,
    @Param() params: UuidParamDto & { chapterId: string },
    @Body() input: CompleteTutorialChapterDto,
  ): Promise<void> {
    this.requireSecret(request);
    await this.runsService.completeChapter(params.chapterId, input);
  }
}
