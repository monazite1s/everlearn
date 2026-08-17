/** @fileoverview 提供仅限内部调用的附件孤儿清理触发端点。 */

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
import { AttachmentOrphanPurgeService } from './attachment-orphan-purge.service';

const PURGE_SECRET_HEADER = 'x-purge-secret';

/** 用于按共享密钥触发一次孤儿清理并返回闭合统计。 */
@Controller('internal/attachment-orphans')
export class AttachmentOrphanPurgeController {
  /** 用于注入内部触发所需的配置与清理服务。 */
  constructor(
    /** 用于读取内部触发密钥配置。 */
    private readonly config: ConfigService<Record<string, string>, false>,
    /** 用于执行到期孤儿清理的应用服务。 */
    private readonly purgeService: AttachmentOrphanPurgeService,
  ) {}

  /** 用于校验内部调用密钥后执行一次清理。 */
  @Post()
  @HttpCode(HttpStatus.OK)
  async trigger(@Req() request: Request): Promise<unknown> {
    const configured = this.config.get<string>('PURGE_TRIGGER_SECRET');
    if (configured === undefined) throw new ServiceUnavailableException();
    const provided = request.header(PURGE_SECRET_HEADER);
    if (typeof provided !== 'string' || !secretsMatch(configured, provided)) {
      throw new UnauthorizedException();
    }
    return this.purgeService.purgeExpired(new Date());
  }
}
