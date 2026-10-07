/**
 * One line for the conversation list. Shared because inbound (worker) and
 * outbound (api) messages both write conversations.last_message_preview.
 *
 * Collapses whitespace and caps the length. The ellipsis counts towards the
 * limit, so the result is never longer than `limit` and a column sized for it
 * cannot overflow.
 */
const ELLIPSIS = '...';

export function toPreview(text: string, limit = 120): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();

  if (collapsed.length <= limit) {
    return collapsed;
  }

  return `${collapsed.slice(0, limit - ELLIPSIS.length)}${ELLIPSIS}`;
}
