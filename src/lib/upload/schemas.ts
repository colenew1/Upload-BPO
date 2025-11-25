import { z } from 'zod';

export const commitRequestSchema = z.object({
  previewId: z.string().min(1, 'previewId is required'),
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'checksum must be a SHA-256 hex string'),
  include: z
    .object({
      behaviors: z.array(z.string()).optional(),
      monthlyMetrics: z.array(z.string()).optional(),
      activityMetrics: z.array(z.string()).optional(),
    })
    .default({}),
});

export type CommitRequest = z.infer<typeof commitRequestSchema>;

