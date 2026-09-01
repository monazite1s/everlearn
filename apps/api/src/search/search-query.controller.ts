/** @fileoverview 提供经过严格 DTO 校验的公开只读全局搜索端点。 */

import type { SearchResponse } from '@everlearn/contracts' with { 'resolution-mode': 'import' };
import { Controller, Get, Query } from '@nestjs/common';

import { SearchQueryDto } from './search-query.dto';

import { SearchQueryService } from './search-query.service';

/** 用于把公开查询参数映射到限定当前所有者的搜索服务。 */
@Controller('search')
export class SearchQueryController {
  /** 用于注入唯一负责公开 Search 读取语义的应用服务。 */
  constructor(private readonly searchQueryService: SearchQueryService) {}

  /** 用于读取一页文档去重且携带范围索引状态的结果。 */
  @Get()
  search(@Query() query: SearchQueryDto): Promise<SearchResponse> {
    return this.searchQueryService.search(query);
  }
}
