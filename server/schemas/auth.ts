import { z } from 'zod';
import { userIdSchema } from './common';

export const authBootstrapBodySchema = z.object({
  token: z.string().trim().optional(),
  userId: userIdSchema.optional(),
  deviceId: z.string().trim().max(256).optional(),
  displayName: z.string().trim().max(64).optional(),
});

export type AuthBootstrapBody = z.infer<typeof authBootstrapBodySchema>;
