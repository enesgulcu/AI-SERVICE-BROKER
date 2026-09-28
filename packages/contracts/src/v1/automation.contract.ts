import { z } from 'zod';

export const automationRunRequestV1Schema = z
  .object({
    leadId: z.uuid(),
  })
  .strict();

export const automationRunResponseV1Schema = z
  .object({
    disposition: z.enum(['ADVANCED', 'WAITING', 'COMPLETE']),
    leadId: z.uuid(),
    status: z.string().min(1),
    version: z.number().int().positive(),
    actorId: z.literal('automation'),
    reason: z.enum([
      'FIRST_CONTACT',
      'CUSTOMER_INTEREST',
      'REQUIREMENTS',
      'QUOTE',
      'FOLLOW_UP_PLANNED',
      'ACCEPTANCE',
      'MANUAL_REVIEW',
      'COMPLETE',
    ]),
    stopped: z.boolean(),
    created: z.boolean(),
  })
  .strict();

export const automationPolicyResponseV1Schema = z
  .object({
    mode: z.enum(['supervised', 'autonomous']),
    paused: z.boolean(),
    autoFirstContact: z.boolean(),
    actorId: z.literal('automation'),
    channel: z.literal('MOCK'),
    liveWhatsApp: z.literal(false),
    bindingQuote: z.literal(false),
    personalDataMode: z.enum(['synthetic', 'approved']),
  })
  .strict();

export type AutomationRunRequestV1 = z.infer<typeof automationRunRequestV1Schema>;
export type AutomationRunResponseV1 = z.infer<typeof automationRunResponseV1Schema>;
export type AutomationPolicyResponseV1 = z.infer<typeof automationPolicyResponseV1Schema>;
