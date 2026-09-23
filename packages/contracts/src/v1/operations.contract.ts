import { z } from 'zod';
import { idempotencyKeySchema } from './lead-ingestion.contract';

const requirementFieldSchema = z
  .object({
    name: z.string().min(1).max(40),
    value: z.string().min(1).max(40),
    confidence: z.number().min(0).max(1),
    source: z.enum(['HUMAN', 'FAKE_MODEL']),
  })
  .strict();

export const confirmRequirementsRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
    expectedVersion: z.number().int().positive(),
    fields: z.array(requirementFieldSchema).max(8),
    specialRequirements: z.array(z.string().min(1).max(40)).max(3),
  })
  .strict();

export const extractRequirementsRequestV1Schema = z
  .object({
    text: z.string().max(500).optional(),
    fields: z.array(requirementFieldSchema).max(8),
  })
  .strict();

export const recordRiskRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
    code: z.enum(['ABUSE_LANGUAGE', 'SENSITIVE_DATA', 'CONTRADICTION']),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  })
  .strict();

export const outboundDeliveryRequestV1Schema = z
  .object({
    channel: z.string().min(1).max(32),
    origin: z.enum(['AI', 'HUMAN']),
    controlMode: z.enum(['AI_ACTIVE', 'HUMAN_CONTROL', 'PAUSED']),
    templateApproved: z.boolean(),
  })
  .strict();

export const closedActionRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
  })
  .strict();

export type ConfirmRequirementsRequestV1 = z.infer<typeof confirmRequirementsRequestV1Schema>;
export type ExtractRequirementsRequestV1 = z.infer<typeof extractRequirementsRequestV1Schema>;
export type RecordRiskRequestV1 = z.infer<typeof recordRiskRequestV1Schema>;
export type OutboundDeliveryRequestV1 = z.infer<typeof outboundDeliveryRequestV1Schema>;
export type ClosedActionRequestV1 = z.infer<typeof closedActionRequestV1Schema>;
