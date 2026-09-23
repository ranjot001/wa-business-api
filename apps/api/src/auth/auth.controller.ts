import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/types/request-context';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE, TokenService, type IssuedRefreshToken } from './token.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';

/**
 * Every route here is public in the sense that it needs no access token, and
 * every one is rate limited to 10 requests a minute per IP by ThrottlerGuard.
 */
@Controller('auth')
@Public()
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser; access_token: string }> {
    const result = await this.auth.register(dto, req.headers['user-agent']);
    this.setRefreshCookie(res, result.refresh);
    return { user: result.user, access_token: result.access_token };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser; access_token: string }> {
    const result = await this.auth.login(dto, req.headers['user-agent']);
    this.setRefreshCookie(res, result.refresh);
    return { user: result.user, access_token: result.access_token };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ access_token: string }> {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const result = await this.auth.refresh(
      cookies?.[REFRESH_COOKIE] ?? '',
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, result.refresh);
    return { access_token: result.access_token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    await this.auth.logout(cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.tokens.refreshCookieOptions());
  }

  /** Answers 204 whether or not the email exists, so accounts cannot be probed. */
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  private setRefreshCookie(res: Response, refresh: IssuedRefreshToken): void {
    res.cookie(REFRESH_COOKIE, refresh.token, this.tokens.refreshCookieOptions(refresh.expiresAt));
  }
}
