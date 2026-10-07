import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Contact, Message } from '@crm/db';
import {
  ERROR_CODES,
  SOCKET_EVENTS,
  isOutboundMedia,
  outboundPreview,
  toOutboundContent,
  type Paginated,
  type SendMediaMessageInput,
  type SendMessageInput,
} from '@crm/shared';
import { ConversationsService } from '../conversations/conversations.service';
import { isWindowOpen, windowExpiresAt } from '../conversations/window';
import { MediaRepository } from '../media/media.repository';
import { RealtimeService } from '../realtime/realtime.service';
import { MessageQueueService } from './message-queue.service';
import { MessagesRepository } from './messages.repository';

export interface MessageView {
  id: string;
  conversation_id: string;
  contact_id: string;
  direction: string;
  type: string;
  content: unknown;
  status: string;
  wa_message_id: string | null;
  error_code: number | null;
  error_message: string | null;
  sent_by_user_id: string | null;
  reply_to_message_id: string | null;
  wa_timestamp: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_LIMIT = 50;

/** Which mime families each media message type accepts. Documents take anything. */
const MIME_PREFIX: Record<SendMediaMessageInput['type'], string | null> = {
  image: 'image/',
  video: 'video/',
  audio: 'audio/',
  document: null,
};

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly messages: MessagesRepository,
    private readonly conversations: ConversationsService,
    private readonly media: MediaRepository,
    private readonly queue: MessageQueueService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(
    workspaceId: string,
    conversationId: string,
    limit = DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<Paginated<MessageView>> {
    await this.conversations.require(workspaceId, conversationId);
    const { rows, nextCursor } = await this.messages.page(
      workspaceId,
      conversationId,
      limit,
      cursor,
    );
    return { data: rows.map(toMessageView), next_cursor: nextCursor };
  }

  async get(workspaceId: string, id: string): Promise<MessageView> {
    return toMessageView(await this.require(workspaceId, id));
  }

  /**
   * Steps 1 and 2 of the send flow: validate, store as queued, enqueue. The
   * worker does the Meta call, so this answers as soon as the row exists and
   * the agent sees the bubble immediately with a queued tick.
   */
  async send(
    workspaceId: string,
    userId: string,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<MessageView> {
    const conversation = await this.conversations.require(workspaceId, conversationId);

    if (conversation.whatsappAccount.status !== 'connected') {
      throw new ConflictException({
        code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
        message: 'The WhatsApp number on this conversation is not connected',
      });
    }

    if (input.type !== 'template') {
      assertWindowOpen(conversation.contact);
    }

    if (isOutboundMedia(input)) {
      await this.assertMediaSendable(workspaceId, input);
    }

    const message = await this.messages.createOutbound({
      workspaceId,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      sentByUserId: userId,
      type: input.type,
      content: toOutboundContent(input),
      preview: outboundPreview(input),
    });

    const view = toMessageView(await this.enqueue(message));

    await this.realtime.publish({
      event: SOCKET_EVENTS.MESSAGE_CREATED,
      workspaceId,
      data: {
        message_id: message.id,
        conversation_id: conversation.id,
        contact_id: conversation.contactId,
        direction: 'outbound',
        type: message.type,
        preview: outboundPreview(input),
        status: view.status,
      },
    });

    return view;
  }

  /** Failed outbound messages only. Same window rule as a first send. */
  async retry(workspaceId: string, id: string): Promise<MessageView> {
    const message = await this.require(workspaceId, id);

    if (message.direction !== 'outbound' || message.status !== 'failed') {
      throw notRetryable(message);
    }

    if (message.type !== 'template') {
      assertWindowOpen(message.contact);
    }

    if (!(await this.messages.requeueFailed(workspaceId, id))) {
      // Someone else retried it between the read and the write.
      throw notRetryable(message);
    }

    const requeued = await this.enqueue(await this.require(workspaceId, id));

    await this.realtime.publish({
      event: SOCKET_EVENTS.MESSAGE_STATUS,
      workspaceId,
      data: {
        message_id: requeued.id,
        conversation_id: requeued.conversationId,
        status: requeued.status,
        error_code: null,
      },
    });

    return toMessageView(requeued);
  }

  /**
   * Hand the message to the worker. If Redis refuses the job the row would sit
   * queued forever with nothing to send it, so it is marked failed instead,
   * which makes it retryable through POST /messages/:id/retry.
   */
  private async enqueue(message: Message): Promise<Message> {
    try {
      await this.queue.enqueueSend(message.id);
      return message;
    } catch (error) {
      this.logger.error({ err: error, messageId: message.id }, 'could not enqueue message.send');
      await this.messages.markFailed(message.id, 'Could not queue the message for sending');
      throw new ServiceUnavailableException({
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'The message was saved but could not be queued. Retry it in a moment.',
        details: { message_id: message.id },
      });
    }
  }

  private async require(workspaceId: string, id: string) {
    const message = await this.messages.find(workspaceId, id);

    if (!message) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Message not found' });
    }

    return message;
  }

  /** The media must be ours, stored, and of a kind the message type can carry. */
  private async assertMediaSendable(
    workspaceId: string,
    input: SendMediaMessageInput,
  ): Promise<void> {
    const media = await this.media.find(workspaceId, input.media_id);

    if (!media) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Media not found' });
    }

    if (media.status !== 'ready' || !media.storageKey) {
      throw new ConflictException({
        code: ERROR_CODES.MEDIA_NOT_READY,
        message: `Media is ${media.status}, not ready`,
        details: { status: media.status },
      });
    }

    const prefix = MIME_PREFIX[input.type];
    const mimeType = media.mimeType ?? '';

    if (prefix && !mimeType.startsWith(prefix)) {
      throw new BadRequestException({
        code: ERROR_CODES.BAD_REQUEST,
        message: `A ${mimeType || 'file of unknown type'} cannot be sent as ${input.type}`,
        details: { mime_type: media.mimeType, type: input.type },
      });
    }
  }
}

/**
 * Free form messages need the 24 hour window open. Throws 409 WINDOW_CLOSED
 * with when it closed, or null for a contact who has never written in.
 */
function assertWindowOpen(contact: Contact): void {
  if (isWindowOpen(contact)) {
    return;
  }

  throw new ConflictException({
    code: ERROR_CODES.WINDOW_CLOSED,
    message:
      'The 24 hour customer service window is closed. Send an approved template to reopen the conversation.',
    details: {
      last_inbound_at: contact.lastInboundAt?.toISOString() ?? null,
      expires_at: windowExpiresAt(contact)?.toISOString() ?? null,
    },
  });
}

function notRetryable(message: Message): ConflictException {
  return new ConflictException({
    code: ERROR_CODES.MESSAGE_NOT_RETRYABLE,
    message: 'Only failed outbound messages can be retried',
    details: { direction: message.direction, status: message.status },
  });
}

export function toMessageView(message: Message): MessageView {
  return {
    id: message.id,
    conversation_id: message.conversationId,
    contact_id: message.contactId,
    direction: message.direction,
    type: message.type,
    content: message.content,
    status: message.status,
    wa_message_id: message.waMessageId,
    error_code: message.errorCode,
    error_message: message.errorMessage,
    sent_by_user_id: message.sentByUserId,
    reply_to_message_id: message.replyToMessageId,
    wa_timestamp: message.waTimestamp?.toISOString() ?? null,
    created_at: message.createdAt.toISOString(),
    updated_at: message.updatedAt.toISOString(),
  };
}
