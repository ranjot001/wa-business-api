import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { MetaClientFactory } from './meta.client';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

/**
 * Global because CryptoService and the Meta client are wanted by later tasks
 * (sending, templates, broadcasts) from modules that have no reason to import
 * the WhatsApp module for its controller.
 */
@Global()
@Module({
  controllers: [WhatsAppController],
  providers: [WhatsAppService, CryptoService, MetaClientFactory],
  exports: [CryptoService, MetaClientFactory],
})
export class WhatsAppModule {}
