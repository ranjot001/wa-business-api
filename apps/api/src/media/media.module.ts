import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, MediaRepository, StorageService],
  exports: [MediaRepository],
})
export class MediaModule {}
