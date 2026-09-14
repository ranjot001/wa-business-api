import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateEnv, type Env } from './config/env';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Fails fast at boot when a variable is missing or malformed.
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isDev = config.get('NODE_ENV', { infer: true }) !== 'production';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const existing = req.headers['x-request-id'];
              const id = typeof existing === 'string' ? existing : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            // Health checks are noisy and say nothing when they pass.
            autoLogging: {
              ignore: (req: IncomingMessage) => req.url === '/v1/health' || req.url === '/v1/ready',
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-hub-signature-256"]',
                'res.headers["set-cookie"]',
              ],
              censor: '[redacted]',
            },
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
                }
              : undefined,
          },
        };
      },
    }),
    RedisModule,
    HealthModule,
  ],
})
export class AppModule {}
