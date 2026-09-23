import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { ERROR_CODES } from '@crm/shared';
import { prisma, type User } from '@crm/db';
import type { AuthUser } from '../common/types/request-context';
import { MailService } from './mail.service';
import { TokenService, type IssuedRefreshToken } from './token.service';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

export interface AuthResult {
  user: AuthUser;
  access_token: string;
  refresh: IssuedRefreshToken;
}

/** Strip a user row down to what is safe to return. */
export function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly tokens: TokenService,
    private readonly mail: MailService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async register(dto: RegisterDto, userAgent?: string): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException({
        code: ERROR_CODES.EMAIL_TAKEN,
        message: 'An account with that email already exists',
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: dto.name,
        passwordHash: await AuthService.hashPassword(dto.password),
        lastLoginAt: new Date(),
      },
    });

    return this.issue(user, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<AuthResult> {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(dto.email) } });

    // Verify even when there is no user so the response time does not say
    // whether the email is registered.
    const valid = user
      ? await argon2.verify(user.passwordHash, dto.password).catch(() => false)
      : await argon2.verify(DUMMY_HASH, dto.password).catch(() => false);

    if (!user || !valid) {
      throw new UnauthorizedException({
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Email or password is incorrect',
      });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return this.issue(user, userAgent);
  }

  async refresh(
    token: string,
    userAgent?: string,
  ): Promise<{ access_token: string; refresh: IssuedRefreshToken }> {
    const rotated = await this.tokens.rotateRefreshToken(token, userAgent);

    if (!rotated) {
      throw new UnauthorizedException({
        code: ERROR_CODES.TOKEN_EXPIRED,
        message: 'Refresh token is invalid, expired or already used',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: rotated.userId } });

    if (!user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Account no longer exists',
      });
    }

    return { access_token: this.tokens.signAccessToken(user), refresh: rotated.refresh };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) {
      await this.tokens.revokeRefreshToken(token);
    }
  }

  /**
   * Always resolves, whether or not the email is registered, so this endpoint
   * cannot be used to enumerate accounts.
   */
  async forgotPassword(rawEmail: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(rawEmail) } });

    if (!user) {
      return;
    }

    await this.mail.sendPasswordReset(user.email, this.tokens.signPasswordResetToken(user));
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const userId = this.tokens.decodeResetSubject(token);
    const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;

    if (!user || !this.tokens.verifyPasswordResetToken(token, user.passwordHash)) {
      throw new BadRequestException({
        code: ERROR_CODES.INVALID_TOKEN,
        message: 'This reset link is invalid or has expired',
      });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await AuthService.hashPassword(password) },
      }),
      // A password reset ends every other session.
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async issue(user: User, userAgent?: string): Promise<AuthResult> {
    return {
      user: toAuthUser(user),
      access_token: this.tokens.signAccessToken(user),
      refresh: await this.tokens.issueRefreshToken(user.id, userAgent),
    };
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A real argon2 hash of a value nobody knows, verified against when the email
 * does not exist so that both branches of login cost the same.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';
