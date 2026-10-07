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
import type { Workspace } from '@crm/db';
import { sendMessageSchema, type Paginated, type SendMessageInput } from '@crm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../common/types/request-context';
import { ListMessagesQueryDto } from '../conversations/dto/conversation.dto';
import { MessagesService, type MessageView } from './messages.service';

/** Messages inside one conversation. */
@Controller('conversations/:conversationId/messages')
@UseGuards(WorkspaceGuard, RolesGuard)
@Roles('agent')
export class ConversationMessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(
    @CurrentWorkspace() workspace: Workspace,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<Paginated<MessageView>> {
    return this.messages.list(workspace.id, conversationId, query.limit, query.cursor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  send(
    @CurrentWorkspace() workspace: Workspace,
    @CurrentUser() user: AuthUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
  ): Promise<MessageView> {
    return this.messages.send(workspace.id, user.id, conversationId, body);
  }
}

/** A single message by id, wherever it lives. */
@Controller('messages')
@UseGuards(WorkspaceGuard, RolesGuard)
@Roles('agent')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get(':id')
  get(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MessageView> {
    return this.messages.get(workspace.id, id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  retry(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MessageView> {
    return this.messages.retry(workspace.id, id);
  }
}
