import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ERROR_CODES } from '@crm/shared';
import { prisma } from '@crm/db';
import type { Env } from '../config/env';
import type { AuthUser } from '../common/types/request-context';

/** Claims carried by an access token. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  /**
   * Called once the signature and expiry check out. The user is re-read on
   * every request rather than trusted from the claims, so a deleted user
   * cannot keep using a token that has not expired yet.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Account no longer exists',
      });
    }

    return user;
  }
}
