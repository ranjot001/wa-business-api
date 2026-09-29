import type Redis from 'ioredis';
import { workspaceChannel, type WorkspaceEvent } from '@crm/shared';
import type { Logger } from './logger';

/**
 * Publishes realtime events onto a workspace's Redis channel.
 *
 * The worker holds no socket connections, so it publishes and the api relays
 * to the workspace room. Task 05 adds that relay; until then these messages
 * are published to nobody, which is fine and keeps the pipeline complete.
 */
export interface RealtimePublisher {
  publish(workspaceId: string, event: WorkspaceEvent): Promise<void>;
}

export function createRealtimePublisher(redis: Redis, logger: Logger): RealtimePublisher {
  return {
    async publish(workspaceId, event): Promise<void> {
      try {
        await redis.publish(workspaceChannel(workspaceId), JSON.stringify(event));
      } catch (error) {
        // A realtime fanout failure must not roll back a message that is
        // already stored. The row is the source of truth; a client that missed
        // the event sees it on next load.
        logger.error({ err: error, workspaceId, event: event.event }, 'realtime publish failed');
      }
    },
  };
}
