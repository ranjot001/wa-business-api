import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { pingDatabase } from '@crm/db';
import { REDIS_CLIENT } from '../redis/redis.module';

export type DependencyStatus = 'ok' | 'error';

export interface ReadinessReport {
  postgres: DependencyStatus;
  redis: DependencyStatus;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(): Promise<ReadinessReport> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    return { postgres, redis };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    try {
      await pingDatabase();
      return 'ok';
    } catch (error) {
      this.logger.error({ err: error }, 'postgres readiness check failed');
      return 'error';
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'ok' : 'error';
    } catch (error) {
      this.logger.error({ err: error }, 'redis readiness check failed');
      return 'error';
    }
  }
}
