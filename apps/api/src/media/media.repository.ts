import { Injectable } from '@nestjs/common';
import { prisma, type Media } from '@crm/db';
import { WorkspaceScopedRepository } from '../common/repositories/workspace-scoped.repository';

@Injectable()
export class MediaRepository extends WorkspaceScopedRepository {
  constructor() {
    super(prisma);
  }

  find(workspaceId: string, id: string): Promise<Media | null> {
    return this.prisma.media.findFirst({ where: this.scope(workspaceId, { id }) });
  }

  /** An uploaded file: already in R2, so ready, and not yet tied to a message. */
  createUploaded(data: {
    id: string;
    workspaceId: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
  }): Promise<Media> {
    return this.prisma.media.create({ data: { ...data, status: 'ready' } });
  }
}
