import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Send and retry over HTTP, with the database, queue and realtime mocked. What
 * is under test is the request contract: the window rule, validation of the
 * union body, and what gets stored and enqueued.
 */
const db = vi.hoisted(() => {
  const prisma = {
    workspaceMember: { findUnique: vi.fn() },
    conversation: { findFirst: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    message: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    media: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  class PrismaClientKnownRequestError extends Error {
    code = '';
  }
  return { prisma, Prisma: { PrismaClientKnownRequestError }, pingDatabase: vi.fn() };
});
vi.mock('@crm/db', () => db);

import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ConversationsRepository } from '../src/conversations/conversations.repository';
import { ConversationsService } from '../src/conversations/conversations.service';
import { MediaRepository } from '../src/media/media.repository';
import { MessageQueueService } from '../src/messages/message-queue.service';
import {
  ConversationMessagesController,
  MessagesController,
} from '../src/messages/messages.controller';
import { MessagesRepository } from '../src/messages/messages.repository';
import { MessagesService } from '../src/messages/messages.service';
import { RealtimeService } from '../src/realtime/realtime.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444';
const MEDIA_ID = '55555555-5555-4555-8555-555555555555';
const HOUR = 60 * 60 * 1000;

const queue = { enqueueSend: vi.fn(async () => undefined) };
const realtime = { publish: vi.fn(async () => undefined) };

function contact(lastInboundAt: Date | null) {
  return {
    id: 'contact-1',
    workspaceId: WORKSPACE_ID,
    waId: '919876543210',
    name: null,
    profileName: 'Ranjot',
    lastInboundAt,
    optedOut: false,
  };
}

function conversation(lastInboundAt: Date | null, accountStatus = 'connected') {
  return {
    id: CONVERSATION_ID,
    workspaceId: WORKSPACE_ID,
    contactId: 'contact-1',
    status: 'open',
    contact: contact(lastInboundAt),
    assignee: null,
    whatsappAccount: { id: 'acct-1', status: accountStatus },
  };
}

function storedMessage(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: MESSAGE_ID,
    workspaceId: WORKSPACE_ID,
    conversationId: CONVERSATION_ID,
    contactId: 'contact-1',
    direction: 'outbound',
    type: 'text',
    content: { text: 'hello' },
    status: 'queued',
    waMessageId: null,
    errorCode: null,
    errorMessage: null,
    sentByUserId: USER_ID,
    replyToMessageId: null,
    waTimestamp: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('messages', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationMessagesController, MessagesController],
      providers: [
        MessagesService,
        MessagesRepository,
        ConversationsService,
        ConversationsRepository,
        MediaRepository,
        RolesGuard,
        { provide: MessageQueueService, useValue: queue },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    // Stands in for JwtAuthGuard, which is not what these tests are about.
    app.use((req: Request & { user?: unknown }, _res: Response, next: NextFunction) => {
      req.user = { id: USER_ID, email: 'agent@example.com', name: 'Agent', avatarUrl: null };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.prisma.workspaceMember.findUnique.mockResolvedValue({
      id: 'member-1',
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      role: 'agent',
      workspace: { id: WORKSPACE_ID, deletedAt: null },
    });
    db.prisma.message.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => storedMessage(data),
    );
  });

  function send(body: unknown) {
    return request(app.getHttpServer())
      .post(`/v1/conversations/${CONVERSATION_ID}/messages`)
      .set('x-workspace-id', WORKSPACE_ID)
      .send(body as object);
  }

  describe('POST /conversations/:id/messages', () => {
    it('refuses text with the window closed: 409 WINDOW_CLOSED with the expiry', async () => {
      const lastInboundAt = new Date(Date.now() - 30 * HOUR);
      db.prisma.conversation.findFirst.mockResolvedValue(conversation(lastInboundAt));

      const res = await send({ type: 'text', text: 'hello' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('WINDOW_CLOSED');
      expect(res.body.error.details).toEqual({
        last_inbound_at: lastInboundAt.toISOString(),
        expires_at: new Date(lastInboundAt.getTime() + 24 * HOUR).toISOString(),
      });
      expect(db.prisma.message.create).not.toHaveBeenCalled();
      expect(queue.enqueueSend).not.toHaveBeenCalled();
    });

    it('refuses text to a contact who never wrote in, with null dates', async () => {
      db.prisma.conversation.findFirst.mockResolvedValue(conversation(null));

      const res = await send({ type: 'text', text: 'hello' });

      expect(res.status).toBe(409);
      expect(res.body.error.details).toEqual({ last_inbound_at: null, expires_at: null });
    });

    it('stores text as queued, moves the preview, enqueues and publishes', async () => {
      db.prisma.conversation.findFirst.mockResolvedValue(conversation(new Date()));

      const res = await send({ type: 'text', text: 'hello' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: MESSAGE_ID,
        direction: 'outbound',
        type: 'text',
        status: 'queued',
        content: { text: 'hello' },
        sent_by_user_id: USER_ID,
      });
      expect(db.prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: CONVERSATION_ID, workspaceId: WORKSPACE_ID },
        data: { lastMessageAt: expect.any(Date), lastMessagePreview: 'hello' },
      });
      expect(queue.enqueueSend).toHaveBeenCalledWith(MESSAGE_ID);
      expect(realtime.publish).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'message.created', workspaceId: WORKSPACE_ID }),
      );
    });

    it('allows a template with the window closed', async () => {
      db.prisma.conversation.findFirst.mockResolvedValue(conversation(null));

      const res = await send({ type: 'template', template_name: 'hello_world', language: 'en_US' });

      expect(res.status).toBe(201);
      expect(db.prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'template',
          content: { template_name: 'hello_world', language: 'en_US', components: [] },
        }),
      });
      expect(queue.enqueueSend).toHaveBeenCalledWith(MESSAGE_ID);
    });

    it('refuses to send on a disconnected number', async () => {
      db.prisma.conversation.findFirst.mockResolvedValue(conversation(new Date(), 'disconnected'));

      const res = await send({ type: 'text', text: 'hello' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('WHATSAPP_NOT_CONNECTED');
    });

    it('404s a conversation in another workspace', async () => {
      db.prisma.conversation.findFirst.mockResolvedValue(null);

      const res = await send({ type: 'text', text: 'hello' });

      expect(res.status).toBe(404);
      expect(db.prisma.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONVERSATION_ID, workspaceId: WORKSPACE_ID },
        }),
      );
    });

    it.each([
      ['an unknown type', { type: 'sticker', media_id: MEDIA_ID }],
      ['text with no text', { type: 'text' }],
      ['text that is only whitespace', { type: 'text', text: '   ' }],
      ['media with a non uuid id', { type: 'image', media_id: 'abc' }],
      ['a caption on audio', { type: 'audio', media_id: MEDIA_ID, caption: 'no' }],
      ['a filename on an image', { type: 'image', media_id: MEDIA_ID, filename: 'a.png' }],
      ['a template with no language', { type: 'template', template_name: 'hello_world' }],
      [
        'four reply buttons',
        {
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Pick' },
            action: {
              buttons: ['a', 'b', 'c', 'd'].map((id) => ({
                type: 'reply',
                reply: { id, title: id },
              })),
            },
          },
        },
      ],
      [
        'a list with 11 rows',
        {
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: 'Pick' },
            action: {
              button: 'Options',
              sections: [
                {
                  rows: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` })),
                },
              ],
            },
          },
        },
      ],
    ])('400s %s', async (_label, body) => {
      db.prisma.conversation.findFirst.mockResolvedValue(conversation(new Date()));

      const res = await send(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.issues.length).toBeGreaterThan(0);
    });

    it('accepts reply buttons and stores them untouched', async () => {
      db.prisma.conversation.findFirst.mockResolvedValue(conversation(new Date()));
      const interactive = {
        type: 'button',
        body: { text: 'Still interested?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'yes', title: 'Yes' } },
            { type: 'reply', reply: { id: 'no', title: 'No' } },
          ],
        },
      };

      const res = await send({ type: 'interactive', interactive });

      expect(res.status).toBe(201);
      expect(db.prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'interactive', content: { interactive } }),
      });
    });

    it('refuses media whose file type does not fit the message type', async () => {
      db.prisma.conversation.findFirst.mockResolvedValue(conversation(new Date()));
      db.prisma.media.findFirst.mockResolvedValue({
        id: MEDIA_ID,
        status: 'ready',
        storageKey: 'k',
        mimeType: 'application/pdf',
      });

      const res = await send({ type: 'image', media_id: MEDIA_ID });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('application/pdf');
    });

    it('sends uploaded media of the right type', async () => {
      db.prisma.conversation.findFirst.mockResolvedValue(conversation(new Date()));
      db.prisma.media.findFirst.mockResolvedValue({
        id: MEDIA_ID,
        status: 'ready',
        storageKey: 'k',
        mimeType: 'image/jpeg',
      });

      const res = await send({ type: 'image', media_id: MEDIA_ID, caption: 'Invoice' });

      expect(res.status).toBe(201);
      expect(db.prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: { media_id: MEDIA_ID, caption: 'Invoice', filename: null },
        }),
      });
    });

    it('marks the message failed and answers 503 when the queue is down', async () => {
      db.prisma.conversation.findFirst.mockResolvedValue(conversation(new Date()));
      queue.enqueueSend.mockRejectedValueOnce(new Error('redis down'));

      const res = await send({ type: 'text', text: 'hello' });

      expect(res.status).toBe(503);
      expect(res.body.error.details).toEqual({ message_id: MESSAGE_ID });
      expect(db.prisma.message.update).toHaveBeenCalledWith({
        where: { id: MESSAGE_ID },
        data: { status: 'failed', errorMessage: 'Could not queue the message for sending' },
      });
    });
  });

  describe('POST /messages/:id/retry', () => {
    function retry() {
      return request(app.getHttpServer())
        .post(`/v1/messages/${MESSAGE_ID}/retry`)
        .set('x-workspace-id', WORKSPACE_ID);
    }

    it('refuses a message that has not failed', async () => {
      db.prisma.message.findFirst.mockResolvedValue({
        ...storedMessage({ status: 'sent' }),
        contact: contact(new Date()),
      });

      const res = await retry();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('MESSAGE_NOT_RETRYABLE');
      expect(queue.enqueueSend).not.toHaveBeenCalled();
    });

    it('refuses an inbound message', async () => {
      db.prisma.message.findFirst.mockResolvedValue({
        ...storedMessage({ direction: 'inbound', status: 'failed' }),
        contact: contact(new Date()),
      });

      expect((await retry()).status).toBe(409);
    });

    it('requeues a failed message, clearing the old error and Meta id', async () => {
      db.prisma.message.findFirst
        .mockResolvedValueOnce({
          ...storedMessage({ status: 'failed', errorCode: 131026, waMessageId: 'wamid.OLD' }),
          contact: contact(new Date()),
        })
        .mockResolvedValueOnce({
          ...storedMessage({ status: 'queued' }),
          contact: contact(new Date()),
        });

      const res = await retry();

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('queued');
      expect(db.prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          id: MESSAGE_ID,
          workspaceId: WORKSPACE_ID,
          direction: 'outbound',
          status: 'failed',
        },
        data: { status: 'queued', errorCode: null, errorMessage: null, waMessageId: null },
      });
      expect(queue.enqueueSend).toHaveBeenCalledWith(MESSAGE_ID);
    });

    it('applies the window rule to a retried text', async () => {
      db.prisma.message.findFirst.mockResolvedValue({
        ...storedMessage({ status: 'failed' }),
        contact: contact(new Date(Date.now() - 25 * HOUR)),
      });

      const res = await retry();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('WINDOW_CLOSED');
    });

    it('loses the race cleanly when another retry got there first', async () => {
      db.prisma.message.findFirst.mockResolvedValue({
        ...storedMessage({ status: 'failed' }),
        contact: contact(new Date()),
      });
      db.prisma.message.updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await retry();

      expect(res.status).toBe(409);
      expect(queue.enqueueSend).not.toHaveBeenCalled();
    });
  });
});
