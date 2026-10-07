/** BullMQ queue names shared by the api (producer) and worker (consumer). */
export const QUEUES = {
  SYSTEM: 'system',
  WEBHOOKS: 'webhooks',
  MEDIA: 'media',
  MESSAGES: 'messages',
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

/** Job names for the webhooks queue. */
export const WEBHOOK_JOBS = {
  PROCESS: 'webhook.process',
} as const;

/**
 * The job carries only the row id. The payload itself is already in
 * webhook_events, so keeping it out of Redis avoids storing the same body
 * twice and keeps the job small enough that a burst cannot fill Redis.
 */
export interface WebhookProcessJobData {
  eventId: string;
}

/** Job names for the media queue. */
export const MEDIA_JOBS = {
  DOWNLOAD: 'media.download',
} as const;

export interface MediaDownloadJobData {
  mediaId: string;
}

/** Job names for the messages queue. */
export const MESSAGE_JOBS = {
  SEND: 'message.send',
} as const;

/**
 * Like the webhook job, only the row id travels. The message row is the source
 * of truth for what to send, so a retry always sends what is stored now.
 */
export interface MessageSendJobData {
  messageId: string;
}
