import { AdvanceWorkflow } from '@ai-service-broker/workflow';
import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LeadModule, LeadPersistence } from '../lead/lead.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [LeadModule],
  controllers: [OperationsController],
  providers: [
    {
      provide: AdvanceWorkflow,
      useFactory: (persistence: LeadPersistence) =>
        new AdvanceWorkflow(
          persistence.workflow,
          { now: () => new Date() },
          { next: () => randomUUID() },
        ),
      inject: [LeadPersistence],
    },
    {
      provide: OperationsService,
      useFactory: (persistence: LeadPersistence, workflow: AdvanceWorkflow) =>
        new OperationsService(
          persistence.directory,
          persistence.requirements,
          persistence.risks,
          workflow,
          persistence.redrive,
        ),
      inject: [LeadPersistence, AdvanceWorkflow],
    },
  ],
})
export class OperationsModule {}
