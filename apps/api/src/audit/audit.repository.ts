import { Injectable } from '@nestjs/common';
import { prisma, type Prisma } from '@crm/db';
import { WorkspaceScopedRepository } from '../common/repositories/workspace-scoped.repository';

/** Actions this task records. Later tasks add their own. */
export const AUDIT_ACTIONS = {
  MEMBER_ROLE_CHANGED: 'member.role_changed',
  MEMBER_REMOVED: 'member.removed',
  WORKSPACE_DELETED: 'workspace.deleted',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  actorId: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditRepository extends WorkspaceScopedRepository {
  constructor() {
    super(prisma);
  }

  async record(workspaceId: string, entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: this.scope(workspaceId, {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata,
      }),
    });
  }
}
