import { createParamDecorator, BadRequestException, type ExecutionContext } from '@nestjs/common';
import { ERROR_CODES } from '@crm/shared';
import type { WorkspaceMember } from '@crm/db';
import type { RequestContext } from '../types/request-context';

/** The caller's membership row in the current workspace, including their role. */
export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WorkspaceMember => {
    const request = ctx.switchToHttp().getRequest<RequestContext>();
    if (!request.member) {
      throw new BadRequestException({
        code: ERROR_CODES.WORKSPACE_REQUIRED,
        message: 'No workspace membership on this request',
      });
    }
    return request.member;
  },
);
