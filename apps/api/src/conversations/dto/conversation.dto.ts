import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const CONVERSATION_STATUSES = ['open', 'pending', 'resolved'] as const;
export const ASSIGNED_FILTERS = ['me', 'unassigned', 'all'] as const;

export class ListConversationsQueryDto {
  @IsOptional()
  @IsIn(CONVERSATION_STATUSES)
  status?: (typeof CONVERSATION_STATUSES)[number];

  @IsOptional()
  @IsIn(ASSIGNED_FILTERS)
  assigned?: (typeof ASSIGNED_FILTERS)[number];

  /** Matches the contact's name, WhatsApp profile name or number. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateConversationDto {
  @IsUUID()
  contact_id!: string;
}

export class ListMessagesQueryDto {
  /** The id of the last message on the previous page. */
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
