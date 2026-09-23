import { SetMetadata } from '@nestjs/common';
import type { WorkspaceRole } from '@crm/db';

export const ROLES_KEY = 'roles';

/**
 * Minimum role required for a route, for example `@Roles('admin')`.
 *
 * The check is a floor, not an exact match: owner satisfies @Roles('admin')
 * and @Roles('agent'). See RolesGuard for the ordering.
 */
export const Roles = (role: WorkspaceRole): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, role);
