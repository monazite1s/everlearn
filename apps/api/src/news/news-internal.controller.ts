/**
 * @fileoverview 提供受内部密钥保护的 Worker 简报运行端点。
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { WebSearchResult } from '../providers/web-search';
import { secretsMatch } from '../http-boundary/timing-safe-secret';
import { CompleteNewsDigestDto } from './complete-news-digest.dto';
import { DispatchNewsDigestDto } from './dispatch-news-digest.dto';
import type { RegisteredNewsRunItem } from './register-news-run-items.dto';
import { RegisterNewsRunItemsDto } from './register-news-run-items.dto';
import type { NewsDigestDispatchItem, NewsScheduleItem } from './news.dto';
import { NewsRunsService } from './news-runs.service';
import { ScheduledNewsDigestDto } from './scheduled-news-digest.dto';
import { NewsWebSearchActionDto } from './news-web-search.dto';
import { NewsWebSearchService } from './news-web-search.service';

// 沿用现有 Worker 内部密钥边界，避免在本切片扩大运行时配置迁移。
const INTERNAL_SECRET_HEADER = 'x-purge-secret';

/** 用于让 Worker 经 API 所有权边界领取与完结简报运行。 */
@Controller('internal/news')
export class NewsInternalController {
  /** 用于注入内部密钥配置、运行服务与搜索动作服务。 */
  constructor(
    private readonly config: ConfigService<Record<string, string>, false>,
    private readonly runsService: NewsRunsService,
    private readonly webSearchService: NewsWebSearchService,
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

  /** 用于原子领取一批待执行简报运行。 */
  @Post('dispatch')
  @HttpCode(HttpStatus.OK)
  dispatch(
    @Req() request: Request,
    @Body() input: DispatchNewsDigestDto,
  ): Promise<readonly NewsDigestDispatchItem[]> {
    this.requireSecret(request);
    return this.runsService.claimPendingDigestRuns(input.limit ?? 3);
  }

  /** 用于登记运行发现的新资讯条目并返回指纹到条目 id 的映射。 */
  @Post('runs/:runId/items')
  @HttpCode(HttpStatus.OK)
  registerItems(
    @Req() request: Request,
    @Param('runId') runId: string,
    @Body() input: RegisterNewsRunItemsDto,
  ): Promise<readonly RegisteredNewsRunItem[]> {
    this.requireSecret(request);
    return this.runsService.registerRunItems(runId, input.items);
  }

  /** 用于为搜索来源执行一次 Web 搜索并返回公开结果形态。 */
  @Post('actions/web-search')
  @HttpCode(HttpStatus.OK)
  webSearch(
    @Req() request: Request,
    @Body() input: NewsWebSearchActionDto,
  ): Promise<readonly WebSearchResult[]> {
    this.requireSecret(request);
    return this.webSearchService.search({
      ...(input.maxResults === undefined ? {} : { maxResults: input.maxResults }),
      query: input.query,
    });
  }

  /** 用于把简报运行推进到终态。 */
  @Post('runs/:runId/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async completeRun(
    @Req() request: Request,
    @Param('runId') runId: string,
    @Body() input: CompleteNewsDigestDto,
  ): Promise<void> {
    this.requireSecret(request);
    await this.runsService.completeDigestRun(runId, input);
  }

  /** 用于列出启用计划的订阅。 */
  @Get('schedules')
  @HttpCode(HttpStatus.OK)
  listSchedules(@Req() request: Request): Promise<readonly NewsScheduleItem[]> {
    this.requireSecret(request);
    return this.runsService.listSchedules();
  }

  /** 用于为计划触发创建或复用当天简报运行。 */
  @Post('scheduled-runs')
  @HttpCode(HttpStatus.OK)
  createScheduledDigest(@Req() request: Request, @Body() input: ScheduledNewsDigestDto) {
    this.requireSecret(request);
    return this.runsService.createScheduledDigest(input.subscriptionId);
  }
}
