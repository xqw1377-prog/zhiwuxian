import { z } from 'zod';

export const sharesSignBodySchema = z.object({
  path: z.string().trim().min(1).max(3000),
  expiresInSec: z.number().int().min(30).max(7 * 86400).optional(),
});

export const sharesRevokeBodySchema = z.object({
  token: z.string().trim().min(8).max(8192),
});

export const sharesRevokeAllBodySchema = z.object({
  scope: z.enum(['shares', 'report_poster', 'all']).optional(),
});

export const sharesRotateBodySchema = z.object({
  scope: z.enum(['shares', 'report_poster', 'all']).optional(),
});
