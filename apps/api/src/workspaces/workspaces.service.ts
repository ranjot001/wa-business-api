import { Injectable } from '@nestjs/common';
import { prisma, type Prisma, type Workspace } from '@crm/db';
import { AUDIT_ACTIONS, AuditRepository } from '../audit/audit.repository';
import type { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspace.dto';
import { uniqueSlug } from './slug';

/** Length of the free trial a new workspace starts on. */
const TRIAL_DAYS = 14;

@Injectable()
export class WorkspacesService {
  constructor(private readonly audit: AuditRepository) {}

  /**
   * Creates the workspace and the creator's owner membership in one
   * transaction, so a failure cannot leave a workspace nobody can reach.
   */
  async create(userId: string, dto: CreateWorkspaceDto): Promise<Workspace> {
    const slug = await uniqueSlug(dto.name);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    return prisma.workspace.create({
      data: {
        name: dto.name,
        slug,
        timezone: dto.timezone ?? 'UTC',
        trialEndsAt,
        members: { create: { userId, role: 'owner' } },
      },
    });
  }

  async update(workspaceId: string, dto: UpdateWorkspaceDto): Promise<Workspace> {
    return prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.business_hours !== undefined
          ? { businessHours: dto.business_hours as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  /** Soft delete. The row stays so audit history and billing keep resolving. */
  async softDelete(workspaceId: string, actorId: string): Promise<void> {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() },
    });

    await this.audit.record(workspaceId, {
      actorId,
      action: AUDIT_ACTIONS.WORKSPACE_DELETED,
      targetType: 'workspace',
      targetId: workspaceId,
    });
  }
}
