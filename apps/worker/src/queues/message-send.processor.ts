import { UnrecoverableError, type Job } from 'bullmq';
import { prisma, type Message, type WhatsAppAccount } from '@crm/db';
import {
  MetaClient,
  SOCKET_EVENTS,
  decrypt,
  parseEncryptionKey,
  type MessageSendJobData,
  type WorkspaceEvent,
} from '@crm/shared';
import type { Env } from '../env';
import type { Logger } from '../logger';
import type { RealtimePublisher } from '../realtime';
import type { ObjectStorage } from '../storage';
import { buildMetaPayload, isOutboundMediaType } from '../whatsapp/payload-builder';
import { PermanentSendError, classifySendError } from '../whatsapp/send-errors';

export interface MessageSendProcessorDeps {
  logger: Logger;
  realtime: RealtimePublisher;
  storage: ObjectStorage;
  env: Env;
}

/**
 * Meta keeps an uploaded media id for 30 days. A cached id older than this is
 * not trusted and the file is uploaded again.
 */
const META_MEDIA_TTL_MS = 29 * 24 * 60 * 60 * 1000;

/**
 * Sends one queued outbound message through Meta (steps 3 to 5 of the send
 * flow). The status webhooks from task 03 carry it on to delivered and read.
 *
 * Only a `queued` message is sent. A duplicate job, or a retry of a job whose
 * send already went through, finds the row at `sent` or later and stops, so a
 * customer never receives the same message twice from a retry.
 */
export function createMessageSendProcessor(deps: MessageSendProcessorDeps) {
  const { logger, env } = deps;
  const key = parseEncryptionKey(env.ENCRYPTION_KEY);

  return async (job: Job<MessageSendJobData>): Promise<{ sent: boolean }> => {
    const { messageId } = job.data;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { contact: true, conversation: { include: { whatsappAccount: true } } },
    });

    if (!message) {
      logger.warn({ messageId }, 'message to send not found');
      return { sent: false };
    }

    if (message.direction !== 'outbound' || message.status !== 'queued') {
      logger.debug({ messageId, status: message.status }, 'message is not queued, skipping');
      return { sent: false };
    }

    const account = message.conversation.whatsappAccount;
    const client = new MetaClient({
      accessToken: decrypt(account.accessTokenEnc, key),
      version: env.META_GRAPH_VERSION,
      onLog: (fields, text) => {
        logger.error({ ...fields, messageId }, text);
      },
    });

    let waMessageId: string;

    try {
      const waMediaId = isOutboundMediaType(message.type)
        ? await resolveMetaMediaId(message, account, client, deps)
        : undefined;

      const payload = buildMetaPayload(message, message.contact.waId, waMediaId);
      ({ waMessageId } = await client.sendMessage(account, payload));
    } catch (error) {
      await handleSendFailure(error, message, job, deps);
      // handleSendFailure always throws; this keeps the compiler sure of it.
      throw error;
    }

    await recordSent(message, waMessageId, deps);
    return { sent: true };
  };
}

/**
 * Step 4. Meta has the message now, so from here nothing may cause a resend.
 *
 * If this write fails, retrying the job would find the row still queued and
 * send the message a second time. So the failure is logged with Meta's id for
 * a manual fix and the job is failed without retry.
 */
async function recordSent(
  message: Message,
  waMessageId: string,
  deps: MessageSendProcessorDeps,
): Promise<void> {
  const { logger, realtime } = deps;
  const now = new Date();

  try {
    await prisma.$transaction([
      // Conditional on queued, so this never overwrites a status that moved
      // on in the meantime.
      prisma.message.updateMany({
        where: { id: message.id, status: 'queued' },
        data: { status: 'sent', waMessageId, waTimestamp: now },
      }),
      prisma.contact.update({
        where: { id: message.contactId },
        data: { lastOutboundAt: now },
      }),
    ]);
  } catch (error) {
    logger.error(
      { err: error, messageId: message.id, waMessageId },
      'message was sent but recording it failed; not retrying, to avoid a duplicate send',
    );
    throw new UnrecoverableError(`sent as ${waMessageId} but could not be recorded`);
  }

  await publishStatus(message, 'sent', null, realtime);

  logger.info({ messageId: message.id, waMessageId, type: message.type }, 'message sent');
}

