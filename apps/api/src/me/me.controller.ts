import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/request-context';
import { ChangePasswordDto, UpdateMeDto } from '../auth/dto/auth.dto';
import { MeService, type MeResponse } from './me.service';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** The caller plus every workspace they belong to, with their role in each. */
  @Get()
  get(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.me.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto): Promise<AuthUser> {
    return this.me.update(user.id, dto);
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.me.changePassword(user.id, dto);
  }
}
