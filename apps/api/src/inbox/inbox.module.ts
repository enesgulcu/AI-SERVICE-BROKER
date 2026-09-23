import { AcceptInboundMessage } from '@ai-service-broker/conversation';
import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LeadModule, LeadPersistence } from '../lead/lead.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [LeadModule],
  controllers: [InboxController],
  providers: [
    {
      provide: AcceptInboundMessage,
      useFactory: (persistence: LeadPersistence) =>
        new AcceptInboundMessage(
          persistence.inbound,
          { now: () => new Date() },
          { next: () => randomUUID() },
        ),
      inject: [LeadPersistence],
    },
    InboxService,
  ],
})
export class InboxModule {}
