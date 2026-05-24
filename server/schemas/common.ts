import { z } from 'zod';

export const userIdSchema = z.string().trim().min(1, 'userId 不能为空').max(128);

export const userIdParamsSchema = z.object({
  userId: userIdSchema,
});

export const optionalMetadataSchema = z.record(z.string()).optional();
