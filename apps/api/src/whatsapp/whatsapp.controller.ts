import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { Workspace } from '@crm/db';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { ConnectManualAccountDto } from './dto/whatsapp.dto';
import { WhatsAppService, type WhatsAppAccountView } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(WorkspaceGuard, RolesGuard)
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  /** Owner only: this stores a credential that can send as the business. */
  @Post('accounts/manual')
  @Roles('owner')
  @HttpCode(HttpStatus.CREATED)
  connectManual(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: ConnectManualAccountDto,
  ): Promise<WhatsAppAccountView> {
    return this.whatsapp.connectManual(workspace.id, dto);
  }

  @Get('account')
  @Roles('agent')
  current(@CurrentWorkspace() workspace: Workspace): Promise<WhatsAppAccountView> {
    return this.whatsapp.current(workspace.id);
  }
}
