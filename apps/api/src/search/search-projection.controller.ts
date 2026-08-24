/** @fileoverview 提供受既有内部密钥保护的搜索投影维护端点。 */

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
import { SearchProjectionService } from './search-projection.service';

// SEARCH-01 沿用现有 Worker 内部密钥边界，避免在本切片扩大运行时配置迁移。
const INTERNAL_SECRET_HEADER = 'x-purge-secret';

/** Worker 单次触发获得的闭合维护统计。 */
export interface SearchProjectionMaintenanceStats {
  readonly processedEvents: number;
  readonly quarantinedEvents: number;
  readonly scannedDocuments: number;
}

/** 用于让 Worker 经 API 模块所有权边界触发投影消费与补偿。 */
@Controller('internal/search-projection')
export class SearchProjectionController {
  /** 用于注入既有内部密钥配置与 Search 应用服务。 */
  constructor(
    private readonly config: ConfigService<Record<string, string>, false>,
    private readonly projectionService: SearchProjectionService,
  ) {}

  /** 用于校验内部密钥后先排空事件再执行一页补偿扫描。 */
  @Post()
  @HttpCode(HttpStatus.OK)
  async maintain(@Req() request: Request): Promise<SearchProjectionMaintenanceStats> {
    const configured = this.config.get<string>('PURGE_TRIGGER_SECRET');
    if (configured === undefined) throw new ServiceUnavailableException();
    const provided = request.header(INTERNAL_SECRET_HEADER);
    if (typeof provided !== 'string' || !secretsMatch(configured, provided)) {
      throw new UnauthorizedException();
    }
    const events = await this.projectionService.processPendingEvents();
    const scan = await this.projectionService.scanCurrentDocuments();
    return {
      processedEvents: events.processedEvents,
      quarantinedEvents: events.quarantinedEvents,
      scannedDocuments: scan.projectedDocuments + scan.removedProjections,
    };
  }
}
