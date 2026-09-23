import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ERROR_CODES, type Paginated } from '@crm/shared';
import type { WorkspaceRole } from '@crm/db';
import { AUDIT_ACTIONS, AuditRepository } from '../audit/audit.repository';
import { MembersRepository, type MemberWithUser } from './members.repository';

export interface MemberView {
  user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: WorkspaceRole;
  joined_at: string;
}

const DEFAULT_LIMIT = 50;

@Injectable()
export class MembersService {
  constructor(
    private readonly members: MembersRepository,
    private readonly audit: AuditRepository,
  ) {}

  async list(
    workspaceId: string,
    limit = DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<Paginated<MemberView>> {
    const { rows, nextCursor } = await this.members.page(workspaceId, limit, cursor);
    return { data: rows.map(toMemberView), next_cursor: nextCursor };
  }

  /**
   * Demoting the last owner would leave the workspace with nobody who can
   * delete it or promote anyone, so it is refused. Promoting is always fine.
   */
  async updateRole(
    workspaceId: string,
    targetUserId: string,
    role: WorkspaceRole,
    actorId: string,
  ): Promise<MemberView> {
    const member = await this.require(workspaceId, targetUserId);

    if (member.role === 'owner' && role !== 'owner') {
      await this.assertNotLastOwner(workspaceId);
    }

    const updated = await this.members.updateRole(member.id, role);

    await this.audit.record(workspaceId, {
      actorId,
      action: AUDIT_ACTIONS.MEMBER_ROLE_CHANGED,
      targetType: 'user',
      targetId: targetUserId,
      metadata: { from: member.role, to: role },
    });

    return toMemberView({ ...member, role: updated.role });
  }

  async remove(workspaceId: string, targetUserId: string, actorId: string): Promise<void> {
    const member = await this.require(workspaceId, targetUserId);

    if (member.role === 'owner') {
      await this.assertNotLastOwner(workspaceId);
    }

    await this.members.remove(member.id);

    await this.audit.record(workspaceId, {
      actorId,
      action: AUDIT_ACTIONS.MEMBER_REMOVED,
      targetType: 'user',
      targetId: targetUserId,
      metadata: { role: member.role },
    });
  }

  private async require(workspaceId: string, userId: string): Promise<MemberWithUser> {
    const member = await this.members.find(workspaceId, userId);

    if (!member) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'That user is not a member of this workspace',
      });
    }

    return member;
  }

  private async assertNotLastOwner(workspaceId: string): Promise<void> {
    const owners = await this.members.countByRole(workspaceId, 'owner');

    if (owners <= 1) {
      throw new ConflictException({
        code: ERROR_CODES.LAST_OWNER,
        message: 'A workspace must keep at least one owner',
      });
    }
  }
}

function toMemberView(member: MemberWithUser): MemberView {
  return {
    user_id: member.userId,
    email: member.user.email,
    name: member.user.name,
    avatar_url: member.user.avatarUrl,
    role: member.role,
    joined_at: member.createdAt.toISOString(),
  };
}
