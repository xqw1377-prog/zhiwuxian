import { z } from 'zod';
import { userIdSchema } from './common';

export const llmProviderSchema = z.enum(['deepseek', 'qwen'], { message: 'provider 必须为 deepseek | qwen' });

export const userLlmConfigParamsSchema = z.object({
  userId: userIdSchema,
});

export const userLlmConfigUpsertBodySchema = z.object({
  userId: userIdSchema.optional(),
  provider: llmProviderSchema,
  apiKey: z.string().optional(),
  clearKey: z.coerce.boolean().optional(),
  baseURL: z.string().optional(),
  model: z.string().optional(),
});
