/**
 * @fileoverview 提供限定所有者的教程草案、两次确认与章节运维端点。
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';

import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { TutorialOutlineDto } from './tutorial-outline.dto';
import type { TutorialDetail, TutorialSummary } from './tutorial.dto';
import { TutorialScopeDto } from './tutorial-scope.dto';
import { TutorialService } from './tutorial.service';

/** 用于把已校验 HTTP 输入映射到教程应用服务。 */
@Controller('tutorials')
export class TutorialsController {
  /** 用于注入教程应用服务。 */
  constructor(private readonly tutorialService: TutorialService) {}

  /** 用于创建教程草案。 */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() input: TutorialScopeDto): Promise<{ id: string; status: 'draft' }> {
    return this.tutorialService.create(input);
  }

  /** 用于列出所有者的教程会话。 */
  @Get()
  list(): Promise<TutorialSummary[]> {
    return this.tutorialService.list();
  }

  /** 用于返回教程详情。 */
  @Get(':id')
  detail(@Param() params: UuidParamDto): Promise<TutorialDetail> {
    return this.tutorialService.detail(params.id);
  }

  /** 用于在 draft 态整体替换研究范围。 */
  @Put(':id/scope')
  updateScope(
    @Param() params: UuidParamDto,
    @Body() input: TutorialScopeDto,
  ): Promise<TutorialDetail> {
    return this.tutorialService.updateScope(params.id, input);
  }

  /** 用于确认研究范围并入队研究。 */
  @Post(':id/confirm-scope')
  @HttpCode(HttpStatus.OK)
  confirmScope(@Param() params: UuidParamDto): Promise<TutorialDetail> {
    return this.tutorialService.confirmScope(params.id);
  }

  /** 用于在 outline_ready 态编辑大纲。 */
  @Put(':id/outline')
  updateOutline(
    @Param() params: UuidParamDto,
    @Body() input: TutorialOutlineDto,
  ): Promise<TutorialDetail> {
    return this.tutorialService.updateOutline(params.id, input);
  }

  /** 用于确认大纲并原子创建教程知识库与占位文档。 */
  @Post(':id/confirm-outline')
  @HttpCode(HttpStatus.OK)
  confirmOutline(@Param() params: UuidParamDto): Promise<TutorialDetail> {
    return this.tutorialService.confirmOutline(params.id);
  }

  /** 用于重试失败或取消的章节。 */
  @Post(':id/chapters/:chapterId/retry')
  @HttpCode(HttpStatus.OK)
  retryChapter(@Param() params: UuidParamDto & { chapterId: string }): Promise<TutorialDetail> {
    return this.tutorialService.retryChapter(params.id, params.chapterId);
  }

  /** 用于取消尚未开始的章节。 */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param() params: UuidParamDto): Promise<TutorialDetail> {
    return this.tutorialService.cancel(params.id);
  }
}
