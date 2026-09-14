/** BullMQ queue names shared by the api (producer) and worker (consumer). */
export const QUEUES = {
  SYSTEM: 'system',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Job names for the system queue. */
export const SYSTEM_JOBS = {
  PING: 'ping',
} as const;

export interface PingJobData {
  at: string;
  source: string;
}
