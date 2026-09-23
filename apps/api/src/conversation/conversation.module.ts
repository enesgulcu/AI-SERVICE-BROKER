import { SetConversationControl } from '@ai-service-broker/conversation';
import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LeadModule, LeadPersistence } from '../lead/lead.module';
import { ConversationControlController } from './conversation-control.controller';
import { ConversationControlService } from './conversation-control.service';

@Module({
  imports: [LeadModule],
  controllers: [ConversationControlController],
  providers: [
    {
      provide: SetConversationControl,
      useFactory: (persistence: LeadPersistence) =>
        new SetConversationControl(
          persistence.conversationControl,
          { now: () => new Date() },
          { next: () => randomUUID() },
        ),
      inject: [LeadPersistence],
    },
    ConversationControlService,
  ],
})
export class ConversationModule {}
