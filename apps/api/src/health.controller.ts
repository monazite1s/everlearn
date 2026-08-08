/**
 * @fileoverview Exposes process-level liveness and readiness probes for the API.
 */

import { Controller, Get, Header } from '@nestjs/common';

interface ServiceHealth {
  service: 'api';
  status: 'ok';
  timestamp: string;
  version: string;
}

/** Reports only process health until dependency checks are added in FND-06. */
@Controller('health')
export class HealthController {
  /** Confirms that the HTTP process can serve requests. */
  @Get('live')
  @Header('Cache-Control', 'no-store')
  getLiveness(): ServiceHealth {
    return this.createHealth();
  }

  /** Confirms infrastructure readiness before external dependencies are connected. */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  getReadiness(): ServiceHealth {
    return this.createHealth();
  }

  /** Creates a fresh timestamp so probes cannot be mistaken for cached state. */
  private createHealth(): ServiceHealth {
    return {
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.0',
    };
  }
}
