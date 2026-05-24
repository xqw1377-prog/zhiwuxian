import { z } from 'zod';
import { userIdSchema } from './common';

export const reportGenerateBodySchema = z.object({
  userId: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  goalId: z.string().trim().optional(),
  courseId: z.string().trim().optional(),
}).refine(
  d => Boolean((d.userId ?? d.sessionId ?? '').trim()),
  { message: '缺少 userId / sessionId', path: ['userId'] },
);

export const reportIdParamsSchema = z.object({
  reportId: z.string().trim().min(1),
});

export const reportUnlockBodySchema = z.object({
  userId: userIdSchema,
  orderId: z.string().trim().optional(),
});

export const reportCognitiveQuerySchema = z.object({
  userId: z.string().trim().optional(),
});

export const reportPosterQuerySchema = z.object({
  token: z.string().optional(),
  t: z.string().optional(),
});

export const reportRadarQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
});
