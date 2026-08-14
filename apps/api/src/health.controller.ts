/**
 * @fileoverview 提供 API 进程级存活和就绪探针。
 */

import { Controller, Get, Header } from '@nestjs/common';

interface ServiceHealth {
  service: 'api';
  status: 'ok';
  timestamp: string;
  version: string;
}

/** 用于表达不包含依赖状态的进程健康结果。 */
@Controller('health')
export class HealthController {
  /** 用于确认 HTTP 进程可以响应请求。 */
  @Get('live')
  @Header('Cache-Control', 'no-store')
  getLiveness(): ServiceHealth {
    return this.createHealth();
  }

  /** 用于确认进程已经完成启动准备。 */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  getReadiness(): ServiceHealth {
    return this.createHealth();
  }

  /** 用于生成新时间戳，避免探针结果被误认为缓存。 */
  private createHealth(): ServiceHealth {
    return {
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.0',
    };
  }
}
