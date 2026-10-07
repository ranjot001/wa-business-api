import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { workspaceChannel, type WorkspaceEvent } from '@crm/shared';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Publishes realtime events to a workspace's Redis channel, the same channel
 * the worker publishes to. Task 05 relays the channel to the socket room.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publish(event: WorkspaceEvent): Promise<void> {
    try {
      await this.redis.publish(workspaceChannel(event.workspaceId), JSON.stringify(event));
    } catch (error) {
      // The row is already committed and is the source of truth. A missed
      // event is caught up on the client's next load, so this never fails the
      // request.
      this.logger.error(
        { err: error, workspaceId: event.workspaceId, event: event.event },
        'realtime publish failed',
      );
    }
  }
}
