import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Paginated } from '@crm/shared';
import type { Workspace } from '@crm/db';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthUser } from '../common/types/request-context';
import { REFRESH_COOKIE, TokenService } from '../auth/token.service';
import { PaginationQueryDto } from '../workspaces/dto/workspace.dto';
import { AcceptInvitationDto, CreateInvitationDto } from './dto/invitation.dto';
import { InvitationsService, type InvitationView } from './invitations.service';

/**
 * Guards are declared per method rather than on the class because accept is
 * public and workspaceless: the token is the credential and it names its own
 * workspace.
 */
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly tokens: TokenService,
  ) {}

  @Get()
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles('admin')
  list(
    @CurrentWorkspace() workspace: Workspace,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<InvitationView>> {
    return this.invitations.list(workspace.id, query.limit, query.cursor);
  }

  @Post()
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentWorkspace() workspace: Workspace,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationView> {
    return this.invitations.create(workspace, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(WorkspaceGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.invitations.remove(workspace.id, id);
  }

  @Post('accept')
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  async accept(
    @Body() dto: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    user: AuthUser;
    access_token: string;
    workspace: { id: string; name: string; slug: string };
  }> {
    const result = await this.invitations.accept(dto, req.headers['user-agent']);

    res.cookie(
      REFRESH_COOKIE,
      result.refresh.token,
      this.tokens.refreshCookieOptions(result.refresh.expiresAt),
    );

    return {
      user: result.user,
      access_token: result.access_token,
      workspace: result.workspace,
    };
  }
}
