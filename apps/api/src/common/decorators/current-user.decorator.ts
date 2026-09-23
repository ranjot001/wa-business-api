import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ERROR_CODES } from '@crm/shared';
import type { AuthUser, RequestContext } from '../types/request-context';

/**
 * The authenticated user, as attached by JwtAuthGuard.
 *
 * Throws rather than returning undefined: reaching a handler that asks for the
 * current user without a guard having run is a wiring bug, not a 401 the client
 * can fix, but returning undefined would hide it until something dereferences it.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<RequestContext>();
    if (!request.user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Not authenticated',
      });
    }
    return request.user;
  },
);
