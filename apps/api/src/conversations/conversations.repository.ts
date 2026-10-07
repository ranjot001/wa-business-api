import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  prisma,
  type Contact,
  type Conversation,
  type ConversationStatus,
  type User,
  type WhatsAppAccount,
} from '@crm/db';
import { ERROR_CODES } from '@crm/shared';
import { WorkspaceScopedRepository } from '../common/repositories/workspace-scoped.repository';

export type ConversationListRow = Conversation & {
  contact: Contact;
  assignee: Pick<User, 'id' | 'name'> | null;
};

export type ConversationDetailRow = ConversationListRow & {
  whatsappAccount: WhatsAppAccount;
};

export interface ConversationFilters {
  status?: ConversationStatus;
  assigned: 'me' | 'unassigned' | 'all';
  userId: string;
  q?: string;
}

/** Postgres unique violation. */
const UNIQUE_VIOLATION = 'P2002';

const LIST_INCLUDE = {
  contact: true,
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.ConversationInclude;

@Injectable()
export class ConversationsRepository extends WorkspaceScopedRepository {
  constructor() {
    super(prisma);
  }

  /**
   * One page, most recent activity first.
   *
   * The cursor is (last_message_at, id) rather than Prisma's own id cursor,
   * because last_message_at is nullable (a conversation opened by an agent has
   * no messages yet) and Prisma's cursor compares against the cursor row's
   * value, which matches nothing when that value is null. Nulls sort last.
   *
   * Exact timestamp equality in the cursor is safe because every write to
   * last_message_at comes from a JS Date (the webhook timestamp or the send
   * time), so nothing stored has finer than millisecond precision.
   */
  async page(
    workspaceId: string,
    filters: ConversationFilters,
    limit: number,
    cursor?: string,
  ): Promise<{ rows: ConversationListRow[]; nextCursor: string | null }> {
    const where: Prisma.ConversationWhereInput[] = [];

    if (filters.status) {
      where.push({ status: filters.status });
    }

    if (filters.assigned === 'me') {
      where.push({ assignedTo: filters.userId });
    } else if (filters.assigned === 'unassigned') {
      where.push({ assignedTo: null });
    }

    const q = filters.q?.trim();
    if (q) {
      const digits = q.replace(/\D/g, '');
      where.push({
        contact: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { profileName: { contains: q, mode: 'insensitive' } },
            ...(digits ? [{ waId: { contains: digits } }] : []),
          ],
        },
      });
    }

    if (cursor) {
      where.push(afterCursor(decodeCursor(cursor)));
    }

    const rows = await this.prisma.conversation.findMany({
      where: this.scope(workspaceId, { AND: where }),
      include: LIST_INCLUDE,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      rows: page,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }

  find(workspaceId: string, id: string): Promise<ConversationDetailRow | null> {
    return this.prisma.conversation.findFirst({
      where: this.scope(workspaceId, { id }),
      include: { ...LIST_INCLUDE, whatsappAccount: true },
    });
  }

  /**
   * The conversation for (contact, account), created if missing and reopened
   * if resolved. One row per pair thanks to the unique index, and a lost
   * insert race reads the winner's row, as in the inbound pipeline.
   */
  async findOrCreateOpen(
    workspaceId: string,
    contactId: string,
    whatsappAccountId: string,
  ): Promise<ConversationDetailRow> {
    const where = {
      workspaceId_contactId_whatsappAccountId: { workspaceId, contactId, whatsappAccountId },
    };

    try {
      await this.prisma.conversation.upsert({
        where,
        create: { workspaceId, contactId, whatsappAccountId, status: 'open' },
        update: {},
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== UNIQUE_VIOLATION
      ) {
        throw error;
      }
    }

    // Reopen in one conditional write, so an open or pending thread is left
    // exactly as it is.
    await this.prisma.conversation.updateMany({
      where: { ...where.workspaceId_contactId_whatsappAccountId, status: 'resolved' },
      data: { status: 'open' },
    });

    return this.prisma.conversation.findUniqueOrThrow({
      where,
      include: { ...LIST_INCLUDE, whatsappAccount: true },
    });
  }

  async markRead(workspaceId: string, id: string): Promise<boolean> {
    const result = await this.prisma.conversation.updateMany({
      where: this.scope(workspaceId, { id }),
      data: { unreadCount: 0 },
    });
    return result.count > 0;
  }

  findContact(workspaceId: string, contactId: string): Promise<Contact | null> {
    return this.prisma.contact.findFirst({ where: this.scope(workspaceId, { id: contactId }) });
  }

  /** The number new conversations are opened on. Task 10 lets the caller choose. */
  findDefaultAccount(workspaceId: string): Promise<WhatsAppAccount | null> {
    return this.prisma.whatsAppAccount.findFirst({
      where: this.scope(workspaceId, { status: 'connected' as const }),
      orderBy: { createdAt: 'asc' },
    });
  }
}

interface ConversationCursor {
  /** last_message_at as ISO, or null for conversations with no messages. */
  t: string | null;
  id: string;
}

function encodeCursor(row: Pick<Conversation, 'lastMessageAt' | 'id'>): string {
  const cursor: ConversationCursor = { t: row.lastMessageAt?.toISOString() ?? null, id: row.id };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(raw: string): ConversationCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;

    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as ConversationCursor).id === 'string' &&
      ((parsed as ConversationCursor).t === null ||
        !Number.isNaN(Date.parse(String((parsed as ConversationCursor).t))))
    ) {
      return parsed as ConversationCursor;
    }
  } catch {
    // fall through to the 400 below
  }

  throw new BadRequestException({ code: ERROR_CODES.BAD_REQUEST, message: 'Invalid cursor' });
}

/** Everything strictly after the cursor in (last_message_at desc nulls last, id desc). */
function afterCursor(cursor: ConversationCursor): Prisma.ConversationWhereInput {
  if (cursor.t === null) {
    return { lastMessageAt: null, id: { lt: cursor.id } };
  }

  const t = new Date(cursor.t);
  return {
    OR: [
      { lastMessageAt: { lt: t } },
      { lastMessageAt: t, id: { lt: cursor.id } },
      { lastMessageAt: null },
    ],
  };
}
