import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ERROR_CODES } from '@crm/shared';
import { prisma, type WorkspaceRole } from '@crm/db';
import type { AuthUser } from '../common/types/request-context';
import { AuthService, toAuthUser } from '../auth/auth.service';
import type { ChangePasswordDto, UpdateMeDto } from '../auth/dto/auth.dto';

export interface MeWorkspace {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

export interface MeResponse {
  user: AuthUser;
  workspaces: MeWorkspace[];
}

@Injectable()
export class MeService {
  async get(userId: string): Promise<MeResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { workspace: { deletedAt: null } },
          include: { workspace: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'User not found' });
    }

    return {
      user: toAuthUser(user),
      workspaces: user.memberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        role: membership.role,
      })),
    };
  }

  async update(userId: string, dto: UpdateMeDto): Promise<AuthUser> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.avatar_url !== undefined ? { avatarUrl: dto.avatar_url } : {}),
      },
    });

    return toAuthUser(user);
  }

  /** Changing the password revokes every other session, same as a reset. */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'User not found' });
    }

    const valid = await argon2.verify(user.passwordHash, dto.current_password).catch(() => false);

    if (!valid) {
      throw new UnauthorizedException({
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Current password is incorrect',
      });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await AuthService.hashPassword(dto.new_password) },
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
