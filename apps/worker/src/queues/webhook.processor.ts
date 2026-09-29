import type { Job } from 'bullmq';
import { Prisma, prisma, type WhatsAppAccount } from '@crm/db';
import {
  SOCKET_EVENTS,
  WA_WEBHOOK_FIELDS,
  statusOutranks,
  type WaChange,
  type WaMessage,
  type WaStatus,
  type WaValue,
  type WaWebhookBody,
  type WebhookProcessJobData,
  type WorkspaceEvent,
} from '@crm/shared';
import type { Logger } from '../logger';
import type { RealtimePublisher } from '../realtime';
import { mapInboundMessage } from '../whatsapp/message-mapper';
import type { MediaEnqueuer } from '../whatsapp/media-queue';

/** Postgres unique violation. */
const UNIQUE_VIOLATION = 'P2002';

export interface WebhookProcessorDeps {
  logger: Logger;
  realtime: RealtimePublisher;
  media: MediaEnqueuer;
}

/**
 * Turns one stored webhook envelope into contact, conversation and message
 * rows.
 *
 * Idempotency is the whole point of this processor, because Meta retries and
 * BullMQ retries. It rests on two things:
 *
 *   - the event is only processed while its status is `received`, so a
 *     duplicate job for an already processed event exits immediately
 *   - messages.wa_message_id is unique, so a replayed payload loses the insert
 *     and is skipped rather than creating a second row
 *
 * Anything thrown marks the event failed and rethrows, which lets BullMQ retry
 * with backoff.
 */
export function createWebhookProcessor(deps: WebhookProcessorDeps) {
  return async (job: Job<WebhookProcessJobData>): Promise<{ processed: boolean }> => {
    const { logger } = deps;
    const { eventId } = job.data;

    const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });

    if (!event) {
      logger.warn({ eventId }, 'webhook event not found, nothing to do');
      return { processed: false };
    }

    // Only `processed` is terminal. A `failed` event must stay reprocessable,
    // otherwise the rethrow below buys a BullMQ retry that exits right here
    // and the payload is lost. Re-running is safe: every write below is
    // idempotent.
    if (event.status === 'processed') {
      logger.debug({ eventId }, 'webhook event already processed, skipping');
      return { processed: false };
    }

    try {
      const body = event.payload as WaWebhookBody;

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          await handleChange(change, deps, eventId);
        }
      }

      await prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status: 'processed', processedAt: new Date() },
      });

      return { processed: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status: 'failed', error: message, processedAt: new Date() },
      });

      logger.error({ eventId, err: error }, 'webhook processing failed');

      // Rethrow so BullMQ retries with backoff. The guard above lets a failed
      // event be picked up again, and the error text stays on the row for
      // inspection if every attempt is used up.
      throw error;
    }
  };
}

async function handleChange(
  change: WaChange,
  deps: WebhookProcessorDeps,
  eventId: string,
): Promise<void> {
  const { logger } = deps;
  const field = change.field;
  const value = change.value ?? {};

  switch (field) {
    case WA_WEBHOOK_FIELDS.MESSAGES:
      await handleMessagesChange(value, deps);
      return;

    case WA_WEBHOOK_FIELDS.TEMPLATE_STATUS:
    case WA_WEBHOOK_FIELDS.PHONE_QUALITY:
    case WA_WEBHOOK_FIELDS.ACCOUNT_UPDATE:
      // Stored in webhook_events already. Tasks 08 and 11 act on these.
      logger.info({ eventId, field, value }, 'webhook field stored for a later task');
      return;

    default:
      logger.warn({ eventId, field }, 'unknown webhook field, stored and ignored');
  }
}

