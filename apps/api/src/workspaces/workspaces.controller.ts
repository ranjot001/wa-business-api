import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthUser } from '../common/types/request-context';
import type { Workspace } from '@crm/db';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspace.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /**
   * Deliberately not behind WorkspaceGuard: this is how a user who belongs to
   * no workspace yet gets their first one.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto): Promise<Workspace> {
    return this.workspaces.create(user.id, dto);
  }

  @Get('current')
  @UseGuards(WorkspaceGuard)
  current(@CurrentWorkspace() workspace: Workspace): Workspace {
    return workspace;
  }

  @Patch('current')
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles('admin')
  update(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    return this.workspaces.update(workspace.id, dto);
  }

  @Delete('current')
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentWorkspace() workspace: Workspace, @CurrentUser() user: AuthUser): Promise<void> {
    return this.workspaces.softDelete(workspace.id, user.id);
  }
}
