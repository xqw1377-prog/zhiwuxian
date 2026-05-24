/**
 * WUXIAN P0 · 会话鉴权（Bearer token + user_sessions）
 * 开发环境可设 WUXIAN_AUTH_RELAXED=1 放宽（仅本地/E2E）
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveSession } from '../user-wallet';
import { ForbiddenError, UnauthorizedError } from '../errors';

export interface WuxianSession {
  userId: string;
  displayName: string | null;
  token: string;
}

declare global {
  namespace Express {
    interface Request {
      wuxianSession?: WuxianSession;
    }
  }
}

const BILLING_STATIC_SEGMENTS = new Set([
  'packs',
  'wallet-status',
  'consume-warp',
  'create-order',
  'purchase-pack',
]);

export function isAuthRelaxed(): boolean {
  const flag = process.env.WUXIAN_AUTH_RELAXED?.trim().toLowerCase();
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function requestPath(req: Request): string {
  const raw = req.originalUrl ?? req.url ?? '';
  return raw.split('?')[0] || '';
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null;
  }
  const legacy = req.headers['x-wuxian-session'];
  if (typeof legacy === 'string' && legacy.trim()) return legacy.trim();
  return null;
}

export function attachSession(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }
  const session = resolveSession(token);
  if (session) {
    req.wuxianSession = { userId: session.userId, displayName: session.displayName, token };
  }
  next();
}

function pathUserId(req: Request): string | null {
  const fromParams = req.params.userId;
  if (typeof fromParams === 'string' && fromParams.trim()) return fromParams.trim();
  const q = req.query.userId;
  if (typeof q === 'string' && q.trim()) return q.trim();
  const body = req.body as { userId?: string } | undefined;
  if (body && typeof body.userId === 'string' && body.userId.trim()) return body.userId.trim();
  return null;
}

function isPublicApiRoute(method: string, path: string): boolean {
  if (path === '/api/v2/relay/providers' && method === 'GET') return true;
  if (method === 'GET' && /^\/api\/v2\/star-alliance\/verify\/[^/]+$/.test(path)) return true;
  return false;
}

function isProtectedRoute(method: string, path: string): boolean {
  if (!path.startsWith('/api/')) return false;
  if (path === '/api/v1/auth/bootstrap' || path === '/api/health' || path === '/health') return false;
  if (path.startsWith('/api/v1/companion/parent-view/') && method === 'GET') return false;
  if (path === '/api/v1/companion/parent-cheer' && method === 'POST') return false;
  if (path === '/api/v1/companion/cheer-stream' && method === 'GET') return false;
  if (path.startsWith('/api/v1/companion/recap/') && method === 'GET') return false;
  if (path.startsWith('/api/v1/companion/reports/') && method === 'GET') return false;
  if (path === '/api/v1/companion/parent-bind/claim' && method === 'POST') return false;
  if (path === '/api/v1/companion/parent/me' && method === 'GET') return false;
  if (path.startsWith('/api/v1/payment/webhook/')) return false;
  if (path === '/api/v1/payment/catalog') return false;
  if (path === '/api/v1/billing/packs' && method === 'GET') return false;

  if (isPublicApiRoute(method, path)) return false;

  if (path.startsWith('/api/v1/companion/classes')) return true;
  if (path === '/api/v1/companion/parent-bind/request' && method === 'POST') return true;

  if (path.startsWith('/api/v3.5/')) return true;
  if (path.startsWith('/api/v3/')) return true;
  if (path.startsWith('/api/v2/')) return true;

  if (path.startsWith('/api/v1/relay/')) return true;
  if (path.startsWith('/api/v1/topology/')) return true;
  if (path === '/api/v1/quantum/reversing-metrics' && method === 'GET') return true;
  if (path === '/api/v1/quantum/voice-intent' && method === 'POST') return true;
  if (path === '/api/v1/quantum/vision-intent' && method === 'POST') return true;

  if (path.startsWith('/api/v1/wallet/')) return true;
  if (path.startsWith('/api/v1/llm/')) return true;
  if (path.startsWith('/api/v1/fuel/') && path !== '/api/v1/fuel/catalog') return true;
  if (path.startsWith('/api/v1/payment/orders/')) return true;
  if (path.startsWith('/api/v1/user/certification/')) return true;
  if (path.startsWith('/api/v1/user/preferences/') && method === 'GET') return true;

  if (path === '/api/v1/user/save-config' && method === 'POST') return true;
  if (path === '/api/v1/user/preferences/language' && method === 'POST') return true;
  if (path === '/api/v1/payment/create' && method === 'POST') return true;
  if (path === '/api/v1/payment/confirm' && method === 'POST') return true;

  if (path === '/api/v1/billing/wallet-status' && method === 'GET') return true;
  if (path === '/api/v1/billing/consume-warp' && method === 'POST') return true;
  if (path === '/api/v1/billing/create-order' && method === 'POST') return true;
  if (path === '/api/v1/billing/purchase-pack' && method === 'POST') return true;

  const billingMatch = path.match(/^\/api\/v1\/billing\/([^/]+)$/);
  if (billingMatch && method === 'GET' && !BILLING_STATIC_SEGMENTS.has(billingMatch[1])) {
    return true;
  }

  if (path.startsWith('/api/v3.5/billing/status/') && method === 'GET') return true;
  if (path === '/api/v3.5/billing/topup' && method === 'POST') return true;
  if (path === '/api/v3.5/billing/escape-penalty' && method === 'POST') return true;

  if (path.match(/^\/api\/v1\/report\/cognitive\/[^/]+\/unlock$/) && method === 'POST') return true;

  if (path === '/api/v1/goal/deconstruct' && method === 'POST') return true;
  if (path === '/api/v1/goal/reroute' && method === 'POST') return true;
  if (path === '/api/v1/task/update' && method === 'POST') return true;
  if (path === '/api/v1/patrol/night' && method === 'POST') return true;
  if (path === '/api/v1/patrol/night/batch' && method === 'POST') return true;
  if (/^\/api\/v1\/goal\/[^/]+\/dashboard$/.test(path) && method === 'GET') return true;
  if (/^\/api\/v1\/goal\/[^/]+\/reroute-history$/.test(path) && method === 'GET') return true;

  return false;
}

export function enforceSessionAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isProtectedRoute(req.method, requestPath(req))) {
    next();
    return;
  }

  if (isAuthRelaxed()) {
    next();
    return;
  }

  if (!req.wuxianSession) {
    res.status(401).json({
      code: 401,
      status: 'UNAUTHORIZED',
      error: 'UNAUTHORIZED',
      message: '请携带 Authorization: Bearer <token>（先调用 POST /api/v1/auth/bootstrap）',
    });
    return;
  }

  const claimed = pathUserId(req);
  if (claimed && claimed !== req.wuxianSession.userId) {
    res.status(403).json({
      code: 403,
      status: 'FORBIDDEN',
      error: 'FORBIDDEN',
      message: '无权访问其他用户资源',
    });
    return;
  }

  next();
}

/** 路由处理器内：解析可信 userId（生产环境仅信任会话） */
export function resolveTrustedUserId(req: Request, fallback?: string): string {
  if (req.wuxianSession?.userId) return req.wuxianSession.userId;
  if (isAuthRelaxed()) {
    const id = (fallback ?? pathUserId(req) ?? '').trim();
    if (id) return id;
  }
  throw new UnauthorizedError();
}

export function assertTrustedUserId(req: Request, userId: string): void {
  if (isAuthRelaxed()) return;
  if (!req.wuxianSession) throw new UnauthorizedError();
  if (req.wuxianSession.userId !== userId) {
    throw new ForbiddenError('无权操作该用户资源');
  }
}
