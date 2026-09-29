import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ERROR_CODES } from '@crm/shared';
import { prisma, type WhatsAppAccount } from '@crm/db';
import { tokenHint } from '@crm/shared';
import { CryptoService } from './crypto.service';
import type { ConnectManualAccountDto } from './dto/whatsapp.dto';

/** What the api returns for an account. Never includes the token. */
export interface WhatsAppAccountView {
  id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone: string;
  verified_name: string | null;
  quality_rating: string | null;
  messaging_tier: string | null;
  status: string;
  connected_at: string | null;
  /** Last 4 characters only, so support can confirm which token is stored. */
  access_token_hint: string;
}

@Injectable()
export class WhatsAppService {
  constructor(private readonly crypto: CryptoService) {}

  /**
   * Attach a number to a workspace by hand. Task 10 keeps this for beta
   * customers; task 13 adds the self serve Embedded Signup path.
   */
  async connectManual(
    workspaceId: string,
    dto: ConnectManualAccountDto,
  ): Promise<WhatsAppAccountView> {
    const existing = await prisma.whatsAppAccount.findUnique({
      where: { phoneNumberId: dto.phone_number_id },
    });

    // phone_number_id is globally unique because inbound webhooks route to a
    // workspace by that field alone. Letting two workspaces claim one number
    // would make routing ambiguous, so a number held elsewhere is a conflict.
    if (existing && existing.workspaceId !== workspaceId) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'That phone number id is already connected to another workspace',
      });
    }

    const data = {
      workspaceId,
      wabaId: dto.waba_id,
      phoneNumberId: dto.phone_number_id,
      displayPhone: dto.display_phone,
      verifiedName: dto.verified_name ?? null,
      accessTokenEnc: this.crypto.encrypt(dto.access_token),
      status: 'connected' as const,
      connectedAt: new Date(),
    };

    const account = await prisma.whatsAppAccount.upsert({
      where: { phoneNumberId: dto.phone_number_id },
      create: data,
      update: data,
    });

    return this.toView(account, dto.access_token);
  }

  /** The workspace's connected number, or 404 when there is none yet. */
  async current(workspaceId: string): Promise<WhatsAppAccountView> {
    const account = await prisma.whatsAppAccount.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });

    if (!account) {
      throw new NotFoundException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'No WhatsApp number is connected to this workspace yet',
      });
    }

    return this.toView(account, this.crypto.decrypt(account.accessTokenEnc));
  }

  private toView(account: WhatsAppAccount, accessToken: string): WhatsAppAccountView {
    return {
      id: account.id,
      waba_id: account.wabaId,
      phone_number_id: account.phoneNumberId,
      display_phone: account.displayPhone,
      verified_name: account.verifiedName,
      quality_rating: account.qualityRating,
      messaging_tier: account.messagingTier,
      status: account.status,
      connected_at: account.connectedAt?.toISOString() ?? null,
      access_token_hint: tokenHint(accessToken),
    };
  }
}