/**
 * Step 5. Retryable failures are rethrown for BullMQ to retry with backoff, and
 * the row stays queued until the last attempt. Anything else, or the last
 * attempt, marks the row failed with Meta's code and reason.
 */
async function handleSendFailure(
  error: unknown,
  message: Message,
  job: Job<MessageSendJobData>,
  deps: MessageSendProcessorDeps,
): Promise<never> {
  const { logger, realtime } = deps;
  const decision = classifySendError(error);
  const attempt = (job.attemptsMade ?? 0) + 1;
  const isLastAttempt = attempt >= (job.opts.attempts ?? 1);
  const giveUp = !decision.retry || isLastAttempt;

  logger.error(
    {
      messageId: message.id,
      err: error,
      attempt,
      retry: decision.retry,
      giveUp,
      metaCode: decision.code,
    },
    'message send failed',
  );

  if (giveUp) {
    await prisma.message.updateMany({
      where: { id: message.id, status: 'queued' },
      data: { status: 'failed', errorCode: decision.code, errorMessage: decision.message },
    });
    await publishStatus(message, 'failed', decision.code, realtime);
  }

  if (!decision.retry) {
    // Fails the job now, skipping the remaining attempts.
    throw new UnrecoverableError(decision.message);
  }

  throw error;
}

/**
 * The Meta id for the message's media, uploading the file from R2 on first use
 * and caching the id on the media row so later sends skip the upload.
 *
 * The cache is per row, not per number. That is right while a workspace has
 * one number; task 10 adds more, and a Meta media id belongs to the number
 * that uploaded it.
 */
async function resolveMetaMediaId(
  message: Message,
  account: WhatsAppAccount,
  client: MetaClient,
  deps: MessageSendProcessorDeps,
): Promise<string> {
  const { storage, logger } = deps;
  const content = (message.content ?? {}) as Record<string, unknown>;
  const mediaId = typeof content.media_id === 'string' ? content.media_id : null;

  if (!mediaId) {
    throw new PermanentSendError('Media message has no media_id');
  }

  const media = await prisma.media.findFirst({
    where: { id: mediaId, workspaceId: message.workspaceId },
  });

  if (!media || media.status !== 'ready' || !media.storageKey) {
    throw new PermanentSendError(`Media ${mediaId} is missing or not ready`);
  }

  const cacheIsFresh = Date.now() - media.updatedAt.getTime() < META_MEDIA_TTL_MS;
  if (media.waMediaId && cacheIsFresh) {
    return media.waMediaId;
  }

  if (!storage.configured) {
    throw new PermanentSendError('R2 is not configured, cannot read the media to upload it');
  }

  const body = await storage.get(media.storageKey);
  const filename = typeof content.filename === 'string' ? content.filename : undefined;
  const mimeType = media.mimeType ?? 'application/octet-stream';
  const { id } = await client.uploadMedia(account, body, mimeType, filename);

  await prisma.media.update({ where: { id: media.id }, data: { waMediaId: id } });

  logger.info({ mediaId: media.id, waMediaId: id, bytes: body.byteLength }, 'media uploaded to Meta');

  return id;
}

async function publishStatus(
  message: Message,
  status: 'sent' | 'failed',
  errorCode: number | null,
  realtime: RealtimePublisher,
): Promise<void> {
  await realtime.publish(message.workspaceId, {
    event: SOCKET_EVENTS.MESSAGE_STATUS,
    workspaceId: message.workspaceId,
    data: {
      message_id: message.id,
      conversation_id: message.conversationId,
      status,
      error_code: errorCode,
    },
  } satisfies WorkspaceEvent);
}
