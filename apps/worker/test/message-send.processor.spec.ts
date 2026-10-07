import { randomBytes } from 'node:crypto';
import { UnrecoverableError, type Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encrypt, type MessageSendJobData } from '@crm/shared';

const db = vi.hoisted(() => {
  const prisma = {
    message: { findUnique: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    contact: { update: vi.fn(async () => ({})) },
    media: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma };
});
vi.mock('@crm/db', () => db);

import { createMessageSendProcessor } from '../src/queues/message-send.processor';
import type { Env } from '../src/env';
import type { Logger } from '../src/logger';

const KEY = randomBytes(32);
const MESSAGE_ID = 'msg-1';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

const realtime = { publish: vi.fn(async () => undefined) };
const storage = {
  configured: true,
  put: vi.fn(),
  get: vi.fn(async () => Buffer.from('png bytes')),
};

const env = {
  ENCRYPTION_KEY: KEY.toString('base64'),
  META_GRAPH_VERSION: 'v20.0',
} as Env;

function queuedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MESSAGE_ID,
    workspaceId: 'ws-1',
    conversationId: 'conv-1',
    contactId: 'contact-1',
    direction: 'outbound',
    status: 'queued',
    type: 'text',
    content: { text: 'hello' },
    contact: { id: 'contact-1', waId: '919876543210' },
    conversation: {
      whatsappAccount: {
        id: 'acct-1',
        phoneNumberId: '106540352242922',
        accessTokenEnc: encrypt('meta-token', KEY),
      },
    },
    ...overrides,
  };
}

function job(attemptsMade = 0): Job<MessageSendJobData> {
  return {
    data: { messageId: MESSAGE_ID },
    attemptsMade,
    opts: { attempts: 4 },
  } as unknown as Job<MessageSendJobData>;
}

function metaResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

describe('message.send processor', () => {
  const process = createMessageSendProcessor({ logger, realtime, storage, env });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends, stores the Meta id as sent, stamps last_outbound_at and publishes', async () => {
    db.prisma.message.findUnique.mockResolvedValue(queuedMessage());
    fetchMock.mockResolvedValue(metaResponse(200, { messages: [{ id: 'wamid.OK' }] }));

    await expect(process(job())).resolves.toEqual({ sent: true });

    expect(db.prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: MESSAGE_ID, status: 'queued' },
      data: expect.objectContaining({ status: 'sent', waMessageId: 'wamid.OK' }),
    });
    expect(db.prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { lastOutboundAt: expect.any(Date) },
    });
    expect(realtime.publish).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        event: 'message.status',
        data: expect.objectContaining({ status: 'sent' }),
      }),
    );
  });

  it('marks an invalid number failed with Meta code and does not retry', async () => {
    db.prisma.message.findUnique.mockResolvedValue(queuedMessage());
    fetchMock.mockResolvedValue(
      metaResponse(400, {
        error: { message: '(#131026) Message undeliverable', code: 131026, fbtrace_id: 't' },
      }),
    );

    // UnrecoverableError is how BullMQ is told to skip the remaining attempts.
    await expect(process(job())).rejects.toBeInstanceOf(UnrecoverableError);

    expect(db.prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: MESSAGE_ID, status: 'queued' },
      data: {
        status: 'failed',
        errorCode: 131026,
        errorMessage: '(#131026) Message undeliverable',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the row queued and rethrows a 5xx while attempts remain', async () => {
    db.prisma.message.findUnique.mockResolvedValue(queuedMessage());
    fetchMock.mockResolvedValue(metaResponse(500, { error: { message: 'boom', code: 1 } }));

    const error = await process(job(0)).catch((caught: unknown) => caught);

    expect(error).not.toBeInstanceOf(UnrecoverableError);
    expect(db.prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('marks failed on the last attempt of a retryable error', async () => {
    db.prisma.message.findUnique.mockResolvedValue(queuedMessage());
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(process(job(3))).rejects.toThrow('fetch failed');

    expect(db.prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: MESSAGE_ID, status: 'queued' },
      data: { status: 'failed', errorCode: null, errorMessage: 'fetch failed' },
    });
  });

  it('does nothing for a message that is no longer queued, so a retry never resends', async () => {
    db.prisma.message.findUnique.mockResolvedValue(queuedMessage({ status: 'sent' }));

    await expect(process(job())).resolves.toEqual({ sent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry when Meta accepted but recording the send failed', async () => {
    db.prisma.message.findUnique.mockResolvedValue(queuedMessage());
    fetchMock.mockResolvedValue(metaResponse(200, { messages: [{ id: 'wamid.OK' }] }));
    db.prisma.$transaction.mockRejectedValueOnce(new Error('db down'));

    await expect(process(job())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  describe('media', () => {
    const imageMessage = () =>
      queuedMessage({
        type: 'image',
        content: { media_id: 'media-1', caption: 'hi', filename: null },
      });

    it('uploads from R2 on first send and caches the Meta media id', async () => {
      db.prisma.message.findUnique.mockResolvedValue(imageMessage());
      db.prisma.media.findFirst.mockResolvedValue({
        id: 'media-1',
        status: 'ready',
        storageKey: 'ws/ws-1/media/media-1',
        mimeType: 'image/png',
        waMediaId: null,
        updatedAt: new Date(),
      });
      fetchMock
        .mockResolvedValueOnce(metaResponse(200, { id: 'meta-media-9' }))
        .mockResolvedValueOnce(metaResponse(200, { messages: [{ id: 'wamid.IMG' }] }));

      await expect(process(job())).resolves.toEqual({ sent: true });

      expect(storage.get).toHaveBeenCalledWith('ws/ws-1/media/media-1');
      expect(db.prisma.media.update).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { waMediaId: 'meta-media-9' },
      });

      const sendBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<
        string,
        unknown
      >;
      expect(sendBody.image).toEqual({ id: 'meta-media-9', caption: 'hi' });
    });

    it('reuses a cached Meta media id without uploading', async () => {
      db.prisma.message.findUnique.mockResolvedValue(imageMessage());
      db.prisma.media.findFirst.mockResolvedValue({
        id: 'media-1',
        status: 'ready',
        storageKey: 'ws/ws-1/media/media-1',
        mimeType: 'image/png',
        waMediaId: 'meta-media-cached',
        updatedAt: new Date(),
      });
      fetchMock.mockResolvedValueOnce(metaResponse(200, { messages: [{ id: 'wamid.IMG' }] }));

      await process(job());

      expect(storage.get).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fails without retry when the media row is gone', async () => {
      db.prisma.message.findUnique.mockResolvedValue(imageMessage());
      db.prisma.media.findFirst.mockResolvedValue(null);

      await expect(process(job())).rejects.toBeInstanceOf(UnrecoverableError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
