import { z } from 'zod';

export const acceptInboundRequestV1Schema = z
  .object({
    leadId: z.uuid(),
    providerMessageId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._:-]{1,256}$/),
    body: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const acceptInboundResponseV1Schema = z
  .object({
    disposition: z.enum(['RECORDED', 'DUPLICATE']),
    customerId: z.uuid(),
    conversationId: z.uuid(),
    messageId: z.uuid(),
    controlMode: z.enum(['AI_ACTIVE', 'HUMAN_CONTROL', 'PAUSED']),
    identityVerified: z.literal(false),
  })
  .strict();

export type AcceptInboundRequestV1 = z.infer<typeof acceptInboundRequestV1Schema>;
export type AcceptInboundResponseV1 = z.infer<typeof acceptInboundResponseV1Schema>;
