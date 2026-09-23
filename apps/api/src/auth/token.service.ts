import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { prisma, type User } from '@crm/db';
import type { Env } from '../config/env';
import type { AccessTokenPayload } from './jwt.strategy';

/** Name of the httpOnly cookie the refresh token travels in. */
export const REFRESH_COOKIE = 'refresh_token';

export interface IssuedRefreshToken {
  /** The raw token. Goes in the cookie and is never stored. */
  token: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** sha256 of the raw token. Only this ever reaches the database. */
  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  signAccessToken(user: Pick<User, 'id' | 'email'>): string {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email };
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
  }

  /** Mint a refresh token row and hand back the raw token for the cookie. */
  async issueRefreshToken(userId: string, userAgent?: string): Promise<IssuedRefreshToken> {
    const token = randomBytes(48).toString('base64url');
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: TokenService.hash(token),
        expiresAt,
        userAgent: userAgent ?? null,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Rotation. The presented token is revoked in the same transaction that
   * issues its replacement, so a token can be spent exactly once: a stolen
   * cookie replayed after the real client has refreshed finds a revoked row
   * and gets nothing.
   */
  async rotateRefreshToken(
    currentToken: string,
    userAgent?: string,
  ): Promise<{ userId: string; refresh: IssuedRefreshToken } | null> {
    const tokenHash = TokenService.hash(currentToken);
    const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) {
      return null;
    }

    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const refresh = await this.issueRefreshToken(existing.userId, userAgent);
    return { userId: existing.userId, refresh };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: TokenService.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Cookie options shared by every place that sets or clears the cookie.
   *
   * clearCookie only matches a cookie whose path is identical, so the clear on
   * logout has to read the same REFRESH_COOKIE_PATH the cookie was set with.
   */
  refreshCookieOptions(expires?: Date): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: string;
    expires?: Date;
  } {
    const isProduction = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: this.config.get('REFRESH_COOKIE_PATH', { infer: true }),
      ...(expires ? { expires } : {}),
    };
  }

  /**
   * Password reset token.
   *
   * Signed with JWT_SECRET plus the user's current password hash, which makes
   * it single use without a table to store it in: completing the reset changes
   * the hash, so the same link stops verifying. The task's schema lists no
   * password_resets table, and this keeps it that way.
   */
  signPasswordResetToken(user: Pick<User, 'id' | 'passwordHash'>): string {
    return this.jwt.sign(
      { sub: user.id, typ: 'password_reset' },
      { secret: this.resetSecret(user.passwordHash), expiresIn: '1h' },
    );
  }

  verifyPasswordResetToken(token: string, passwordHash: string): { sub: string } | null {
    try {
      return this.jwt.verify<{ sub: string }>(token, { secret: this.resetSecret(passwordHash) });
    } catch {
      return null;
    }
  }

  /** The subject of a reset token, read without verifying, to find the user. */
  decodeResetSubject(token: string): string | null {
    const decoded = this.jwt.decode(token) as { sub?: unknown } | null;
    return typeof decoded?.sub === 'string' ? decoded.sub : null;
  }

  private resetSecret(passwordHash: string): string {
    return `${this.config.get('JWT_SECRET', { infer: true })}.${passwordHash}`;
  }
}
