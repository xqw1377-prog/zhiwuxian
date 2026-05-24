import { z } from 'zod';
import { userIdSchema } from './common';

export const telemetryEventSchema = z.object({
  ts: z.string().optional(),
  type: z.string().min(1),
  payload: z.unknown().optional(),
});

export const telemetryIngestBodySchema = z.object({
  userId: userIdSchema,
  sessionId: z.string().trim().optional(),
  events: z.array(telemetryEventSchema).min(1, '缺少 events'),
});

export const telemetryAggregateQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
});
