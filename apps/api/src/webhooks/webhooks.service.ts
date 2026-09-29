import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { QUEUES, WEBHOOK_JOBS, type WaWebhookBody, type WebhookProcessJobData } from '@crm/shared';
import { prisma } from '@crm/db';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly queue: Queue<WebhookProcessJobData>;

  constructor(@Inject(REDIS_CLIENT) redis: Redis) {
    this.queue = new Queue<WebhookProcessJobData>(QUEUES.WEBHOOKS, { connection: redis });
  }

  /**
   * Store the envelope and hand it to the worker.
   *
   * Deliberately does the least possible work: CLAUDE.md requires webhooks to
   * return 200 fast and make no Meta calls in the request handler, and Meta
   * retries anything slow or non-200, which would duplicate work. One insert,
   * one enqueue.
   */
  async receive(body: WaWebhookBody): Promise<void> {
    const event = await prisma.webhookEvent.create({
      data: {
        provider: 'meta',
        // Meta's own id for the entry, handy when reconciling against their
        // dashboard. Not unique: one entry can carry several changes.
        externalId: body.entry?.[0]?.id ?? null,
        payload: body as object,
        status: 'received',
      },
      select: { id: true },
    });

    await this.queue.add(
      WEBHOOK_JOBS.PROCESS,
      { eventId: event.id },
      {
        // Meta redelivers on failure anyway; these retries are for our own
        // transient problems, like the database being briefly unreachable.
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );

    this.logger.debug({ eventId: event.id }, 'webhook stored and enqueued');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
