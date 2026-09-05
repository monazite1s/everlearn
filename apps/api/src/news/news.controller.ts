/**
 * @fileoverview 提供限定所有者的资讯订阅、条目流、简报列表与运行详情端点。
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

import type { NewsItemDetail, NewsItemListResponse } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { CreateNewsSubscriptionDto } from './create-news-subscription.dto';
import { ListNewsDigestRunsDto } from './list-news-digest-runs.dto';
import { ListNewsItemsQueryDto } from './list-news-items-query.dto';
import type {
  NewsDigestListResponse,
  NewsDigestRunSummary,
  NewsSubscriptionSummary,
} from './news.dto';
import { NewsItemsService } from './news-items.service';
import { NewsRunsService } from './news-runs.service';
import { NewsService } from './news.service';
import { UpdateNewsSubscriptionDto } from './update-news-subscription.dto';

/** 用于将已校验 HTTP 输入映射到资讯应用服务，路径形态以 api-and-events.md 为准。 */
@Controller()
export class NewsController {
  /** 用于注入订阅、运行与条目三个应用服务。 */
  constructor(
    private readonly newsService: NewsService,
    private readonly runsService: NewsRunsService,
    private readonly itemsService: NewsItemsService,
  ) {}

  /** 用于创建订阅并自动确保资讯知识库存在。 */
  @Post('news-subscriptions')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() input: CreateNewsSubscriptionDto): Promise<NewsSubscriptionSummary> {
    return this.newsService.create(input);
  }

  /** 用于列出所有者的订阅及来源配置。 */
  @Get('news-subscriptions')
  list(): Promise<NewsSubscriptionSummary[]> {
    return this.newsService.list();
  }

  /** 用于整体更新订阅字段、来源与计划（乐观并发）。 */
  @Patch('news-subscriptions/:id')
  update(
    @Param() params: UuidParamDto,
    @Body() input: UpdateNewsSubscriptionDto,
  ): Promise<NewsSubscriptionSummary> {
    return this.newsService.update(params.id, input);
  }

  /** 用于删除订阅及其运行历史。 */
  @Delete('news-subscriptions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: UuidParamDto): Promise<void> {
    await this.newsService.remove(params.id);
  }

  /** 用于立即为订阅创建一次待执行采集运行（异步受理）。 */
  @Post('news-subscriptions/:id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  createRun(@Param() params: UuidParamDto): Promise<NewsDigestRunSummary> {
    return this.newsService.createRun(params.id);
  }

  /** 用于按过滤条件返回条目流分页。 */
  @Get('news-items')
  listItems(@Query() query: ListNewsItemsQueryDto): Promise<NewsItemListResponse> {
    return this.itemsService.list(query);
  }

  /** 用于读取单个资讯条目的处理详情。 */
  @Get('news-items/:id')
  getItem(@Param() params: UuidParamDto): Promise<NewsItemDetail> {
    return this.itemsService.get(params.id);
  }

  /** 用于按日倒序分页返回简报列表。 */
  @Get('news-digests')
  listDigests(@Query('cursor') cursor?: string): Promise<NewsDigestListResponse> {
    return this.newsService.listDigests(cursor);
  }

  /** 用于按订阅过滤或全局列出最近简报运行。 */
  @Get('digest-runs')
  listRuns(@Query() query: ListNewsDigestRunsDto): Promise<NewsDigestRunSummary[]> {
    return this.newsService.listRuns(query.subscriptionId);
  }

  /** 用于读取单个简报运行的来源决策与警告详情。 */
  @Get('digest-runs/:id')
  getRun(@Param() params: UuidParamDto): Promise<NewsDigestRunSummary> {
    return this.newsService.getRun(params.id);
  }
}
