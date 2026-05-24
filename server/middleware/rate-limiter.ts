/**
 * WUXIAN Wave 1 · 请求频次限制
 * 防止恶意高频投喂长视频耗尽 OpenAI / yt-dlp 配额
 */

import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const WINDOW_MS = envInt('WUXIAN_RATE_WINDOW_MS', 60_000);
const ASSIMILATE_MAX = envInt('WUXIAN_RATE_ASSIMILATE_PER_MIN', 12);
const VIDEO_MAX = envInt('WUXIAN_RATE_VIDEO_PER_MIN', 6);
const PAYMENT_MAX = envInt('WUXIAN_RATE_PAYMENT_PER_MIN', 30);
const GLOBAL_MAX = envInt('WUXIAN_RATE_GLOBAL_API_PER_MIN', 120);
const AUTH_BOOTSTRAP_MAX = envInt('WUXIAN_RATE_AUTH_BOOTSTRAP_PER_MIN', 20);

function clientKey(req: Request): string {
  const userId = req.wuxianSession?.userId;
  const ip = req.ip
    ?? (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? 'unknown';
  return userId ? `u:${userId}` : `ip:${ip}`;
}

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets.entries()) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

function hit(key: string, limit: number): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  pruneExpiredBuckets(now);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
  return { ok: bucket.count <= limit, remaining, retryAfterSec };
}

function limiter(name: string, limit: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${clientKey(req)}`;
    const result = hit(key, limit);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (!result.ok) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      res.status(429).json({
        code: 429,
        status: 'RATE_LIMITED',
        error: 'TOO_MANY_REQUESTS',
        message: '请求过于频繁，请稍后再试。长视频同化正在保护算力配额。',
        retryAfterSec: result.retryAfterSec,
      });
      return;
    }
    next();
  };
}

export const rateLimitGlobalApi = limiter('global', GLOBAL_MAX);
export const rateLimitAssimilate = limiter('assimilate', ASSIMILATE_MAX);
export const rateLimitVideo = limiter('video', VIDEO_MAX);
export const rateLimitPayment = limiter('payment', PAYMENT_MAX);
export const rateLimitAuthBootstrap = limiter('auth_bootstrap', AUTH_BOOTSTRAP_MAX);

/** 仅对含 http 链接的投喂加强限制 */
export function rateLimitVideoUrlPayload(req: Request, res: Response, next: NextFunction) {
  const raw = String(req.body?.rawInput ?? req.body?.videoUrl ?? '');
  if (!/https?:\/\//i.test(raw)) {
    next();
    return;
  }
  rateLimitVideo(req, res, next);
}
