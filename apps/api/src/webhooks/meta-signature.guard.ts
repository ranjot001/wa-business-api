import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES } from '@crm/shared';
import type { Request } from 'express';
import type { Env } from '../config/env';

type RawBodyRequest = Request & { rawBody?: Buffer };

const SIGNATURE_HEADER = 'x-hub-signature-256';
const PREFIX = 'sha256=';

/**
 * Verifies Meta's X-Hub-Signature-256 header.
 *
 * The signature is HMAC-SHA256 of the exact request bytes, keyed with the app
 * secret. Three things this gets right, each of which is a real way to get
 * this wrong:
 *
 *   1. It hashes `req.rawBody`, the bytes captured by the express.json verify
 *      hook in main.ts. Hashing JSON.stringify(req.body) would fail on any
 *      payload whose re-serialisation differs by a byte, which in practice
 *      means unicode in a contact's name.
 *   2. It compares with timingSafeEqual, not ===. A byte-by-byte early exit
 *      leaks how much of a guess was right, which over many attempts is enough
 *      to forge a signature.
 *   3. timingSafeEqual throws when the two buffers differ in length, so the
 *      length is checked first and answers the same 403 as a wrong signature.
 *
 * A failure is 403 and nothing is enqueued.
 */
@Injectable()
export class MetaSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MetaSignatureGuard.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest>();

    const header = request.headers[SIGNATURE_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !provided.startsWith(PREFIX)) {
      this.logger.warn({ path: request.url }, 'webhook rejected: missing signature header');
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Missing or malformed X-Hub-Signature-256',
      });
    }

    const rawBody = request.rawBody;

    if (!rawBody) {
      // Means the raw body hook in main.ts is not wired for this route. Fail
      // closed: verifying against a re-serialised body would be theatre.
      this.logger.error({ path: request.url }, 'webhook rejected: raw body unavailable');
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Signature could not be verified',
      });
    }

    const expected = createHmac('sha256', this.config.get('META_APP_SECRET', { infer: true }))
      .update(rawBody)
      .digest();

    const providedDigest = Buffer.from(provided.slice(PREFIX.length), 'hex');

    if (providedDigest.length !== expected.length || !timingSafeEqual(providedDigest, expected)) {
      this.logger.warn({ path: request.url }, 'webhook rejected: signature mismatch');
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Signature verification failed',
      });
    }

    return true;
  }
}
