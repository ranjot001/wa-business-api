import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUES, SYSTEM_JOBS } from '@crm/shared';
import { loadEnv } from './env';
import { createLogger } from './logger';
import { createSystemProcessor } from './queues/system.processor';

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

  const systemQueue = new Queue(QUEUES.SYSTEM, { connection });

  const systemWorker = new Worker(QUEUES.SYSTEM, createSystemProcessor(logger), {
    connection,
    concurrency: env.WORKER_CONCURRENCY,
  });

  systemWorker.on('completed', (job: Job) => {
    logger.info({ queue: QUEUES.SYSTEM, jobId: job.id, name: job.name }, 'job completed');
  });

  systemWorker.on('failed', (job: Job | undefined, error: Error) => {
    logger.error(
      { queue: QUEUES.SYSTEM, jobId: job?.id, name: job?.name, err: error },
      'job failed',
    );
  });

  // Prove the loop works on every boot.
  await systemQueue.add(SYSTEM_JOBS.PING, { at: new Date().toISOString(), source: 'boot' });

  logger.info({ queues: [QUEUES.SYSTEM], concurrency: env.WORKER_CONCURRENCY }, 'worker ready');

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down');
    try {
      // close() waits for in-flight jobs to finish before resolving.
      await systemWorker.close();
      await systemQueue.close();
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
