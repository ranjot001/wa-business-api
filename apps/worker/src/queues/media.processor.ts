import type { Job } from 'bullmq';
import { MetaApiError, MetaClient, decrypt, parseEncryptionKey } from '@crm/shared';
import { prisma } from '@crm/db';
import type { MediaDownloadJobData } from '@crm/shared';
import type { Env } from '../env';
import type { Logger } from '../logger';
import { mediaKey, type ObjectStorage } from '../storage';

export interface MediaProcessorDeps {
  logger: Logger;
  storage: ObjectStorage;
  env: Env;
}

/**
 * Fetches one media binary from Meta and puts it in R2.
 *
 * Two hops, both needing the account's access token: ask Graph for the media
 * metadata, which carries a short lived url, then download from that url. The
 * url alone is not enough, it still requires the bearer token, which is an easy
 * thing to miss because it looks like a plain CDN link.
 */
export function createMediaProcessor(deps: MediaProcessorDeps) {
  const { logger, storage, env } = deps;
  const key = parseEncryptionKey(env.ENCRYPTION_KEY);

  return async (job: Job<MediaDownloadJobData>): Promise<{ downloaded: boolean }> => {
    const media = await prisma.media.findUnique({
      where: { id: job.data.mediaId },
      include: {
        message: {
          include: { conversation: { include: { whatsappAccount: true } } },
        },
      },
    });

    if (!media) {
      logger.warn({ mediaId: job.data.mediaId }, 'media row not found');
      return { downloaded: false };
    }

    if (media.status === 'ready') {
      // A retry after a successful put. Nothing to redo.
      logger.debug({ mediaId: media.id }, 'media already downloaded');
      return { downloaded: false };
    }

    const account = media.message.conversation.whatsappAccount;

    try {
      if (!storage.configured) {
        throw new Error('R2 is not configured, cannot store media');
      }

      const client = new MetaClient({
        accessToken: decrypt(account.accessTokenEnc, key),
        version: env.META_GRAPH_VERSION,
        onLog: (fields, message) => {
          logger.error(fields, message);
        },
      });

      const info = await client.getMedia(media.waMediaId);
      const { body, contentType } = await client.downloadMedia(info.url);

      const storageKey = mediaKey(media.workspaceId, media.id);
      await storage.put(storageKey, body, contentType ?? info.mime_type);

      await prisma.media.update({
        where: { id: media.id },
        data: {
          status: 'ready',
          storageKey,
          mimeType: info.mime_type ?? media.mimeType,
          sizeBytes: body.byteLength,
        },
      });

      logger.info({ mediaId: media.id, storageKey, bytes: body.byteLength }, 'media stored');

      return { downloaded: true };
    } catch (error) {
      const isLastAttempt = (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 1);

      // Only give up on the final attempt, so a transient Meta 500 does not
      // permanently mark the media failed while retries are still coming.
      if (isLastAttempt) {
        await prisma.media.update({
          where: { id: media.id },
          data: { status: 'failed' },
        });
      }

      const retryable = error instanceof MetaApiError ? error.isRetryable : true;

      logger.error(
        { mediaId: media.id, err: error, attempt: (job.attemptsMade ?? 0) + 1, retryable },
        'media download failed',
      );

      throw error;
    }
  };
}
