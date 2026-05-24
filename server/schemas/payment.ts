import { z } from 'zod';
import { userIdSchema, optionalMetadataSchema } from './common';

export const paymentCreateBodySchema = z.object({
  userId: userIdSchema.optional(),
  productId: z.string().trim().optional(),
  packId: z.string().trim().optional(),
  metadata: optionalMetadataSchema,
}).refine(
  d => Boolean((d.productId ?? d.packId ?? '').trim()),
  { message: '缺少 productId / packId', path: ['productId'] },
);

export const paymentConfirmBodySchema = z.object({
  orderId: z.string().trim().min(1, '缺少 orderId'),
  paymentRef: z.string().trim().optional(),
});

export const billingCreateOrderBodySchema = z.object({
  userId: userIdSchema.optional(),
  productType: z.string().trim().optional(),
  productId: z.string().trim().optional(),
  metadata: optionalMetadataSchema,
}).refine(
  d => Boolean((d.productType ?? d.productId ?? '').trim()),
  { message: '缺少 productType / productId', path: ['productType'] },
);

export const billingConsumeWarpBodySchema = z.object({
  userId: userIdSchema.optional(),
  videoDurationMinutes: z.coerce.number().positive('videoDurationMinutes 必须 > 0'),
  goalId: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  videoId: z.string().trim().optional(),
});

export const billingPurchasePackBodySchema = z.object({
  userId: userIdSchema.optional(),
  packId: z.string().trim().min(1, '缺少 packId'),
});

export const billingWalletStatusQuerySchema = z.object({
  userId: userIdSchema,
});

export const userSaveConfigBodySchema = z.object({
  userId: userIdSchema.optional(),
  apiKey: z.string().optional(),
  ltcCode: z.string().optional(),
});

export const userLanguageBodySchema = z.object({
  userId: userIdSchema.optional(),
  lang: z.enum(['zh', 'en'], { message: 'lang 必须为 zh | en' }),
  syncCloud: z.union([z.boolean(), z.string()]).optional(),
});
