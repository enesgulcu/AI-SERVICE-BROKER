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
    templateVersion: z.string().min(1).max(64),
  })
  .strict();

export const deliveryCallbackRequestV1Schema = z
  .object({
    channel: z.string().min(1).max(32),
    templateVersion: z.string().min(1).max(64),
    providerEventId: z.string().regex(/^[a-zA-Z0-9._:-]{8,128}$/),
    status: z.enum(['DELIVERED', 'FAILED']),
  })
  .strict();

export const closedActionRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
  })
  .strict();

export const sandboxQuoteRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
    leadId: z.string().uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();

export const negotiationRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
    leadId: z.string().uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    discountBps: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const followUpRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
    leadId: z.string().uuid().optional(),
  })
  .strict();

export const acceptanceRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const providerDeliveryRequestV1Schema = z
  .object({
    channel: z.enum(['MOCK', 'WHATSAPP']),
    templateVersion: z.string().min(1).max(64),
    mode: z.enum(['disabled', 'sandbox']),
  })
  .strict();

export type ConfirmRequirementsRequestV1 = z.infer<typeof confirmRequirementsRequestV1Schema>;
export type ExtractRequirementsRequestV1 = z.infer<typeof extractRequirementsRequestV1Schema>;
export type RecordRiskRequestV1 = z.infer<typeof recordRiskRequestV1Schema>;
export type OutboundDeliveryRequestV1 = z.infer<typeof outboundDeliveryRequestV1Schema>;
export type DeliveryCallbackRequestV1 = z.infer<typeof deliveryCallbackRequestV1Schema>;
export type ClosedActionRequestV1 = z.infer<typeof closedActionRequestV1Schema>;
export type SandboxQuoteRequestV1 = z.infer<typeof sandboxQuoteRequestV1Schema>;
export type NegotiationRequestV1 = z.infer<typeof negotiationRequestV1Schema>;
export type FollowUpRequestV1 = z.infer<typeof followUpRequestV1Schema>;
export type AcceptanceRequestV1 = z.infer<typeof acceptanceRequestV1Schema>;
export type ProviderDeliveryRequestV1 = z.infer<typeof providerDeliveryRequestV1Schema>;
