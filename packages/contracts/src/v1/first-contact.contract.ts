import { z } from 'zod';
import { idempotencyKeySchema } from './lead-ingestion.contract';

export const prepareFirstContactRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
  })
  .strict();

export const prepareFirstContactResponseV1Schema = z
  .object({
    reviewId: z.uuid(),
    leadId: z.uuid(),
    disposition: z.enum(['PENDING', 'DUPLICATE']),
    draft: z.string().min(1),
    templateVersion: z.string().min(1),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const decideFirstContactRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
    decision: z.enum(['APPROVE', 'REJECT']),
  })
  .strict();

export const decideFirstContactResponseV1Schema = z
  .object({
    reviewId: z.uuid(),
    leadId: z.uuid(),
    disposition: z.enum(['APPROVED', 'REJECTED', 'DUPLICATE']),
    delivery: z.enum(['MOCK_ACCEPTED', 'NOT_SENT']),
  })
  .strict();

export type PrepareFirstContactRequestV1 = z.infer<typeof prepareFirstContactRequestV1Schema>;
export type PrepareFirstContactResponseV1 = z.infer<typeof prepareFirstContactResponseV1Schema>;
export type DecideFirstContactRequestV1 = z.infer<typeof decideFirstContactRequestV1Schema>;
export type DecideFirstContactResponseV1 = z.infer<typeof decideFirstContactResponseV1Schema>;
