/** @fileoverview 提供受既有内部密钥保护的搜索向量回填触发端点。 */

import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { secretsMatch } from '../http-boundary/timing-safe-secret';
import type { SearchEmbeddingStats } from './search-embedding.service';
import { SearchEmbeddingService } from './search-embedding.service';

// AI-04 沿用 SEARCH-01 的内部密钥边界，Worker 经 HTTP 触发单批回填。
const INTERNAL_SECRET_HEADER = 'x-purge-secret';

/** 用于让 Worker 经 API 模块所有权边界触发一次有界向量回填。 */
@Controller('internal/search-embedding')
export class SearchEmbeddingController {
  /** 用于注入既有内部密钥配置与向量回填服务。 */
  constructor(
    private readonly config: ConfigService<Record<string, string>, false>,
    private readonly embeddingService: SearchEmbeddingService,
  ) {}

  /** 用于校验内部密钥后执行单批回填并返回闭合统计。 */
  @Post()
  @HttpCode(HttpStatus.OK)
  async backfill(@Req() request: Request): Promise<SearchEmbeddingStats> {
    const configured = this.config.get<string>('PURGE_TRIGGER_SECRET');
    if (configured === undefined) throw new ServiceUnavailableException();
    const provided = request.header(INTERNAL_SECRET_HEADER);
    if (typeof provided !== 'string' || !secretsMatch(configured, provided)) {
      throw new UnauthorizedException();
    }
    return this.embeddingService.backfill();
  }
}
