/**
 * Inbound webhook payloads, shaped as Meta actually sends them.
 *
 * Taken from the Cloud API payload examples and from real deliveries, with ids
 * and numbers replaced. Kept as whole envelopes rather than bare message
 * objects so the same fixtures exercise the mapper and, later, the processor.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */
import type { WaMessage, WaWebhookBody } from '@crm/shared';

export const PHONE_NUMBER_ID = '106540352242922';
export const DISPLAY_PHONE = '15550100000';
export const CONTACT_WA_ID = '919876543210';

/** Wraps one message object in the envelope Meta delivers. */
export function envelope(message: WaMessage, profileName = 'Ranjot'): WaWebhookBody {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '102290129340398',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: DISPLAY_PHONE,
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [{ profile: { name: profileName }, wa_id: CONTACT_WA_ID }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

export const textMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUM0E0QkVFMUQ4NDVGN0EyQjhGMTMA',
  timestamp: '1759104000',
  type: 'text',
  text: { body: 'Hello, is this still available?' },
};

export const imageMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUNEE1Q0ZGMkU5NTZGOEIzQzlGMjQA',
  timestamp: '1759104060',
  type: 'image',
  image: {
    id: '1089374652819374',
    mime_type: 'image/jpeg',
    sha256: 'kEZ0kPFvBXyPBxQaXJxJ7xQe9zH3jJ1mN2oP3qR4sT0=',
    caption: 'Here is the photo',
  },
};

export const documentMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUNUI2REZGM0ZBNjdHOUM0RDBHMzUA',
  timestamp: '1759104120',
  type: 'document',
  document: {
    id: '2198465738291046',
    mime_type: 'application/pdf',
    sha256: 'mFA1lQGwCYzQCyRbYKyK8yRf0aI4kK2nO3pQ4rS5tU1=',
    filename: 'invoice-2026-09.pdf',
  },
};

export const audioMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUNkM3RUdHNEdCNzhIMEQ1RTFINDYA',
  timestamp: '1759104180',
  type: 'audio',
  audio: { id: '3207576849302157', mime_type: 'audio/ogg; codecs=opus' },
};

export const videoMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUN0Q4RkhINUhDODlJMUU2RjJJNTcA',
  timestamp: '1759104240',
  type: 'video',
  video: { id: '4318687950413268', mime_type: 'video/mp4', caption: 'Short clip' },
};

export const stickerMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUOEU5R0lJNklEOTBKMkY3RzNKNjgA',
  timestamp: '1759104300',
  type: 'sticker',
  sticker: { id: '5429798061524379', mime_type: 'image/webp', animated: false },
};

export const locationMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUOUYwSEpKN0pFMDFLM0c4SDRLNzkA',
  timestamp: '1759104360',
  type: 'location',
  location: {
    latitude: 28.6139,
    longitude: 77.209,
    name: 'Connaught Place',
    address: 'New Delhi, India',
  },
};

export const contactsMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUMEcxSUtLOEtGMTJMNEg5STVMODAA',
  timestamp: '1759104420',
  type: 'contacts',
  contacts: [
    {
      name: { first_name: 'Asha', formatted_name: 'Asha Verma' },
      phones: [{ phone: '+91 98765 11111', type: 'CELL', wa_id: '919876511111' }],
    },
  ],
};

export const reactionMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUMUgySUxMOUxHMjNNNUkwSjZNOTEA',
  timestamp: '1759104480',
  type: 'reaction',
  reaction: { message_id: textMessage.id, emoji: '👍' },
};

/** Removing a reaction arrives as a reaction with no emoji. */
export const reactionRemovedMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUMkkzSk1NME1IMzRONkoxSzdOMDIA',
  timestamp: '1759104540',
  type: 'reaction',
  reaction: { message_id: textMessage.id },
};

export const buttonMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUM0o0S05OMU5JNDVPN0syTDhPMTMA',
  timestamp: '1759104600',
  type: 'button',
  button: { payload: 'STOP_PROMOTIONS', text: 'Stop promotions' },
  context: { from: DISPLAY_PHONE, id: 'wamid.outbound.template.1' },
};

export const interactiveButtonReply: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUNEs1TE9PMk9KNTZQOEwzTTlQMjQA',
  timestamp: '1759104660',
  type: 'interactive',
  interactive: {
    type: 'button_reply',
    button_reply: { id: 'track-order', title: 'Track my order' },
  },
};

export const interactiveListReply: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUNUw2TVBQM1BLNjdROU00TjBRMzUA',
  timestamp: '1759104720',
  type: 'interactive',
  interactive: {
    type: 'list_reply',
    list_reply: { id: 'plan-pro', title: 'Pro plan', description: '5000 messages a month' },
  },
};

/** A type the Cloud API cannot represent. Meta sends this shape itself. */
export const unsupportedMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUNk03TlFRNFFMNzhSME41TzFSNDYA',
  timestamp: '1759104780',
  type: 'unsupported',
  errors: [{ code: 131051, title: 'Message type is not currently supported' }],
};

/** A reply to one of our outbound messages. */
export const replyMessage: WaMessage = {
  from: CONTACT_WA_ID,
  id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAEhgUN044T1JSNVJNODlTMU82UDJTNTcA',
  timestamp: '1759104840',
  type: 'text',
  text: { body: 'Yes please' },
  context: { from: DISPLAY_PHONE, id: 'wamid.outbound.1' },
};

/** Delivery status callbacks, which arrive on the same "messages" field. */
export function statusEnvelope(
  waMessageId: string,
  status: string,
  errors?: { code: number; title: string; message?: string }[],
): WaWebhookBody {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '102290129340398',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: DISPLAY_PHONE,
                phone_number_id: PHONE_NUMBER_ID,
              },
              statuses: [
                {
                  id: waMessageId,
                  status,
                  timestamp: '1759104900',
                  recipient_id: CONTACT_WA_ID,
                  conversation: { id: 'conv-1', origin: { type: 'service' } },
                  ...(errors ? { errors } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/** A field this task stores but does not act on. */
export const templateStatusEnvelope: WaWebhookBody = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '102290129340398',
      changes: [
        {
          field: 'message_template_status_update',
          value: {
            event: 'APPROVED',
            message_template_id: 1234567890,
            message_template_name: 'order_update',
            message_template_language: 'en_US',
          },
        },
      ],
    },
  ],
};
