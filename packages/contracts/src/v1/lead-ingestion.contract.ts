import { z } from 'zod';

const requiredText = (maxLength: number) => z.string().trim().min(1).max(maxLength);
const optionalText = (maxLength: number) => z.string().trim().min(1).max(maxLength).optional();

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+$/);

export const ingestLeadRequestV1Schema = z
  .object({
    source: requiredText(64).regex(/^[A-Za-z0-9_-]+$/),
    sourceReference: requiredText(256),
    customerName: optionalText(160),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/),
    city: optionalText(120),
    district: optionalText(120),
    listingTitle: optionalText(500),
    listingText: optionalText(10_000),
    publishedAt: z.iso.datetime({ offset: true }).optional(),
    rawData: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const ingestLeadResponseV1Schema = z
  .object({
    leadId: z.uuid(),
    disposition: z.enum(['CREATED', 'DUPLICATE']),
  })
  .strict();

export type IngestLeadRequestV1 = z.infer<typeof ingestLeadRequestV1Schema>;
export type IngestLeadResponseV1 = z.infer<typeof ingestLeadResponseV1Schema>;
