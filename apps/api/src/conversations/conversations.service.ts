import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ERROR_CODES, type Paginated } from '@crm/shared';
import {
  ConversationsRepository,
  type ConversationDetailRow,
  type ConversationListRow,
} from './conversations.repository';
import type { ListConversationsQueryDto } from './dto/conversation.dto';
import { windowExpiresAt } from './window';

export interface ConversationView {
  id: string;
  status: string;
  assigned_to: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
  contact: { id: string; name: string | null; profile_name: string | null; wa_id: string };
  assignee: { id: string; name: string } | null;
}

export interface ConversationDetailView extends ConversationView {
  contact: ConversationView['contact'] & {
    last_inbound_at: string | null;
    opted_out: boolean;
  };
  account: {
    id: string;
    phone_number_id: string;
    display_phone: string;
    verified_name: string | null;
    status: string;
  };
  /** When the 24 hour window closes, for the UI countdown. Null if never opened. */
  window_expires_at: string | null;
}

const DEFAULT_LIMIT = 25;

@Injectable()
export class ConversationsService {
  constructor(private readonly conversations: ConversationsRepository) {}

  async list(
    workspaceId: string,
    userId: string,
    query: ListConversationsQueryDto,
  ): Promise<Paginated<ConversationView>> {
    const { rows, nextCursor } = await this.conversations.page(
      workspaceId,
      { status: query.status, assigned: query.assigned ?? 'all', userId, q: query.q },
      query.limit ?? DEFAULT_LIMIT,
      query.cursor,
    );

    return { data: rows.map(toView), next_cursor: nextCursor };
  }

  async get(workspaceId: string, id: string): Promise<ConversationDetailView> {
    return toDetailView(await this.require(workspaceId, id));
  }

  /** Loads a conversation in this workspace or answers 404. */
  async require(workspaceId: string, id: string): Promise<ConversationDetailRow> {
    const conversation = await this.conversations.find(workspaceId, id);

    if (!conversation) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Conversation not found',
      });
    }

    return conversation;
  }

  async findOrCreate(workspaceId: string, contactId: string): Promise<ConversationDetailView> {
    const contact = await this.conversations.findContact(workspaceId, contactId);

    if (!contact) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Contact not found' });
    }

    const account = await this.conversations.findDefaultAccount(workspaceId);

    if (!account) {
      throw new ConflictException({
        code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
        message: 'Connect a WhatsApp number before starting a conversation',
      });
    }

    return toDetailView(
      await this.conversations.findOrCreateOpen(workspaceId, contact.id, account.id),
    );
  }

  async markRead(workspaceId: string, id: string): Promise<ConversationDetailView> {
    const updated = await this.conversations.markRead(workspaceId, id);

    if (!updated) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Conversation not found',
      });
    }

    return this.get(workspaceId, id);
  }
}

export function toView(row: ConversationListRow): ConversationView {
  return {
    id: row.id,
    status: row.status,
    assigned_to: row.assignedTo,
    last_message_at: row.lastMessageAt?.toISOString() ?? null,
    last_message_preview: row.lastMessagePreview,
    unread_count: row.unreadCount,
    created_at: row.createdAt.toISOString(),
    contact: {
      id: row.contact.id,
      name: row.contact.name,
      profile_name: row.contact.profileName,
      wa_id: row.contact.waId,
    },
    assignee: row.assignee ? { id: row.assignee.id, name: row.assignee.name } : null,
  };
}

export function toDetailView(row: ConversationDetailRow): ConversationDetailView {
  const view = toView(row);
  const account = row.whatsappAccount;

  return {
    ...view,
    contact: {
      ...view.contact,
      last_inbound_at: row.contact.lastInboundAt?.toISOString() ?? null,
      opted_out: row.contact.optedOut,
    },
    account: {
      id: account.id,
      phone_number_id: account.phoneNumberId,
      display_phone: account.displayPhone,
      verified_name: account.verifiedName,
      status: account.status,
    },
    window_expires_at: windowExpiresAt(row.contact)?.toISOString() ?? null,
  };
}
