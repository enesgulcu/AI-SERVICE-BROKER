import { Module } from '@nestjs/common';
import { ContactModule } from '../contact/contact.module';
import { LeadModule, LeadPersistence } from '../lead/lead.module';
import { OperationsModule } from '../operations/operations.module';
import { OperationsService } from '../operations/operations.service';
import { FirstContactService } from '../contact/first-contact.service';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

@Module({
  imports: [LeadModule, ContactModule, OperationsModule],
  controllers: [AutomationController],
  providers: [
    {
      provide: AutomationService,
      useFactory: (
        contact: FirstContactService,
        operations: OperationsService,
        persistence: LeadPersistence,
      ) => new AutomationService(contact, operations, persistence.commercial),
      inject: [FirstContactService, OperationsService, LeadPersistence],
    },
  ],
})
export class AutomationModule {}
