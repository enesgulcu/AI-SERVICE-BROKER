import { z } from 'zod';
import { idempotencyKeySchema } from './lead-ingestion.contract';

export const advanceWorkflowRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
    toStatus: z.enum([
      'NEW',
      'CONTACT_PENDING',
      'CONTACTED',
      'INTERESTED',
      'NO_RESPONSE',
      'MANUAL_REVIEW',
      'CLOSED_LOST',
      'ANALYZED',
      'QUALIFYING',
      'QUALIFIED',
      'QUOTE_READY',
      'QUOTE_SENT',
      'NEGOTIATING',
      'CUSTOMER_ACCEPTED',
      'JOB_READY',
      'BLOCKED',
    ]),
    expectedVersion: z.number().int().positive(),
    reasonCode: z.enum(['WITHDRAWN', 'NOT_INTERESTED', 'DUPLICATE', 'INVALID_CONTACT']).optional(),
  })
  .strict();

export const advanceWorkflowResponseV1Schema = z
  .object({
    leadId: z.uuid(),
    disposition: z.enum(['CHANGED', 'DUPLICATE']),
    fromStatus: z.string().min(1),
    toStatus: z.string().min(1),
    version: z.number().int().positive(),
    policyVersion: z.literal('workflow-v1'),
    reasonCode: z.string().min(1),
  })
  .strict();

export type AdvanceWorkflowRequestV1 = z.infer<typeof advanceWorkflowRequestV1Schema>;
export type AdvanceWorkflowResponseV1 = z.infer<typeof advanceWorkflowResponseV1Schema>;
