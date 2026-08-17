/** @fileoverview 提供仅限内部调用的到期清理触发端点。 */

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
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { TrashPurgeService } from './trash-purge.service';

const PURGE_SECRET_HEADER = 'x-purge-secret';

/** 用于对密钥摘要做恒时比较，避免时序侧信道。 */
function secretsMatch(expected: string, provided: string): boolean {
  const expectedDigest = createHash('sha256').update(expected).digest();
  const providedDigest = createHash('sha256').update(provided).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

/** 用于按共享密钥触发一次到期清理并返回闭合统计。 */
@Controller('internal/trash-purge')
export class TrashPurgeController {
  /** 用于注入内部触发所需的配置与清理服务。 */
  constructor(
    /** 用于读取可选的内部触发密钥配置。 */
    private readonly config: ConfigService<Record<string, string>, false>,
    /** 用于执行到期清理的应用服务。 */
    private readonly purgeService: TrashPurgeService,
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
