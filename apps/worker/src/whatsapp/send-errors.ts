import { MetaApiError } from '@crm/shared';

/**
 * Retry classification for message.send. Ranjot reviews this.
 *
 * The question for every error is whether sending the same thing again could
 * succeed. Retrying a send that cannot succeed wastes the attempts and delays
 * the failed tick the agent is waiting for; not retrying a transient failure
 * drops a message.
 *
 *   retry     Meta 5xx           Meta's own outage
 *             Meta 429           throttled; the same request succeeds later
 *             network errors     fetch threw before any response: DNS, reset,
 *                                timeout. Meta never saw it, or never answered
 *             anything else      a database or R2 hiccup on our side
 *
 *   no retry  Meta other 4xx     bad template, invalid number, window closed
 *                                (131047), bad token. The request is wrong,
 *                                and resending it is wrong again
 *             PermanentSendError our own checks: missing media, an
 *                                unsendable type, R2 not configured
 *
 * The task says "do not retry on 4xx". 429 is the one 4xx that is retried,
 * because it means "not now" rather than "not this", and MetaApiError.isRetryable
 * already treats it that way for media downloads.
 */

/** A failure the worker detected itself that no retry can fix. */
export class PermanentSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentSendError';
  }
}

export interface SendErrorDecision {
  retry: boolean;
  /** Meta's error code when there is one, stored on messages.error_code. */
  code: number | null;
  message: string;
}

export function classifySendError(error: unknown): SendErrorDecision {
  if (error instanceof PermanentSendError) {
    return { retry: false, code: null, message: error.message };
  }

  if (error instanceof MetaApiError) {
    return { retry: error.isRetryable, code: error.code ?? null, message: error.message };
  }

  return {
    retry: true,
    code: null,
    message: error instanceof Error ? error.message : String(error),
  };
}
