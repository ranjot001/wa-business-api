/**
 * Types for the inbound WhatsApp Cloud API webhook payload.
 *
 * These mirror what Meta actually sends, which is looser than their docs
 * suggest: almost everything is optional, because the same envelope carries
 * messages, status updates, template approvals and account notices. Nothing
 * here is trusted; the mapper narrows it before any of it reaches the database.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */

export interface WaProfile {
  name?: string;
}

export interface WaContact {
  profile?: WaProfile;
  wa_id?: string;
}

export interface WaTextBody {
  body?: string;
}

export interface WaMediaObject {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  /** Stickers only. */
  animated?: boolean;
}

export interface WaLocation {
  latitude?: number;
  longitude?: number;
  name?: string;
  address?: string;
}

export interface WaReaction {
  message_id?: string;
  emoji?: string;
}

export interface WaButton {
  payload?: string;
  text?: string;
}

export interface WaInteractive {
  type?: string;
  button_reply?: { id?: string; title?: string };
  list_reply?: { id?: string; title?: string; description?: string };
}

export interface WaContext {
  from?: string;
  id?: string;
}

export interface WaError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

export interface WaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: WaTextBody;
  image?: WaMediaObject;
  video?: WaMediaObject;
  audio?: WaMediaObject;
  document?: WaMediaObject;
  sticker?: WaMediaObject;
  location?: WaLocation;
  contacts?: unknown[];
  reaction?: WaReaction;
  button?: WaButton;
  interactive?: WaInteractive;
  context?: WaContext;
  errors?: WaError[];
}

export interface WaStatusConversation {
  id?: string;
  origin?: { type?: string };
}

export interface WaStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  conversation?: WaStatusConversation;
  pricing?: { billable?: boolean; category?: string };
  errors?: WaError[];
}

export interface WaMetadata {
  display_phone_number?: string;
  phone_number_id?: string;
}

export interface WaValue {
  messaging_product?: string;
  metadata?: WaMetadata;
  contacts?: WaContact[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
  errors?: WaError[];
  /** Present on message_template_status_update and friends. */
  [key: string]: unknown;
}

export interface WaChange {
  field?: string;
  value?: WaValue;
}

export interface WaEntry {
  id?: string;
  changes?: WaChange[];
}

export interface WaWebhookBody {
  object?: string;
  entry?: WaEntry[];
}

/** Webhook `field` values this product reacts to. */
export const WA_WEBHOOK_FIELDS = {
  MESSAGES: 'messages',
  TEMPLATE_STATUS: 'message_template_status_update',
  PHONE_QUALITY: 'phone_number_quality_update',
  ACCOUNT_UPDATE: 'account_update',
} as const;

/**
 * Delivery status ladder.
 *
 * Meta does not promise ordered webhook delivery, so a "delivered" callback can
 * arrive after the "read" one for the same message. Comparing ranks lets the
 * worker apply only forward transitions. `failed` is terminal and sits at the
 * top so a failure is never overwritten by a late success.
 */
export const MESSAGE_STATUS_RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export function statusOutranks(next: string, current: string): boolean {
  const nextRank = MESSAGE_STATUS_RANK[next];
  const currentRank = MESSAGE_STATUS_RANK[current];

  if (nextRank === undefined || currentRank === undefined) {
    return false;
  }

  return nextRank > currentRank;
}
