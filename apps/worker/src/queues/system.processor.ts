import type { Job } from 'bullmq';
import { SYSTEM_JOBS, type PingJobData } from '@crm/shared';
import type { Logger } from '../logger';

/**
 * The "system" queue. Today it only handles a no-op "ping" job, which exists so
 * the queue wiring, Redis connection and graceful shutdown can be exercised
 * end to end before any real work lands here.
 */
export function createSystemProcessor(logger: Logger) {
  return async (job: Job<PingJobData>): Promise<{ pong: true; at: string }> => {
    switch (job.name) {
      case SYSTEM_JOBS.PING: {
        const at = new Date().toISOString();
        logger.info({ jobId: job.id, data: job.data }, 'ping');
        return { pong: true, at };
      }
      default:
        throw new Error(`Unknown system job: ${job.name}`);
    }
  };
}
