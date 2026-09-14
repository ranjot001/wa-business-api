import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../config/env';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * A single shared ioredis connection for the API process. Queue producers and
 * the readiness probe both use it.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis => {
        const url = config.get('REDIS_URL', { infer: true });
        return new Redis(url, {
          // BullMQ requires this, and it keeps a flaky Redis from hanging
          // requests forever behind ioredis' internal retry queue.
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          lazyConnect: false,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor() {}

  async onApplicationShutdown(): Promise<void> {
    // The client is closed by AppModule's shutdown hook through the injector,
    // see main.ts enableShutdownHooks.
  }
}
