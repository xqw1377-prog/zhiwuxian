import Redis from 'ioredis';
import type { Request, Response, NextFunction } from 'express';

let redis: Redis | null = null;
let redisAvailable = false;

function envInt(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const WINDOW_MS = envInt('WUXIAN_RATE_WINDOW_MS', 60_000);
const ASSIMILATE_MAX = envInt('WUXIAN_RATE_ASSIMILATE_PER_MIN', 12);
const VIDEO_MAX = envInt('WUXIAN_RATE_VIDEO_PER_MIN', 6);
const PAYMENT_MAX = envInt('WUXIAN_RATE_PAYMENT_PER_MIN', 30);
const GLOBAL_MAX = envInt('WUXIAN_RATE_GLOBAL_API_PER_MIN', 120);
const AUTH_BOOTSTRAP_MAX = envInt('WUXIAN_RATE_AUTH_BOOTSTRAP_PER_MIN', 20);

export function initRedisRateLimiter(): void {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    console.log('[RateLimit] Redis 未配置，使用内存模式');
    return;
  }
  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 1000)),
      lazyConnect: true,
    });
    redis.on('error', (err) => {
      console.warn('[RateLimit] Redis 连接错误，降级到内存模式:', err.message);
      redisAvailable = false;
    });
    redis.on('ready', () => {
      redisAvailable = true;
      console.log('[RateLimit] Redis 已就绪');
    });
    redis.connect().catch(() => {
      redisAvailable = false;
    });
  } catch {
    console.warn('[RateLimit] Redis 初始化失败，使用内存模式');
    redisAvailable = false;
  }
}

function clientKey(req: Request): string {
  const session = (req as unknown as { wuxianSession?: { userId: string } }).wuxianSession;
  const userId = session?.userId ?? null;
  const ip = req.ip
    ?? (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? 'unknown';
  return userId ? `u:${userId}` : `ip:${ip}`;
}

interface Bucket {
  count: number;
  resetAt: number;
}

function createLimiter(name: string, limit: number) {
  const memBuckets = new Map<string, Bucket>();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `${name}:${clientKey(req)}`;

    if (redisAvailable && redis) {
      try {
        const now = Date.now();
        const windowKey = Math.floor(now / WINDOW_MS);
        const redisKey = `ratelimit:${name}:${windowKey}:${key}`;
        const count = await redis.incr(redisKey);
        if (count === 1) await redis.pexpire(redisKey, WINDOW_MS);
        const remaining = Math.max(0, limit - count);
        res.setHeader('X-RateLimit-Limit', String(limit));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        if (count > limit) {
          res.setHeader('Retry-After', String(Math.ceil(WINDOW_MS / 1000)));
          res.status(429).json({
            code: 429,
            status: 'RATE_LIMITED',
            error: 'TOO_MANY_REQUESTS',
            retryAfterSec: Math.ceil(WINDOW_MS / 1000),
          });
          return;
        }
        next();
        return;
      } catch {
        redisAvailable = false;
      }
    }

    const now = Date.now();
    let bucket = memBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      memBuckets.set(key, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, limit - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({
        code: 429,
        status: 'RATE_LIMITED',
        error: 'TOO_MANY_REQUESTS',
        retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
      });
      return;
    }
    next();
  };
}

export const rateLimitGlobalApi = createLimiter('global', GLOBAL_MAX);
export const rateLimitAssimilate = createLimiter('assimilate', ASSIMILATE_MAX);
export const rateLimitVideo = createLimiter('video', VIDEO_MAX);
export const rateLimitPayment = createLimiter('payment', PAYMENT_MAX);
export const rateLimitAuthBootstrap = createLimiter('auth_bootstrap', AUTH_BOOTSTRAP_MAX);

export function rateLimitVideoUrlPayload(req: Request, res: Response, next: NextFunction): void {
  const raw = String(req.body?.rawInput ?? req.body?.videoUrl ?? '');
  if (!/https?:\/\//i.test(raw)) {
    next();
    return;
  }
  rateLimitVideo(req, res, next);
}
