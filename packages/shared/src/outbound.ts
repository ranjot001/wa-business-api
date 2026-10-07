import { z } from 'zod';
import { toPreview } from './preview';

/**
 * Body of POST /v1/conversations/:id/messages, a discriminated union on type.
 *
 * zod rather than class-validator because a union of shapes keyed on one field
 * is what zod does natively and class-validator does not, and because the
 * interactive payload is Meta's own nested shape passed through as is. The
 * limits below are Meta's; checking them here turns a send that would fail
 * asynchronously in the worker into a 400 the agent sees immediately.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-list-messages
 */

const textMessage = z.object({
  type: z.literal('text'),
  text: z.string().trim().min(1).max(4096),
});

const mediaMessage = z.object({
  type: z.enum(['image', 'video', 'audio', 'document']),
  /** Our media id, as returned by POST /v1/media/upload. Not Meta's. */
  media_id: z.string().uuid(),
  caption: z.string().max(1024).optional(),
  filename: z.string().min(1).max(240).optional(),
});

const templateMessage = z.object({
  type: z.literal('template'),
  template_name: z.string().min(1).max(512),
  /** Locale code exactly as the template was approved, e.g. en_US. */
  language: z.string().min(2).max(15),
  /**
   * Header, body and button parameters in Meta's shape. Passed through
   * untouched; task 08 checks them against the stored template.
   */
  components: z.array(z.record(z.unknown())).default([]),
});

const interactiveText = z.object({ text: z.string().min(1).max(1024) });

const interactiveHeader = z.union([
  z.object({ type: z.literal('text'), text: z.string().min(1).max(60) }),
  z
    .object({
      type: z.enum(['image', 'video', 'document']),
      image: z.record(z.unknown()).optional(),
      video: z.record(z.unknown()).optional(),
      document: z.record(z.unknown()).optional(),
    })
    .refine((header) => header[header.type] !== undefined, {
      message: 'a media header needs an object named after its type',
    }),
]);

const interactiveFooter = z.object({ text: z.string().min(1).max(60) });

const replyButtons = z.object({
  type: z.literal('button'),
  header: interactiveHeader.optional(),
  body: interactiveText,
  footer: interactiveFooter.optional(),
  action: z.object({
    buttons: z
      .array(
        z.object({
          type: z.literal('reply'),
          reply: z.object({
            id: z.string().min(1).max(256),
            title: z.string().min(1).max(20),
          }),
        }),
      )
      .min(1)
      .max(3),
  }),
});

const listMessage = z.object({
  type: z.literal('list'),
  // Lists only take a text header.
  header: z.object({ type: z.literal('text'), text: z.string().min(1).max(60) }).optional(),
  body: interactiveText,
  footer: interactiveFooter.optional(),
  action: z
    .object({
      button: z.string().min(1).max(20),
      sections: z
        .array(
          z.object({
            title: z.string().min(1).max(24).optional(),
            rows: z
              .array(
                z.object({
                  id: z.string().min(1).max(200),
                  title: z.string().min(1).max(24),
                  description: z.string().max(72).optional(),
                }),
              )
              .min(1),
          }),
        )
        .min(1)
        .max(10),
    })
    .refine((action) => action.sections.reduce((n, s) => n + s.rows.length, 0) <= 10, {
      message: 'a list can have at most 10 rows across all sections',
      path: ['sections'],
    })
    .refine((action) => action.sections.length === 1 || action.sections.every((s) => s.title), {
      message: 'every section needs a title when there is more than one',
      path: ['sections'],
    }),
});

const interactiveMessage = z.object({
  type: z.literal('interactive'),
  interactive: z.discriminatedUnion('type', [replyButtons, listMessage]),
});

export const sendMessageSchema = z
  .discriminatedUnion('type', [textMessage, mediaMessage, templateMessage, interactiveMessage])
  // Meta rejects a caption on audio and ignores a filename on anything but a
  // document, so both are refused here instead of silently dropped. Checked
  // after the union, because a refined branch cannot be a union member.
  .superRefine((value, ctx) => {
    if (value.type === 'audio' && value.caption !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caption'],
        message: 'audio messages cannot have a caption',
      });
    }
    if (
      (value.type === 'image' || value.type === 'video' || value.type === 'audio') &&
      value.filename !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['filename'],
        message: 'filename is only allowed on documents',
      });
    }
  });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type SendMediaMessageInput = z.infer<typeof mediaMessage>;
export type InteractivePayload = z.infer<typeof interactiveMessage>['interactive'];

export const OUTBOUND_MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const;
export type OutboundMediaType = (typeof OUTBOUND_MEDIA_TYPES)[number];

export function isOutboundMedia(input: SendMessageInput): input is SendMediaMessageInput {
  return (OUTBOUND_MEDIA_TYPES as readonly string[]).includes(input.type);
}

/**
 * What an outbound message stores in messages.content, by type:
 *
 *   text         { text }
 *   media        { media_id, caption, filename }   media_id is our media row id
 *   template     { template_name, language, components }
 *   interactive  { interactive }                   Meta's shape, unchanged
 *
 * The worker builds the Meta payload from this, so it is everything a send or a
 * retry needs and nothing derived.
 */
export function toOutboundContent(input: SendMessageInput): Record<string, unknown> {
  switch (input.type) {
    case 'text':
      return { text: input.text };
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return {
        media_id: input.media_id,
        caption: input.caption ?? null,
        filename: input.filename ?? null,
      };
    case 'template':
      return {
        template_name: input.template_name,
        language: input.language,
        components: input.components,
      };
    case 'interactive':
      return { interactive: input.interactive };
  }
}

export function outboundPreview(input: SendMessageInput): string {
  switch (input.type) {
    case 'text':
      return toPreview(input.text);
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return toPreview(input.caption ?? input.filename ?? `[${input.type}]`);
    case 'template':
      return toPreview(`[template] ${input.template_name}`);
    case 'interactive':
      return toPreview(input.interactive.body.text);
  }
}

/**
 * The Meta /messages request body. Loose on purpose past the envelope: the
 * builder in the worker produces it from validated content, and Meta is the
 * final judge of the inner shape.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
export interface MetaSendPayload {
  messaging_product: 'whatsapp';
  recipient_type?: 'individual';
  to: string;
  type: string;
  [key: string]: unknown;
}

export interface MetaSendResponse {
  messaging_product?: string;
  contacts?: { input?: string; wa_id?: string }[];
  messages?: { id?: string; message_status?: string }[];
}
