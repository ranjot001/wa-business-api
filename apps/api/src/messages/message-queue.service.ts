import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { MESSAGE_JOBS, QUEUES, type MessageSendJobData } from '@crm/shared';
import { REDIS_CLIENT } from '../redis/redis.module';

/** The api's producer side of messages:message.send. */
@Injectable()
export class MessageQueueService implements OnModuleDestroy {
  private readonly queue: Queue<MessageSendJobData>;

  constructor(@Inject(REDIS_CLIENT) redis: Redis) {
    this.queue = new Queue<MessageSendJobData>(QUEUES.MESSAGES, { connection: redis });
  }

  async enqueueSend(messageId: string): Promise<void> {
    await this.queue.add(
      MESSAGE_JOBS.SEND,
      { messageId },
      {
        // One try plus the three retries the task allows. The worker decides
        // which errors are worth retrying; a 4xx from Meta stops at the first.
        attempts: 4,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
