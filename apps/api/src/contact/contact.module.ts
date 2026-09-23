import {
  DecideFirstContact,
  PrepareFirstContact,
} from '@ai-service-broker/contact';
import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LeadModule, LeadPersistence } from '../lead/lead.module';
import { FirstContactController } from './first-contact.controller';
import { FirstContactService } from './first-contact.service';

@Module({
  imports: [LeadModule],
  controllers: [FirstContactController],
  providers: [
    {
      provide: PrepareFirstContact,
      useFactory: (persistence: LeadPersistence) =>
        new PrepareFirstContact(
          persistence.firstContact,
          { now: () => new Date() },
          { next: () => randomUUID() },
        ),
      inject: [LeadPersistence],
    },
    {
      provide: DecideFirstContact,
      useFactory: (persistence: LeadPersistence) =>
        new DecideFirstContact(
          persistence.firstContact,
          { now: () => new Date() },
          { next: () => randomUUID() },
        ),
      inject: [LeadPersistence],
    },
    FirstContactService,
  ],
})
export class ContactModule {}
