import { z } from 'zod';
import { idempotencyKeySchema } from './lead-ingestion.contract';

export const setConversationControlRequestV1Schema = z
  .object({
    actorId: idempotencyKeySchema,
    controlMode: z.enum(['AI_ACTIVE', 'HUMAN_CONTROL', 'PAUSED']),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const setConversationControlResponseV1Schema = z
  .object({
    conversationId: z.uuid(),
    controlMode: z.enum(['AI_ACTIVE', 'HUMAN_CONTROL', 'PAUSED']),
    version: z.number().int().positive(),
    disposition: z.enum(['CHANGED', 'DUPLICATE', 'UNCHANGED']),
    automatedReplyAllowed: z.boolean(),
  })
  .strict();

export type SetConversationControlRequestV1 = z.infer<typeof setConversationControlRequestV1Schema>;
export type SetConversationControlResponseV1 = z.infer<
  typeof setConversationControlResponseV1Schema
>;
