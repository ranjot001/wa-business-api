import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES, type WaWebhookBody } from '@crm/shared';
import { Public } from '../common/decorators/public.decorator';
import type { Env } from '../config/env';
import { MetaSignatureGuard } from './meta-signature.guard';
import { WebhooksService } from './webhooks.service';

/**
 * Meta's webhook endpoints.
 *
 * Public in the JWT sense: Meta has no account here. Authenticity comes from
 * the verify token on GET and the HMAC signature on POST, not from a session.
 */
@Controller('webhooks/whatsapp')
@Public()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooks: WebhooksService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Subscription handshake. Meta calls this once when the webhook url is saved
   * and expects the challenge echoed back as a bare string.
   */
  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = this.config.get('META_WEBHOOK_VERIFY_TOKEN', { infer: true });

    if (mode !== 'subscribe' || token !== expected || !challenge) {
      this.logger.warn({ mode, hasChallenge: Boolean(challenge) }, 'webhook verification refused');
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Webhook verification failed',
      });
    }

    this.logger.log('webhook verification succeeded');

    // Meta wants the raw challenge, not JSON. Returning a string from a Nest
    // handler sends it as text/html, which Meta accepts.
    return challenge;
  }

  /**
   * Delivery endpoint. Always 200 once the signature checks out, even for a
   * payload this product does not understand: a non-200 makes Meta retry, and
   * retrying will not make an unknown field understandable.
   */
  @Post()
  @UseGuards(MetaSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async receive(@Body() body: WaWebhookBody): Promise<{ received: true }> {
    await this.webhooks.receive(body);
    return { received: true };
  }
}
