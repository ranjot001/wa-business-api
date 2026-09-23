import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { WorkspaceRole } from '@crm/db';

const ROLES: WorkspaceRole[] = ['owner', 'admin', 'agent'];

export class CreateInvitationDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320)
  email!: string;

  @IsIn(ROLES, { message: `role must be one of ${ROLES.join(', ')}` })
  role!: WorkspaceRole;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(1)
  token!: string;

  /** Required only when the invited email has no account yet. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;
}
