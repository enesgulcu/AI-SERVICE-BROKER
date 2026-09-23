import { AdvanceWorkflow } from '@ai-service-broker/workflow';
import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LeadModule, LeadPersistence } from '../lead/lead.module';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [LeadModule],
  controllers: [WorkflowController],
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
    WorkflowService,
  ],
})
export class WorkflowModule {}
