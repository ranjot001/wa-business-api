import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { MediaModule } from '../media/media.module';
import { MessageQueueService } from './message-queue.service';
import { ConversationMessagesController, MessagesController } from './messages.controller';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';

@Module({
  imports: [ConversationsModule, MediaModule],
  controllers: [ConversationMessagesController, MessagesController],
  providers: [MessagesService, MessagesRepository, MessageQueueService],
})
export class MessagesModule {}
