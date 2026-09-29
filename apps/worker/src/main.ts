import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUES, SYSTEM_JOBS } from '@crm/shared';
import { loadEnv } from './env';
import { createLogger } from './logger';
import { createRealtimePublisher } from './realtime';
import { createStorage } from './storage';
import { createMediaProcessor } from './queues/media.processor';
import { createSystemProcessor } from './queues/system.processor';
import { createWebhookProcessor } from './queues/webhook.processor';
import { createMediaQueue } from './whatsapp/media-queue';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV !== 'production');

  // BullMQ requires maxRetriesPerRequest: null on its connections.
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  connection.on('error', (error: Error) => {
    logger.error({ err: error }, 'redis connection error');
  });

  await connection.ping();
  logger.info({ redis: redactUrl(env.REDIS_URL) }, 'connected to redis');

  const storage = createStorage(env);

  if (!storage.configured) {
    logger.warn('R2 is not configured, media downloads will fail until R2_* is set');
  }

  // A separate connection for publishing: a connection in subscriber mode
  // cannot issue other commands, and keeping them apart avoids that trap when
  // task 05 adds subscribers.
  const publisherConnection = connection.duplicate();
  const realtime = createRealtimePublisher(publisherConnection, logger);

  const systemQueue = new Queue(QUEUES.SYSTEM, { connection });
  const mediaQueue = createMediaQueue(connection);

  const workers = [
    new Worker(QUEUES.SYSTEM, createSystemProcessor(logger), {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    }),
    new Worker(QUEUES.WEBHOOKS, createWebhookProcessor({ logger, realtime, media: mediaQueue }), {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    }),
    new Worker(QUEUES.MEDIA, createMediaProcessor({ logger, storage, env }), {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    }),
  ];

  for (const worker of workers) {
    worker.on('completed', (job: Job) => {
      logger.info({ queue: worker.name, jobId: job.id, name: job.name }, 'job completed');
    });

    worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error(
        { queue: worker.name, jobId: job?.id, name: job?.name, err: error },
        'job failed',
      );
    });
  }

  // Prove the loop works on every boot.
  await systemQueue.add(SYSTEM_JOBS.PING, { at: new Date().toISOString(), source: 'boot' });

  logger.info(
    { queues: workers.map((worker) => worker.name), concurrency: env.WORKER_CONCURRENCY },
    'worker ready',
  );

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down');
    try {
      // close() waits for in-flight jobs to finish before resolving.
      await Promise.all(workers.map((worker) => worker.close()));
      await systemQueue.close();
      await mediaQueue.close();
      await publisherConnection.quit();
      await connection.quit();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', (signal) => void shutdown(signal));
  process.on('SIGINT', (signal) => void shutdown(signal));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    process.exit(1);
  });
}

/** Keep credentials out of the logs. */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(unparseable url)';
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
