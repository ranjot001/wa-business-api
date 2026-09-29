import { createHmac } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  prisma: { webhookEvent: { create: vi.fn(async () => ({ id: 'event-1' })) } },
  pingDatabase: vi.fn(),
}));
vi.mock('@crm/db', () => db);

const queue = vi.hoisted(() => ({ add: vi.fn(async () => undefined), close: vi.fn() }));
vi.mock('bullmq', () => ({ Queue: vi.fn(() => queue) }));

import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { REDIS_CLIENT } from '../src/redis/redis.module';
import { WebhooksController } from '../src/webhooks/webhooks.controller';
import { WebhooksService } from '../src/webhooks/webhooks.service';

const APP_SECRET = 'test-meta-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

/** Exactly what Meta does: HMAC-SHA256 over the raw bytes, hex, sha256= prefixed. */
function sign(raw: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
}

describe('POST /v1/webhooks/whatsapp signature verification', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              META_APP_SECRET: APP_SECRET,
              META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
            }),
          ],
        }),
      ],
      controllers: [WebhooksController],
      providers: [WebhooksService, { provide: REDIS_CLIENT, useValue: {} }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');

    // Mirrors main.ts: the raw bytes are what gets signed, so they are what
    // must be hashed. Without this the guard has nothing to verify against.
    app.use(
      express.json({
        verify: (req, _res, buffer) => {
          (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
        },
      }),
    );
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const body = { object: 'whatsapp_business_account', entry: [{ id: 'entry-1', changes: [] }] };

  it('accepts a correctly signed payload and enqueues it', async () => {
    const raw = JSON.stringify(body);

    await request(app.getHttpServer())
      .post('/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(raw))
      .send(raw)
      .expect(200, { received: true });

    expect(db.prisma.webhookEvent.create).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledOnce();
  });

  it('rejects a payload signed with the wrong secret', async () => {
    const raw = JSON.stringify(body);

    const res = await request(app.getHttpServer())
      .post('/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(raw, 'not-the-app-secret'))
      .send(raw)
      .expect(403);

    expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects a body that was altered after signing', async () => {
    const signature = sign(JSON.stringify(body));
    const tampered = JSON.stringify({ ...body, object: 'tampered' });

    await request(app.getHttpServer())
      .post('/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(tampered)
      .expect(403);

    expect(db.prisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header', async () => {
    await request(app.getHttpServer())
      .post('/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .send(JSON.stringify(body))
      .expect(403);
  });

  it('rejects a signature without the sha256= prefix', async () => {
    const raw = JSON.stringify(body);
    const bare = sign(raw).replace('sha256=', '');

    await request(app.getHttpServer())
      .post('/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', bare)
      .send(raw)
      .expect(403);
  });

  it('rejects a short signature without throwing from timingSafeEqual', async () => {
    const raw = JSON.stringify(body);

    // timingSafeEqual throws on a length mismatch, so the guard has to check
    // the length itself. A 500 here would mean it does not.
    await request(app.getHttpServer())
      .post('/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', 'sha256=abcd')
      .send(raw)
      .expect(403);
  });

  it('verifies against the exact bytes, not a re-serialised body', async () => {
    // Same JSON, different byte order on the wire. Signing the parsed and
    // re-stringified object would produce a different digest and 403 here.
    const raw = '{"entry":[{"id":"entry-1","changes":[]}],"object":"whatsapp_business_account"}';

    await request(app.getHttpServer())
      .post('/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(raw))
      .send(raw)
      .expect(200);
  });

  it('verifies a payload with unicode that re-serialises differently', async () => {
    const raw = JSON.stringify({ ...body, note: 'नमस्ते 👍' });

    await request(app.getHttpServer())
      .post('/v1/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', sign(raw))
      .send(raw)
      .expect(200);
  });
});

describe('GET /v1/webhooks/whatsapp verification handshake', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              META_APP_SECRET: APP_SECRET,
              META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
            }),
          ],
        }),
      ],
      controllers: [WebhooksController],
      providers: [WebhooksService, { provide: REDIS_CLIENT, useValue: {} }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('echoes the challenge when the verify token matches', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': '1158201444',
      })
      .expect(200);

    expect(res.text).toBe('1158201444');
  });

  it('refuses a wrong verify token', async () => {
    await request(app.getHttpServer())
      .get('/v1/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': '1158201444',
      })
      .expect(403);
  });

  it('refuses a mode that is not subscribe', async () => {
    await request(app.getHttpServer())
      .get('/v1/webhooks/whatsapp')
      .query({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': '1158201444',
      })
      .expect(403);
  });
});
