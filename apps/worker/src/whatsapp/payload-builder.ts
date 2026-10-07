import type { MessageType } from '@crm/db';
import type { MetaSendPayload } from '@crm/shared';
import { PermanentSendError } from './send-errors';

/**
 * Builds the Meta /messages body from a stored outbound message.
 *
 * Pure: no database, no network. The media case takes the Meta media id as an
 * argument because resolving it may mean an upload, which the processor does
 * before calling this. Content was validated by the api on the way in, but it
 * is read defensively anyway, since a malformed row would otherwise produce a
 * malformed request that Meta answers with a less useful error.
 */

export interface OutboundMessageInput {
  type: MessageType;
  content: unknown;
}

const MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const;
type OutboundMediaType = (typeof MEDIA_TYPES)[number];

export function isOutboundMediaType(type: string): type is OutboundMediaType {
  return (MEDIA_TYPES as readonly string[]).includes(type);
}

export function buildMetaPayload(
  message: OutboundMessageInput,
  to: string,
  waMediaId?: string,
): MetaSendPayload {
  const content = asRecord(message.content);
  const base = { messaging_product: 'whatsapp' as const, recipient_type: 'individual' as const, to };

  switch (message.type) {
    case 'text': {
      const body = stringField(content, 'text');
      if (!body) {
        throw new PermanentSendError('Text message has no text');
      }
      // preview_url false: an agent pasting a link should not have WhatsApp
      // fetch and render a preview card they did not ask for.
      return { ...base, type: 'text', text: { body, preview_url: false } };
    }

    case 'image':
    case 'video':
    case 'audio':
    case 'document': {
      if (!waMediaId) {
        throw new PermanentSendError(`${message.type} message has no Meta media id`);
      }

      const caption = stringField(content, 'caption');
      const filename = stringField(content, 'filename');
      const media: Record<string, string> = { id: waMediaId };

      // Meta refuses a caption on audio, and only documents carry a filename.
      if (caption && message.type !== 'audio') {
        media.caption = caption;
      }
      if (filename && message.type === 'document') {
        media.filename = filename;
      }

      return { ...base, type: message.type, [message.type]: media };
    }

    case 'template': {
      const name = stringField(content, 'template_name');
      const language = stringField(content, 'language');

      if (!name || !language) {
        throw new PermanentSendError('Template message needs a template_name and language');
      }

      const components = Array.isArray(content.components) ? content.components : [];

      return {
        ...base,
        type: 'template',
        template: {
          name,
          language: { code: language },
          // A template with no variables, like hello_world, is sent with no
          // components key at all, which is what Meta's own examples do.
          ...(components.length > 0 ? { components } : {}),
        },
      };
    }

    case 'interactive': {
      const interactive = content.interactive;
      if (!interactive || typeof interactive !== 'object') {
        throw new PermanentSendError('Interactive message has no interactive payload');
      }
      // Already Meta's shape, validated by zod on the way in. Passed through.
      return { ...base, type: 'interactive', interactive };
    }

    default:
      throw new PermanentSendError(`Cannot send a ${message.type} message`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
