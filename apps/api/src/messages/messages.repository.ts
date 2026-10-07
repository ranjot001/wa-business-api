import { Injectable } from '@nestjs/common';
import { Prisma, prisma, type Contact, type Message, type MessageType } from '@crm/db';
import { WorkspaceScopedRepository } from '../common/repositories/workspace-scoped.repository';

export type MessageWithContact = Message & { contact: Contact };

@Injectable()
export class MessagesRepository extends WorkspaceScopedRepository {
  constructor() {
    super(prisma);
  }

  /**
   * Newest first. Prisma's id cursor is correct here, unlike for
   * conversations: created_at is never null, and Prisma compares against the
   * cursor row's stored value inside Postgres, so the microsecond precision of
   * the column default is kept rather than truncated to a JS Date.
   */
  async page(
    workspaceId: string,
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ rows: Message[]; nextCursor: string | null }> {
    const rows = await this.prisma.message.findMany({
      where: this.scope(workspaceId, { conversationId }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return { rows: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  find(workspaceId: string, id: string): Promise<MessageWithContact | null> {
    return this.prisma.message.findFirst({
      where: this.scope(workspaceId, { id }),
      include: { contact: true },
    });
  }

  /**
   * Insert the queued message and move the conversation's summary in one
   * transaction, so the inbox never shows a preview for a message that does
   * not exist or a message missing from its preview.
   */
  async createOutbound(input: {
    workspaceId: string;
    conversationId: string;
    contactId: string;
    sentByUserId: string;
    type: MessageType;
    content: Record<string, unknown>;
    preview: string;
  }): Promise<Message> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          contactId: input.contactId,
          direction: 'outbound',
          type: input.type,
          content: input.content as Prisma.InputJsonValue,
          status: 'queued',
          sentByUserId: input.sentByUserId,
        },
      });

      await tx.conversation.updateMany({
        where: this.scope(input.workspaceId, { id: input.conversationId }),
        data: { lastMessageAt: now, lastMessagePreview: input.preview },
      });

      return message;
    });
  }

  /**
   * failed -> queued, only if it is still failed. Clears the previous attempt's
   * Meta id too, so a late status webhook for that attempt finds nothing to
   * update. Returns false when another request got there first.
   */
  async requeueFailed(workspaceId: string, id: string): Promise<boolean> {
    const result = await this.prisma.message.updateMany({
      where: this.scope(workspaceId, { id, direction: 'outbound' as const, status: 'failed' as const }),
      data: { status: 'queued', errorCode: null, errorMessage: null, waMessageId: null },
    });
    return result.count > 0;
  }

  async markFailed(id: string, errorMessage: string): Promise<Message> {
    return this.prisma.message.update({
      where: { id },
      data: { status: 'failed', errorMessage },
    });
  }
}
