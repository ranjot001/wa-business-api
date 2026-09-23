import { IsIn } from 'class-validator';
import type { WorkspaceRole } from '@crm/db';

const ROLES: WorkspaceRole[] = ['owner', 'admin', 'agent'];

export class UpdateMemberDto {
  @IsIn(ROLES, { message: `role must be one of ${ROLES.join(', ')}` })
  role!: WorkspaceRole;
}
