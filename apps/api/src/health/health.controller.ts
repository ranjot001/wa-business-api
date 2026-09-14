import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type ReadinessReport } from './health.service';

interface LivenessReport {
  status: 'ok';
  uptime: number;
  timestamp: string;
}

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness. Answers as long as the process is running, touches nothing
   * external, and is what Railway's healthcheck hits.
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  liveness(): LivenessReport {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness. Actually talks to Postgres and Redis. Returns 503 when either
   * is down so a load balancer can pull the instance out of rotation.
   */
  @Get('ready')
  async readiness(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const report = await this.health.check();
    const healthy = report.postgres === 'ok' && report.redis === 'ok';
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
