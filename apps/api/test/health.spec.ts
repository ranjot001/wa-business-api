import { Controller, Get, NotFoundException, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Hoisted above the imports below by vitest, so the controller under test sees
// the mock rather than a real database connection.
const pingDatabase = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('@crm/db', () => ({ pingDatabase }));

import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { REDIS_CLIENT } from '../src/redis/redis.module';

@Controller('boom')
class BoomController {
  @Get()
  boom(): never {
    throw new NotFoundException('Contact not found');
  }
}

describe('health endpoints', () => {
  let app: INestApplication;
  const redis = { ping: vi.fn(async () => 'PONG') };

  beforeAll(async () => {
    pingDatabase.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, BoomController],
      providers: [HealthService, { provide: REDIS_CLIENT, useValue: redis }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health returns 200 ok', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /v1/ready reports both dependencies ok', async () => {
    const res = await request(app.getHttpServer()).get('/v1/ready').expect(200);
    expect(res.body).toEqual({ postgres: 'ok', redis: 'ok' });
  });

  it('GET /v1/ready returns 503 when postgres is down', async () => {
    pingDatabase.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/v1/ready').expect(503);
    expect(res.body).toEqual({ postgres: 'error', redis: 'ok' });
  });

  it('errors use the { error: { code, message } } shape', async () => {
    const res = await request(app.getHttpServer()).get('/v1/boom').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Contact not found' },
    });
  });
});
