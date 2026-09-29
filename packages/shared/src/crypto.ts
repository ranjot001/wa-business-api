import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for secrets that have to be readable again, which today means
 * Meta access tokens (a password would be hashed instead, see argon2 in the
 * api). GCM is authenticated: tampering with the ciphertext fails the auth tag
 * check on decrypt rather than returning garbage.
 *
 * Wire format, one buffer, so callers store a single bytea column:
 *
 *   [ 12 byte iv ][ 16 byte auth tag ][ ciphertext ]
 *
 * The iv is random per encryption and stored alongside, which is required:
 * reusing an iv with the same key destroys GCM's security entirely.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * Turns ENCRYPTION_KEY into raw key bytes.
 *
 * Accepts base64 or hex, and requires exactly 32 bytes decoded. Generate one
 * with `openssl rand -base64 32`.
 */
export function parseEncryptionKey(key: string): Buffer {
  const candidates = [
    Buffer.from(key, 'base64'),
    ...(/^[0-9a-f]+$/i.test(key) ? [Buffer.from(key, 'hex')] : []),
  ];

  const found = candidates.find((buffer) => buffer.length === KEY_BYTES);

  if (!found) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes. Generate one with: openssl rand -base64 32`,
    );
  }

  return found;
}

export function encrypt(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decrypt(payload: Buffer, key: Buffer): string {
  if (payload.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Ciphertext is too short to contain an iv and auth tag');
  }

  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Last 4 digits of a token, for logs and the api response. Never return or log
 * the token itself.
 */
export function tokenHint(token: string): string {
  return token.length <= 4 ? '****' : `****${token.slice(-4)}`;
}
