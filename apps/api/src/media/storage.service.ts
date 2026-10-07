import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ERROR_CODES } from '@crm/shared';
import type { Env } from '../config/env';

/**
 * Cloudflare R2 through the S3 API, the api side of apps/worker/src/storage.ts.
 *
 * R2 wants region "auto" and an account specific endpoint. When R2_* is not
 * set, the process still boots and every call answers 503, which keeps local
 * development and CI free of object storage.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;

  constructor(config: ConfigService<Env, true>) {
    const accountId = config.get('R2_ACCOUNT_ID', { infer: true });
    const accessKeyId = config.get('R2_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('R2_SECRET_ACCESS_KEY', { infer: true });
    const bucket = config.get('R2_BUCKET', { infer: true });

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      this.client = null;
      this.bucket = null;
      return;
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { client, bucket } = this.require();
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** A GET url that works without credentials until it expires. */
  signedGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    const { client, bucket } = this.require();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  private require(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException({
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'Media storage is not configured on this server',
      });
    }
    return { client: this.client, bucket: this.bucket };
  }
}
