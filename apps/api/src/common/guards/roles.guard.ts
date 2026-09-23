import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '@crm/shared';
import type { WorkspaceRole } from '@crm/db';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestContext } from '../types/request-context';

/**
 * Role hierarchy. A higher number satisfies every requirement at or below it,
 * so owner passes @Roles('admin') and @Roles('agent').
 */
const RANK: Record<WorkspaceRole, number> = {
  agent: 1,
  admin: 2,
  owner: 3,
};

/** True when `role` is at least `required` in the hierarchy above. */
export function roleAtLeast(role: WorkspaceRole, required: WorkspaceRole): boolean {
  return RANK[role] >= RANK[required];
}

/**
 * Enforces @Roles(...). Runs after WorkspaceGuard, which is what puts the
 * caller's role on the request.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<WorkspaceRole | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const role = request.role;

    if (!role || !roleAtLeast(role, required)) {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: `This action requires the ${required} role or higher`,
      });
    }

    return true;
  }
}
