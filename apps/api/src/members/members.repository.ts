import { Injectable } from '@nestjs/common';
import { prisma, type WorkspaceMember, type WorkspaceRole, type User } from '@crm/db';
import { WorkspaceScopedRepository } from '../common/repositories/workspace-scoped.repository';

export type MemberWithUser = WorkspaceMember & { user: User };

@Injectable()
export class MembersRepository extends WorkspaceScopedRepository {
  constructor() {
    super(prisma);
  }

  /** One page of members, oldest first, plus the cursor for the next page. */
  async page(
    workspaceId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ rows: MemberWithUser[]; nextCursor: string | null }> {
    // Fetch one extra row to learn whether another page exists without a count.
    const rows = await this.prisma.workspaceMember.findMany({
      where: this.scope(workspaceId),
      include: { user: true },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return { rows: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  find(workspaceId: string, userId: string): Promise<MemberWithUser | null> {
    return this.prisma.workspaceMember.findFirst({
      where: this.scope(workspaceId, { userId }),
      include: { user: true },
    });
  }

  countByRole(workspaceId: string, role: WorkspaceRole): Promise<number> {
    return this.prisma.workspaceMember.count({ where: this.scope(workspaceId, { role }) });
  }

  updateRole(id: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    return this.prisma.workspaceMember.update({ where: { id }, data: { role } });
  }

  remove(id: string): Promise<WorkspaceMember> {
    return this.prisma.workspaceMember.delete({ where: { id } });
  }
}
