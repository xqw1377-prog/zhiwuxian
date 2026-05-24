import { z } from 'zod';
import { userIdSchema } from './common';

export const videoAssimilateBodySchema = z.object({
  userId: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  goalId: z.string().trim().optional(),
  videoUrl: z.string().trim().optional(),
  simulate: z.boolean().optional(),
  videoDurationMinutes: z.coerce.number().positive().optional(),
  payload: z.record(z.unknown()).optional(),
}).passthrough().refine(
  d => Boolean(String(d.userId ?? d.sessionId ?? '').trim()),
  { message: '缺少 userId / sessionId', path: ['userId'] },
);

export const videoReserveQuerySchema = z.object({
  userId: z.string().trim().max(128).optional(),
});

export const videoResolveClipBodySchema = z.object({
  userId: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  courseId: z.string().trim().optional(),
  currentTimestamp: z.coerce.number().optional(),
  telemetryData: z.unknown().optional(),
  topic: z.string().trim().optional(),
  minWormholeValue: z.coerce.number().optional(),
}).passthrough().refine(
  d => Boolean(String(d.userId ?? d.sessionId ?? '').trim()),
  { message: '缺少 userId / sessionId', path: ['userId'] },
);

export const courseIdParamsSchema = z.object({
  courseId: z.string().trim().min(1),
});
