/**
 * @fileoverview 提供限定所有者的资讯订阅与简报运行端点。
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { CreateNewsSubscriptionDto } from './create-news-subscription.dto';
import { ListNewsDigestRunsDto } from './list-news-digest-runs.dto';
import type { NewsDigestRunSummary, NewsSubscriptionSummary } from './news.dto';
import { NewsRunsService } from './news-runs.service';
import { NewsService } from './news.service';
import { UpdateNewsSubscriptionDto } from './update-news-subscription.dto';

/** 用于将已校验 HTTP 输入映射到资讯应用服务。 */
@Controller('news')
export class NewsController {
  /** 用于注入订阅与运行两个应用服务。 */
  constructor(
    private readonly newsService: NewsService,
    private readonly runsService: NewsRunsService,
  ) {}

  /** 用于创建订阅并自动确保资讯知识库存在。 */
  @Post('subscriptions')
  create(@Body() input: CreateNewsSubscriptionDto): Promise<NewsSubscriptionSummary> {
    return this.newsService.create(input);
  }

  /** 用于列出所有者的订阅与最近运行状态。 */
  @Get('subscriptions')
  list(): Promise<NewsSubscriptionSummary[]> {
    return this.newsService.list();
  }

  /** 用于立即为订阅创建一次待执行简报运行。 */
  @Post('subscriptions/:id/run')
  @HttpCode(HttpStatus.OK)
  createRun(@Param() params: UuidParamDto): Promise<NewsDigestRunSummary> {
    return this.newsService.createRun(params.id);
  }

  /** 用于更新订阅字段与计划。 */
  @Patch('subscriptions/:id')
  update(
    @Param() params: UuidParamDto,
    @Body() input: UpdateNewsSubscriptionDto,
  ): Promise<NewsSubscriptionSummary> {
    return this.newsService.update(params.id, input);
  }

  /** 用于删除订阅及其运行历史。 */
  @Delete('subscriptions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: UuidParamDto): Promise<void> {
    await this.newsService.remove(params.id);
  }

  /** 用于按订阅过滤或全局列出最近简报运行。 */
  @Get('digest-runs')
  listRuns(@Query() query: ListNewsDigestRunsDto): Promise<NewsDigestRunSummary[]> {
    return this.newsService.listRuns(query.subscriptionId);
  }

  /** 用于读取单个简报运行的来源决策与警告详情。 */
  @Get('digest-runs/:runId')
  getRun(@Param() params: UuidParamDto): Promise<NewsDigestRunSummary> {
    return this.newsService.getRun(params.id);
  }
}
