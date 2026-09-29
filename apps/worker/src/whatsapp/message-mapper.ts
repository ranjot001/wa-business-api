import type { MessageType } from '@crm/db';
import type { WaMediaObject, WaMessage } from '@crm/shared';

/**
 * Maps one inbound Meta message object to the row we store.
 *
 * Pure and total: every input produces a result, because Meta ships new
 * message types without warning and an unknown one must land as `unsupported`
 * with its raw payload rather than throwing and stalling the whole batch.
 */

/** Media types that need a follow up download job. */
const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const;

export type MediaMessageType = (typeof MEDIA_TYPES)[number];

export interface MappedMedia {
  waMediaId: string;
  mimeType: string | null;
}

export interface MappedMessage {
  type: MessageType;
  content: Record<string, unknown>;
  /** Set for media types, so the caller creates the row and enqueues a download. */
  media: MappedMedia | null;
  /** One line for the conversation list. */
  preview: string;
  /** Meta's id of the message this replies to or reacts to, when there is one. */
  contextWaMessageId: string | null;
}

function isMediaType(type: string): type is MediaMessageType {
  return (MEDIA_TYPES as readonly string[]).includes(type);
}

function mediaContent(media: WaMediaObject | undefined): Record<string, unknown> {
  return {
    media_id: media?.id ?? null,
    mime_type: media?.mime_type ?? null,
    sha256: media?.sha256 ?? null,
    caption: media?.caption ?? null,
    filename: media?.filename ?? null,
  };
}

/**
 * Collapse to a single line and cap it; previews sit in a list, not a bubble.
 * The ellipsis counts towards the limit, so the result is never longer than
 * `limit` and a column sized for it cannot overflow.
 */
const ELLIPSIS = '...';

export function toPreview(text: string, limit = 120): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();

  if (collapsed.length <= limit) {
    return collapsed;
  }

  return `${collapsed.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}`;
}

export function mapInboundMessage(message: WaMessage): MappedMessage {
  const type = message.type ?? 'unknown';
  const contextWaMessageId = message.context?.id ?? null;

  switch (type) {
    case 'text': {
      const body = message.text?.body ?? '';
      return {
        type: 'text',
        content: { text: body },
        media: null,
        preview: toPreview(body),
        contextWaMessageId,
      };
    }

    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker': {
      const media = message[type];
      const content = mediaContent(media);
      const caption = typeof content.caption === 'string' ? content.caption : null;
      const filename = typeof content.filename === 'string' ? content.filename : null;

      return {
        type,
        content,
        // A media object with no id cannot be downloaded. It still stores as a
        // message so the thread is not missing a bubble.
        media: media?.id ? { waMediaId: media.id, mimeType: media.mime_type ?? null } : null,
        preview: toPreview(caption ?? filename ?? `[${type}]`),
        contextWaMessageId,
      };
    }

    case 'location': {
      const location = message.location;
      return {
        type: 'location',
        content: {
          lat: location?.latitude ?? null,
          lng: location?.longitude ?? null,
          name: location?.name ?? null,
          address: location?.address ?? null,
        },
        media: null,
        preview: toPreview(location?.name ?? location?.address ?? '[location]'),
        contextWaMessageId,
      };
    }

    case 'contacts': {
      // Kept raw: a shared contact card is a deep, variable structure and
      // nothing in the product reads inside it yet.
      return {
        type: 'contacts',
        content: { contacts: message.contacts ?? [] },
        media: null,
        preview: '[contact card]',
        contextWaMessageId,
      };
    }

    case 'reaction': {
      const emoji = message.reaction?.emoji ?? null;
      return {
        type: 'reaction',
        content: {
          emoji,
          reacted_to_wa_message_id: message.reaction?.message_id ?? null,
        },
        media: null,
        // Removing a reaction arrives as a reaction with no emoji.
        preview: emoji ? toPreview(`Reacted ${emoji}`) : 'Removed a reaction',
        // A reaction's target is in reaction.message_id, not context.
        contextWaMessageId: message.reaction?.message_id ?? contextWaMessageId,
      };
    }

    case 'button': {
      const title = message.button?.text ?? null;
      return {
        type: 'button',
        content: { payload: message.button?.payload ?? null, title },
        media: null,
        preview: toPreview(title ?? '[button]'),
        contextWaMessageId,
      };
    }

    case 'interactive': {
      const interactive = message.interactive;
      const reply = interactive?.button_reply ?? interactive?.list_reply;
      const title = reply?.title ?? null;

      return {
        type: 'interactive',
        content: {
          payload: reply?.id ?? null,
          title,
          interactive_type: interactive?.type ?? null,
        },
        media: null,
        preview: toPreview(title ?? '[interactive reply]'),
        contextWaMessageId,
      };
    }

    default: {
      // Unknown or system types, including the "unsupported" type Meta itself
      // sends for message kinds the Cloud API cannot represent.
      return {
        type: 'unsupported',
        content: { raw: message as unknown as Record<string, unknown>, wa_type: type },
        media: null,
        preview: `[${type} message]`,
        contextWaMessageId,
      };
    }
  }
}

export { MEDIA_TYPES, isMediaType };
