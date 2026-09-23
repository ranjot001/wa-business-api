import type { Request } from 'express';
import type { Workspace, WorkspaceMember, WorkspaceRole } from '@crm/db';

/** The slice of a user row that travels on the request. Never the password hash. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * What the guards attach to the request, in order:
 *   JwtAuthGuard   -> user
 *   WorkspaceGuard -> workspace, member, role
 *   RolesGuard     -> reads role, attaches nothing
 */
export interface RequestContext extends Request {
  user?: AuthUser;
  workspace?: Workspace;
  member?: WorkspaceMember;
  role?: WorkspaceRole;
}
