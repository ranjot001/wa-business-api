import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Workspace } from '@crm/db';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import {
  MAX_UPLOAD_BYTES,
  MediaService,
  type UploadedMediaFile,
  type UploadedMediaView,
} from './media.service';

@Controller('media')
@UseGuards(WorkspaceGuard, RolesGuard)
@Roles('agent')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * Multipart, one file in the "file" field. Held in memory, which the 16 MB
   * cap keeps bounded; multer answers an oversized file with 413 before the
   * handler runs.
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(
    @CurrentWorkspace() workspace: Workspace,
    @UploadedFile() file: UploadedMediaFile | undefined,
  ): Promise<UploadedMediaView> {
    return this.media.upload(workspace.id, file);
  }

  @Get(':id/url')
  url(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ url: string; expires_at: string }> {
    return this.media.signedUrl(workspace.id, id);
  }
}
