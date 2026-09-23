import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ERROR_CODES } from '@crm/shared';
import { prisma } from '@crm/db';
import type { RequestContext } from '../types/request-context';

/** Header every workspace scoped request must carry. */
export const WORKSPACE_HEADER = 'x-workspace-id';

/**
 * Turns the X-Workspace-Id header into a checked membership.
 *
 * Attaches req.workspace, req.member and req.role. Everything downstream, this
 * task and every later one, reads the workspace id from req.workspace rather
 * than from the header, so a caller cannot reach another tenant's rows by
 * naming a workspace they do not belong to: a missing membership is a 403 here
 * before any handler runs.
 *
 * A workspace that does not exist and a workspace the caller is not a member of
 * both answer 403, not 404, so the header cannot be used to probe which
 * workspace ids are real.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestContext>();

    if (!request.user) {
      throw new ForbiddenException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Not authenticated',
      });
    }

    const header = request.headers[WORKSPACE_HEADER];
    const workspaceId = Array.isArray(header) ? header[0] : header;

    if (!workspaceId) {
      throw new BadRequestException({
        code: ERROR_CODES.WORKSPACE_REQUIRED,
        message: 'X-Workspace-Id header is required',
      });
    }

    if (!UUID_PATTERN.test(workspaceId)) {
      throw new BadRequestException({
        code: ERROR_CODES.WORKSPACE_REQUIRED,
        message: 'X-Workspace-Id must be a uuid',
      });
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: request.user.id } },
      include: { workspace: true },
    });

    if (!member) {
      throw new ForbiddenException({
        code: ERROR_CODES.NOT_A_MEMBER,
        message: 'You are not a member of this workspace',
      });
    }

    if (member.workspace.deletedAt) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Workspace not found',
      });
    }

    const { workspace, ...membership } = member;
    request.workspace = workspace;
    request.member = membership;
    request.role = membership.role;

    return true;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
