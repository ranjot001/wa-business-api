import { describe, expect, it, vi } from 'vitest';
import { MetaApiError, MetaClient } from '@crm/shared';

const ACCOUNT = { phoneNumberId: '106540352242922' };

function client(fetchImpl: typeof fetch): MetaClient {
  return new MetaClient({ accessToken: 'token-123', version: 'v20.0', fetchImpl });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-fb-request-id': 'req-1' },
  });
}

describe('MetaClient.sendMessage', () => {
  it('posts to the phone number and returns Meta message id', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: '919876543210', wa_id: '919876543210' }],
        messages: [{ id: 'wamid.ABC' }],
      }),
    );

    const result = await client(fetchImpl as unknown as typeof fetch).sendMessage(ACCOUNT, {
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'text',
      text: { body: 'hi' },
    });

    expect(result.waMessageId).toBe('wamid.ABC');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v20.0/106540352242922/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-123');
  });

  it('throws a typed error carrying code, subcode, trace id and the detail text', async () => {
    const fetchImpl = vi.fn(async () =>
      json(400, {
        error: {
          message: '(#100) Invalid parameter',
          type: 'OAuthException',
          code: 100,
          error_subcode: 2494010,
          fbtrace_id: 'trace-9',
          error_data: { details: 'Recipient phone number not valid' },
        },
      }),
    );

    const error = await client(fetchImpl as unknown as typeof fetch)
      .sendMessage(ACCOUNT, { messaging_product: 'whatsapp', to: '1', type: 'text' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetaApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 100,
      subcode: 2494010,
      fbtraceId: 'trace-9',
      requestId: 'req-1',
      message: '(#100) Invalid parameter: Recipient phone number not valid',
      isRetryable: false,
    });
  });

  it('treats a 200 without a message id as a failure', async () => {
    const fetchImpl = vi.fn(async () => json(200, { messages: [] }));

    await expect(
      client(fetchImpl as unknown as typeof fetch).sendMessage(ACCOUNT, {
        messaging_product: 'whatsapp',
        to: '1',
        type: 'text',
      }),
    ).rejects.toBeInstanceOf(MetaApiError);
  });
});

describe('MetaClient.uploadMedia', () => {
  it('sends multipart with messaging_product, type and the file, and returns the id', async () => {
    const fetchImpl = vi.fn(async () => json(200, { id: 'media-77' }));

    const result = await client(fetchImpl as unknown as typeof fetch).uploadMedia(
      ACCOUNT,
      Buffer.from('fake png'),
      'image/png',
      'photo.png',
    );

    expect(result).toEqual({ id: 'media-77' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v20.0/106540352242922/media');

    const form = init.body as FormData;
    expect(form.get('messaging_product')).toBe('whatsapp');
    expect(form.get('type')).toBe('image/png');
    const file = form.get('file') as File;
    expect(file.name).toBe('photo.png');
    expect(file.type).toBe('image/png');

    // fetch must set the multipart boundary itself.
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });
});
