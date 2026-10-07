import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ERROR_CODES, mediaKey } from '@crm/shared';
import { MediaRepository } from './media.repository';
import { StorageService } from './storage.service';

/** Meta's ceiling for video and audio, and the task's for every upload. */
export const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

/** How long a signed media url stays valid. */
const SIGNED_URL_TTL_SECONDS = 15 * 60;

/** The parts of a multer file this service reads. */
export interface UploadedMediaFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

export interface UploadedMediaView {
  media_id: string;
  mime_type: string;
  size_bytes: number;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly media: MediaRepository,
    private readonly storage: StorageService,
  ) {}

  /**
   * Store the file in R2 first, then create the row. The other order would
   * leave a ready row pointing at nothing if the put failed; this order at
   * worst leaves an orphan object nobody references.
   */
  async upload(
    workspaceId: string,
    file: UploadedMediaFile | undefined,
  ): Promise<UploadedMediaView> {
    if (!file || file.size === 0) {
      throw new BadRequestException({
        code: ERROR_CODES.BAD_REQUEST,
        message: 'Attach a non empty file in the "file" field',
      });
    }

    const id = randomUUID();
    const storageKey = mediaKey(workspaceId, id);
    const mimeType = file.mimetype || 'application/octet-stream';

    await this.storage.put(storageKey, file.buffer, mimeType);

    const row = await this.media.createUploaded({
      id,
      workspaceId,
      mimeType,
      sizeBytes: file.size,
      storageKey,
    });

    return { media_id: row.id, mime_type: mimeType, size_bytes: file.size };
  }

  async signedUrl(workspaceId: string, id: string): Promise<{ url: string; expires_at: string }> {
    const media = await this.media.find(workspaceId, id);

    if (!media) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND, message: 'Media not found' });
    }

    if (media.status !== 'ready' || !media.storageKey) {
      throw new ConflictException({
        code: ERROR_CODES.MEDIA_NOT_READY,
        message: `Media is ${media.status}, not ready`,
        details: { status: media.status },
      });
    }

    const url = await this.storage.signedGetUrl(media.storageKey, SIGNED_URL_TTL_SECONDS);

    return {
      url,
      expires_at: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }
}
