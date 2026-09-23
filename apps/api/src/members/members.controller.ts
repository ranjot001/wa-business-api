import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { PaginationQueryDto } from '../workspaces/dto/workspace.dto';
import { UpdateMemberDto } from './dto/member.dto';
import { MembersService, type MemberView } from './members.service';

@Controller('members')
@UseGuards(WorkspaceGuard, RolesGuard)
@Roles('agent')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(
    @CurrentWorkspace() workspace: Workspace,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<MemberView>> {
    return this.members.list(workspace.id, query.limit, query.cursor);
  }

  @Patch(':userId')
  @Roles('admin')
  update(
    @CurrentWorkspace() workspace: Workspace,
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<MemberView> {
    return this.members.updateRole(workspace.id, userId, dto.role, user.id);
  }

  @Delete(':userId')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.members.remove(workspace.id, userId, user.id);
  }
}
