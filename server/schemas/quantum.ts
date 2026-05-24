import { z } from 'zod';
import { userIdSchema } from './common';

const optionalUserId = z.string().trim().max(128).optional();

export const quantumAssimilateBodySchema = z.object({
  rawInput: z.string().trim().min(1, '缺少 rawInput'),
  userId: optionalUserId,
  sessionId: z.string().trim().optional(),
});

export const quantumPulseBodySchema = z.object({
  userId: optionalUserId,
  sessionId: z.string().trim().optional(),
});

export const quantumPulseQuerySchema = z.object({
  userId: z.string().trim().max(128).optional(),
  sessionId: z.string().trim().optional(),
});

export const quantumCompleteBodySchema = z.object({
  userId: optionalUserId,
  sessionId: z.string().trim().min(1, '缺少 sessionId'),
  nodeId: z.string().trim().optional(),
  userName: z.string().trim().optional(),
});

export const quantumStarcardBodySchema = z.object({
  userId: optionalUserId,
  sessionId: z.string().trim().optional(),
});

export const quantumIntentBodySchema = z.object({
  rawInput: z.string().trim().min(1, '意图投喂流不能为空'),
});

export const reversingMetricsQuerySchema = z.object({
  userId: userIdSchema,
});

export const reversingAdvanceBodySchema = z.object({
  userId: userIdSchema,
  delta: z.coerce.number().positive('delta 必须为正数').optional().default(1),
});

export const reversePlanBodySchema = z.object({
  userId: userIdSchema,
  targetDestination: z.string().trim().min(1, '缺少 targetDestination'),
  currentStatus: z.string().trim().min(1, '缺少 currentStatus'),
  daysToDeadline: z.coerce.number().positive('daysToDeadline 必须为正数').optional(),
  days: z.coerce.number().positive().optional(),
});

export const topologyTelemetryHitBodySchema = z.object({
  userId: userIdSchema,
  matchedConcept: z.string().trim().min(1, '缺少 matchedConcept'),
  screenshotData: z.string().optional(),
  captureType: z.string().optional(),
  parentGoalId: z.string().optional(),
  sessionId: z.string().optional(),
});

export const topologyVisionInterceptBodySchema = z.object({
  userId: userIdSchema,
  intentText: z.string().optional(),
  screenshotData: z.string().optional(),
  parentGoalId: z.string().optional(),
  sessionId: z.string().optional(),
  nodeResolved: z.boolean().optional(),
  resolved: z.boolean().optional(),
});

export const relayToggleBodySchema = z.object({
  userId: userIdSchema,
  enabled: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const relayDispatchBodySchema = z.object({
  userId: userIdSchema.optional(),
  consumerUserId: userIdSchema.optional(),
  screenshotData: z.string().optional(),
  userHint: z.string().optional(),
  matchedConcept: z.string().optional(),
}).refine(d => Boolean((d.userId ?? d.consumerUserId ?? '').trim()), {
  message: '缺少 userId',
  path: ['userId'],
});

export const relayReferralBodySchema = z.object({
  referrerUserId: userIdSchema,
  inviteeUserId: userIdSchema.optional(),
  userId: userIdSchema.optional(),
  inviteToken: z.string().optional(),
  inviteCode: z.string().optional(),
}).refine(d => Boolean((d.inviteeUserId ?? d.userId ?? '').trim()), {
  message: '缺少 inviteeUserId',
  path: ['inviteeUserId'],
});
