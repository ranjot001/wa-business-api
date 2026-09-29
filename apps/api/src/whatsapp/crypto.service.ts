import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt, encrypt, parseEncryptionKey } from '@crm/shared';
import type { Env } from '../config/env';

/**
 * Wraps packages/shared/crypto with the configured key so call sites never
 * handle key material themselves.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    // Parsed once, at construction, so a malformed key fails at boot rather
    // than on the first customer who connects a number.
    this.key = parseEncryptionKey(config.get('ENCRYPTION_KEY', { infer: true }));
  }

  encrypt(plaintext: string): Buffer {
    return encrypt(plaintext, this.key);
  }

  decrypt(payload: Buffer): string {
    return decrypt(payload, this.key);
  }
}
