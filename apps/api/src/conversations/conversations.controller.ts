import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Paginated } from '@crm/shared';
import type { Workspace } from '@crm/db';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthUser } from '../common/types/request-context';
import {
  ConversationsService,
  type ConversationDetailView,
  type ConversationView,
} from './conversations.service';
import { CreateConversationDto, ListConversationsQueryDto } from './dto/conversation.dto';

@Controller('conversations')
@UseGuards(WorkspaceGuard, RolesGuard)
@Roles('agent')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(
    @CurrentWorkspace() workspace: Workspace,
    @CurrentUser() user: AuthUser,
    @Query() query: ListConversationsQueryDto,
  ): Promise<Paginated<ConversationView>> {
    return this.conversations.list(workspace.id, user.id, query);
  }

  @Get(':id')
  get(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetailView> {
    return this.conversations.get(workspace.id, id);
  }

  /** Find or create, so 200 either way rather than 201. */
  @Post()
  @HttpCode(HttpStatus.OK)
  create(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationDetailView> {
    return this.conversations.findOrCreate(workspace.id, dto.contact_id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  read(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetailView> {
    return this.conversations.markRead(workspace.id, id);
  }
}
