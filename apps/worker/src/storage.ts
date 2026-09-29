import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Env } from './env';

/**
 * Cloudflare R2, through the S3 API.
 *
 * R2 is S3 compatible but not S3: it wants a fixed region of "auto" and an
 * account specific endpoint, and it does not support every S3 feature. Only
 * PutObject is used here.
 */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType?: string): Promise<void>;
  readonly configured: boolean;
}

export function createStorage(env: Env): ObjectStorage {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;

  // Local development and CI have no R2. Rather than fail at boot, storage
  // reports itself unconfigured and the media processor marks downloads failed
  // with a clear reason instead of throwing something cryptic.
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return {
      configured: false,
      put(): Promise<void> {
        return Promise.reject(new Error('R2 is not configured: set R2_* in the environment'));
      },
    };
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  return {
    configured: true,
    async put(key, body, contentType): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ...(contentType ? { ContentType: contentType } : {}),
        }),
      );
    },
  };
}

/** Where one workspace's media lives. */
export function mediaKey(workspaceId: string, mediaId: string): string {
  return `ws/${workspaceId}/media/${mediaId}`;
}
