/**
 * WhatsApp's customer service window.
 *
 * A business may send free form messages (text, media, interactive) only
 * within 24 hours of the contact's last inbound message. Outside it, only an
 * approved template is allowed, and Meta rejects anything else with 131047.
 * Checking here first turns that late asynchronous failure into an immediate
 * 409 WINDOW_CLOSED the agent can act on.
 */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface WindowContact {
  lastInboundAt: Date | null;
}

/** When the window closes, or null when the contact has never written in. */
export function windowExpiresAt(contact: WindowContact): Date | null {
  return contact.lastInboundAt ? new Date(contact.lastInboundAt.getTime() + WINDOW_MS) : null;
}

/** last_inbound_at != null && now - last_inbound_at < 24h */
export function isWindowOpen(contact: WindowContact, now: Date = new Date()): boolean {
  if (!contact.lastInboundAt) {
    return false;
  }

  return now.getTime() - contact.lastInboundAt.getTime() < WINDOW_MS;
}
