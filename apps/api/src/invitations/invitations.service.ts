import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ERROR_CODES, type Paginated } from '@crm/shared';
import { prisma, type Invitation, type Workspace, type WorkspaceRole } from '@crm/db';
import { AuthService, normalizeEmail, toAuthUser } from '../auth/auth.service';
import { MailService } from '../auth/mail.service';
import { TokenService, type IssuedRefreshToken } from '../auth/token.service';
import type { AuthUser } from '../common/types/request-context';
import type { AcceptInvitationDto, CreateInvitationDto } from './dto/invitation.dto';
import { InvitationsRepository } from './invitations.repository';

/** How long an invite link stays good. */
const INVITE_TTL_DAYS = 7;
const DEFAULT_LIMIT = 50;

export interface InvitationView {
  id: string;
  email: string;
  role: WorkspaceRole;
  expires_at: string;
  created_at: string;
}

export interface AcceptResult {
  user: AuthUser;
  access_token: string;
  refresh: IssuedRefreshToken;
  workspace: { id: string; name: string; slug: string; role: WorkspaceRole };
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly mail: MailService,
    private readonly tokens: TokenService,
  ) {}

  async list(
    workspaceId: string,
    limit = DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<Paginated<InvitationView>> {
    const { rows, nextCursor } = await this.invitations.page(workspaceId, limit, cursor);
    return { data: rows.map(toInvitationView), next_cursor: nextCursor };
  }

  async create(
    workspace: Workspace,
    dto: CreateInvitationDto,
    invitedById: string,
  ): Promise<InvitationView> {
    const email = normalizeEmail(dto.email);

    const alreadyMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, user: { email } },
    });

    if (alreadyMember) {
      throw new ConflictException({
        code: ERROR_CODES.ALREADY_MEMBER,
        message: 'That email already belongs to a member of this workspace',
      });
    }

    // Re-inviting replaces the outstanding invite rather than stacking a second
    // one, so the newest link is the only one that works.
    const pending = await this.invitations.findPendingByEmail(workspace.id, email);
    if (pending) {
      await this.invitations.deleteInWorkspace(workspace.id, pending.id);
    }

    const invitation = await this.invitations.create({
      workspaceId: workspace.id,
      email,
      role: dto.role,
      token: randomBytes(32).toString('base64url'),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      invitedById,
    });

    await this.mail.sendInvitation(email, workspace.name, invitation.token);

    return toInvitationView(invitation);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const invitation = await this.invitations.findInWorkspace(workspaceId, id);

    if (!invitation) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Invitation not found',
      });
    }

    await this.invitations.deleteInWorkspace(workspaceId, id);
  }

  /**
   * Public. The token is the only credential, so everything it implies is
   * checked here: that it exists, has not been spent, and has not expired.
   *
   * An invited email that already has an account just gains a membership. One
   * that does not gets an account created from the name and password supplied
   * with the token. Either way the caller ends up signed in, which is what
   * lets the web app drop them straight into the workspace.
   */
  async accept(dto: AcceptInvitationDto, userAgent?: string): Promise<AcceptResult> {
    const invitation = await this.invitations.findByToken(dto.token);

    if (!invitation) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_TOKEN,
        message: 'This invitation link is not valid',
      });
    }

    if (invitation.acceptedAt) {
      throw new ConflictException({
        code: ERROR_CODES.INVITATION_ALREADY_ACCEPTED,
        message: 'This invitation has already been accepted',
      });
    }

    if (invitation.expiresAt <= new Date()) {
      throw new BadRequestException({
        code: ERROR_CODES.INVITATION_EXPIRED,
        message: 'This invitation has expired. Ask for a new one.',
      });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: invitation.workspaceId, deletedAt: null },
    });

    if (!workspace) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'That workspace no longer exists',
      });
    }

    let user = await prisma.user.findUnique({ where: { email: invitation.email } });

    if (!user) {
      if (!dto.password || !dto.name) {
        throw new BadRequestException({
          code: ERROR_CODES.PASSWORD_REQUIRED,
          message: 'This email has no account yet, so name and password are required',
        });
      }

      user = await prisma.user.create({
        data: {
          email: invitation.email,
          name: dto.name,
          passwordHash: await AuthService.hashPassword(dto.password),
          lastLoginAt: new Date(),
        },
      });
    }

    const userId = user.id;

    await prisma.$transaction([
      prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
        create: { workspaceId: workspace.id, userId, role: invitation.role },
        update: {},
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return {
      user: toAuthUser(user),
      access_token: this.tokens.signAccessToken(user),
      refresh: await this.tokens.issueRefreshToken(userId, userAgent),
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: invitation.role,
      },
    };
  }
}

function toInvitationView(invitation: Invitation): InvitationView {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expires_at: invitation.expiresAt.toISOString(),
    created_at: invitation.createdAt.toISOString(),
  };
}
