import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { MEDIA_JOBS, QUEUES, type MediaDownloadJobData } from '@crm/shared';

/** Lets the webhook processor ask for a download without owning the queue. */
export interface MediaEnqueuer {
  enqueueDownload(mediaId: string): Promise<void>;
}

export function createMediaQueue(connection: Redis): Queue<MediaDownloadJobData> & MediaEnqueuer {
  const queue = new Queue<MediaDownloadJobData>(QUEUES.MEDIA, { connection });

  return Object.assign(queue, {
    async enqueueDownload(mediaId: string): Promise<void> {
      await queue.add(
        MEDIA_JOBS.DOWNLOAD,
        { mediaId },
        {
          // The task asks for 3 attempts. Meta's media urls are short lived,
          // so the backoff stays tight.
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      );
    },
  });
}
