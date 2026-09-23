import { createParamDecorator, BadRequestException, type ExecutionContext } from '@nestjs/common';
import { ERROR_CODES } from '@crm/shared';
import type { Workspace } from '@crm/db';
import type { RequestContext } from '../types/request-context';

/** The workspace named by X-Workspace-Id, as attached by WorkspaceGuard. */
export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Workspace => {
    const request = ctx.switchToHttp().getRequest<RequestContext>();
    if (!request.workspace) {
      throw new BadRequestException({
        code: ERROR_CODES.WORKSPACE_REQUIRED,
        message: 'No workspace on this request',
      });
    }
    return request.workspace;
  },
);
