import { describe, expect, it } from 'vitest';
import { MetaApiError } from '@crm/shared';
import { PermanentSendError, classifySendError } from '../src/whatsapp/send-errors';

function metaError(status: number, code?: number): MetaApiError {
  return new MetaApiError(`meta said ${status}`, status, code);
}

describe('classifySendError', () => {
  it('does not retry the 4xx failures the task names', () => {
    // template does not exist, invalid number, re-engagement window closed
    for (const code of [132001, 131026, 131047]) {
      expect(classifySendError(metaError(400, code))).toEqual({
        retry: false,
        code,
        message: 'meta said 400',
      });
    }
  });

  it('does not retry an expired or wrong token', () => {
    expect(classifySendError(metaError(401, 190)).retry).toBe(false);
  });

  it('retries Meta 5xx', () => {
    expect(classifySendError(metaError(500, 1)).retry).toBe(true);
    expect(classifySendError(metaError(503)).retry).toBe(true);
  });

  it('retries a 429, the one 4xx that means not now rather than not this', () => {
    expect(classifySendError(metaError(429, 130429)).retry).toBe(true);
  });

  it('retries network errors', () => {
    const decision = classifySendError(new TypeError('fetch failed'));
    expect(decision).toEqual({ retry: true, code: null, message: 'fetch failed' });
  });

  it('does not retry its own permanent failures', () => {
    expect(classifySendError(new PermanentSendError('Media x is missing'))).toEqual({
      retry: false,
      code: null,
      message: 'Media x is missing',
    });
  });
});
