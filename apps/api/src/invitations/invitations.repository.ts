import { Injectable } from '@nestjs/common';
import { prisma, type Invitation, type WorkspaceRole } from '@crm/db';
import { WorkspaceScopedRepository } from '../common/repositories/workspace-scoped.repository';

@Injectable()
export class InvitationsRepository extends WorkspaceScopedRepository {
  constructor() {
    super(prisma);
  }

  /** Pending invitations only: accepted ones are history, not a to do list. */
  async page(
    workspaceId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ rows: Invitation[]; nextCursor: string | null }> {
    const rows = await this.prisma.invitation.findMany({
      where: this.scope(workspaceId, { acceptedAt: null }),
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return { rows: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  findPendingByEmail(workspaceId: string, email: string): Promise<Invitation | null> {
    return this.prisma.invitation.findFirst({
      where: this.scope(workspaceId, { email, acceptedAt: null }),
    });
  }

  findInWorkspace(workspaceId: string, id: string): Promise<Invitation | null> {
    return this.prisma.invitation.findFirst({ where: this.scope(workspaceId, { id }) });
  }

  create(data: {
    workspaceId: string;
    email: string;
    role: WorkspaceRole;
    token: string;
    expiresAt: Date;
    invitedById: string;
  }): Promise<Invitation> {
    return this.prisma.invitation.create({ data });
  }

  async deleteInWorkspace(workspaceId: string, id: string): Promise<void> {
    await this.prisma.invitation.deleteMany({ where: this.scope(workspaceId, { id }) });
  }

  /**
   * Lookup by token is the one query here that is not workspace scoped: the
   * person accepting has no workspace context yet, and the token itself is the
   * capability. It reads through prisma directly rather than through scope()
   * so the exception is visible.
   */
  findByToken(token: string): Promise<Invitation | null> {
    return this.prisma.invitation.findUnique({ where: { token } });
  }
}