async function handleMessagesChange(value: WaValue, deps: WebhookProcessorDeps): Promise<void> {
  const { logger } = deps;
  const phoneNumberId = value.metadata?.phone_number_id;

  if (!phoneNumberId) {
    logger.warn('messages change with no phone_number_id, ignoring');
    return;
  }

  const account = await prisma.whatsAppAccount.findUnique({ where: { phoneNumberId } });

  if (!account) {
    // Someone else's number pointed at our webhook, or a number removed from
    // the workspace. Not an error: there is no tenant to attribute it to.
    logger.warn({ phoneNumberId }, 'unknown phone_number_id');
    return;
  }

  for (const message of value.messages ?? []) {
    await handleInboundMessage(message, value, account, deps);
  }

  for (const status of value.statuses ?? []) {
    await handleStatusUpdate(status, account, deps);
  }
}

async function handleInboundMessage(
  message: WaMessage,
  value: WaValue,
  account: WhatsAppAccount,
  deps: WebhookProcessorDeps,
): Promise<void> {
  const { logger, realtime, media } = deps;

  const waId = message.from;
  const waMessageId = message.id;

  if (!waId || !waMessageId) {
    logger.warn({ waId, waMessageId }, 'inbound message missing from or id, skipping');
    return;
  }

  const workspaceId = account.workspaceId;
  const waTimestamp = parseTimestamp(message.timestamp);
  const profileName = value.contacts?.[0]?.profile?.name ?? null;
  const mapped = mapInboundMessage(message);

  const contact = await upsertRacingOnUnique(
    () =>
      prisma.contact.upsert({
        where: { workspaceId_waId: { workspaceId, waId } },
        create: {
          workspaceId,
          waId,
          profileName,
          lastInboundAt: waTimestamp,
          source: 'inbound',
        },
        update: {
          // Only overwrite the profile name when Meta actually sent one, so a
          // payload without a contacts[] block does not blank it.
          ...(profileName ? { profileName } : {}),
          lastInboundAt: waTimestamp,
        },
      }),
    () => prisma.contact.findUniqueOrThrow({ where: { workspaceId_waId: { workspaceId, waId } } }),
  );

  const conversation = await findOrCreateConversation(
    workspaceId,
    contact.id,
    account.id,
    waTimestamp,
  );

  let messageRow;
  try {
    messageRow = await prisma.message.create({
      data: {
        workspaceId,
        conversationId: conversation.id,
        contactId: contact.id,
        direction: 'inbound',
        waMessageId,
        type: mapped.type,
        content: mapped.content as Prisma.InputJsonValue,
        // Inbound messages have already been delivered to us by definition.
        status: 'delivered',
        waTimestamp,
        replyToMessageId: await resolveReplyTarget(workspaceId, mapped.contextWaMessageId),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      // The replay case. Meta redelivered, or BullMQ retried after a partial
      // failure. The row is already there, so there is nothing to do and
      // nothing to report.
      logger.debug({ waMessageId }, 'message already stored, skipping duplicate');
      return;
    }
    throw error;
  }

  if (mapped.media) {
    const mediaRow = await prisma.media.create({
      data: {
        workspaceId,
        messageId: messageRow.id,
        waMediaId: mapped.media.waMediaId,
        mimeType: mapped.media.mimeType,
        status: 'pending',
      },
    });

    await media.enqueueDownload(mediaRow.id);
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: waTimestamp,
      lastMessagePreview: mapped.preview,
      unreadCount: { increment: 1 },
      // An inbound message on a resolved thread reopens it: the customer is
      // talking again, so it belongs back in the queue.
      ...(conversation.status === 'resolved' ? { status: 'open' as const } : {}),
    },
  });

  await realtime.publish(workspaceId, {
    event: SOCKET_EVENTS.MESSAGE_CREATED,
    workspaceId,
    data: {
      message_id: messageRow.id,
      conversation_id: conversation.id,
      contact_id: contact.id,
      direction: 'inbound',
      type: mapped.type,
      preview: mapped.preview,
      wa_timestamp: waTimestamp?.toISOString() ?? null,
    },
  } satisfies WorkspaceEvent);

  logger.info(
    { workspaceId, conversationId: conversation.id, type: mapped.type, waMessageId },
    'inbound message stored',
  );
}

/**
 * The conversation for this contact on this number.
 *
 * There is exactly one row per (workspace, contact, account) thanks to the
 * unique index, so this is an upsert rather than a find-then-create: two
 * webhooks arriving at once would otherwise race and one would fail.
 */
async function findOrCreateConversation(
  workspaceId: string,
  contactId: string,
  whatsappAccountId: string,
  waTimestamp: Date | null,
) {
  const where = {
    workspaceId_contactId_whatsappAccountId: { workspaceId, contactId, whatsappAccountId },
  };

  return upsertRacingOnUnique(
    () =>
      prisma.conversation.upsert({
        where,
        create: {
          workspaceId,
          contactId,
          whatsappAccountId,
          status: 'open',
          lastMessageAt: waTimestamp,
        },
        update: {},
      }),
    () => prisma.conversation.findUniqueOrThrow({ where }),
  );
}

/**
 * Run an upsert that may lose a race, and fall back to reading the winner's row.
 *
 * Prisma's upsert is a select followed by an insert or update, not a single
 * atomic statement, so two jobs handling the first message from the same new
 * contact both find nothing and both insert. One gets a unique violation. That
 * is not an error worth retrying the whole job for: the row it wanted now
 * exists, so it reads it and carries on.
 *
 * This is not hypothetical. It showed up the first time five queued webhooks
 * from one contact were drained at concurrency 5.
 */
async function upsertRacingOnUnique<T>(
  attempt: () => Promise<T>,
  reread: () => Promise<T>,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      return reread();
    }
    throw error;
  }
}

/** Map Meta's message id for a reply target onto our own row id, if we have it. */
async function resolveReplyTarget(
  workspaceId: string,
  contextWaMessageId: string | null,
): Promise<string | null> {
  if (!contextWaMessageId) {
    return null;
  }

  const target = await prisma.message.findFirst({
    where: { workspaceId, waMessageId: contextWaMessageId },
    select: { id: true },
  });

  return target?.id ?? null;
}

async function handleStatusUpdate(
  status: WaStatus,
  account: WhatsAppAccount,
  deps: WebhookProcessorDeps,
): Promise<void> {
  const { logger, realtime } = deps;
  const waMessageId = status.id;
  const next = status.status;

  if (!waMessageId || !next) {
    return;
  }

  const existing = await prisma.message.findUnique({
    where: { waMessageId },
    select: { id: true, status: true, workspaceId: true, conversationId: true },
  });

  if (!existing) {
    // A status for a message we never stored, typically one sent before this
    // number was connected here.
    logger.debug({ waMessageId, next }, 'status for unknown message, ignoring');
    return;
  }

  if (existing.workspaceId !== account.workspaceId) {
    logger.warn({ waMessageId }, 'status names a message in another workspace, ignoring');
    return;
  }

  // Meta does not guarantee ordering, so a late "delivered" can follow "read".
  // Only forward moves are applied; see MESSAGE_STATUS_RANK.
  if (!statusOutranks(next, existing.status)) {
    logger.debug(
      { waMessageId, from: existing.status, to: next },
      'ignoring out of order status update',
    );
    return;
  }

  const error = status.errors?.[0];

  await prisma.message.update({
    where: { id: existing.id },
    data: {
      status: next as never,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? error?.title ?? null,
    },
  });

  await realtime.publish(existing.workspaceId, {
    event: SOCKET_EVENTS.MESSAGE_STATUS,
    workspaceId: existing.workspaceId,
    data: {
      message_id: existing.id,
      conversation_id: existing.conversationId,
      status: next,
      error_code: error?.code ?? null,
    },
  } satisfies WorkspaceEvent);

  logger.debug({ waMessageId, from: existing.status, to: next }, 'message status updated');
}

/** Meta sends unix seconds as a string. */
function parseTimestamp(timestamp: string | undefined): Date | null {
  if (!timestamp) {
    return null;
  }

  const seconds = Number.parseInt(timestamp, 10);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
}
