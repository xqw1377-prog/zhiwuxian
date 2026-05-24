import type { Application } from 'express';
import { wrap, sendSuccess } from './shared';
import { validateBody } from '../middleware/validate';
import { sharesRevokeAllBodySchema, sharesRevokeBodySchema, sharesRotateBodySchema, sharesSignBodySchema } from '../schemas/shares';
import { signSharePath } from '../shares-signing';
import { ValidationError } from '../errors';
import { revokeShareTokensBefore, rotateShareTokenVersion, revokeShareTokenJti, type ShareTokenScope } from '../../src/db/shares-security-schema';
import { verifyShareToken } from '../shares-signing';

function sanitizeShareRelativePath(raw: string): string {
  const p = raw.trim().replace(/^\/+/, '');
  if (!p) throw new ValidationError('path 不能为空');
  if (p.includes('\0')) throw new ValidationError('path 非法');
  if (p.includes('..')) throw new ValidationError('path 非法');
  if (/^[a-zA-Z]+:/.test(p)) throw new ValidationError('path 非法');
  return p;
}

export function registerSharesRoutes(app: Application): void {
  app.post(
    '/api/v1/shares/sign',
    validateBody(sharesSignBodySchema),
    wrap((req, res) => {
      const userId = req.wuxianSession?.userId;
      if (!userId) throw new ValidationError('缺少会话');
      const body = req.body as { path: string; expiresInSec?: number };
      const rel = sanitizeShareRelativePath(body.path);
      const now = Math.floor(Date.now() / 1000);
      const ttl = body.expiresInSec ?? 3600;
      const exp = now + ttl;
      const token = signSharePath(userId, rel, exp);
      const encoded = rel.split('/').map(s => encodeURIComponent(s)).join('/');
      const url = `/shares/${encoded}?t=${encodeURIComponent(token)}`;
      sendSuccess(res, { token, url, expiresAtSec: exp });
    }),
  );

  app.post(
    '/api/v1/shares/revoke',
    validateBody(sharesRevokeBodySchema),
    wrap((req, res) => {
      const userId = req.wuxianSession?.userId;
      if (!userId) throw new ValidationError('缺少会话');
      const body = req.body as { token: string };
      const token = String(body.token ?? '').trim();
      const v = token ? verifyShareToken(token) : { ok: false as const };
      if (!v.ok || !v.jti || !v.uid || !v.scope) throw new ValidationError('token 无效');
      if (v.uid !== userId) throw new ValidationError('无权撤销该 token');
      revokeShareTokenJti(userId, v.scope as ShareTokenScope, v.jti);
      sendSuccess(res, { ok: true });
    }),
  );

  app.post(
    '/api/v1/shares/revoke-all',
    validateBody(sharesRevokeAllBodySchema),
    wrap((req, res) => {
      const userId = req.wuxianSession?.userId;
      if (!userId) throw new ValidationError('缺少会话');
      const body = req.body as { scope?: string };
      const scope = body.scope === 'report_poster' ? 'report_poster' : body.scope === 'all' ? 'all' : 'shares';
      const now = Math.floor(Date.now() / 1000);
      if (scope === 'all') {
        revokeShareTokensBefore(userId, 'shares', now);
        revokeShareTokensBefore(userId, 'report_poster', now);
      } else {
        revokeShareTokensBefore(userId, scope as ShareTokenScope, now);
      }
      sendSuccess(res, { ok: true, revokedBeforeSec: now });
    }),
  );

  app.post(
    '/api/v1/shares/rotate',
    validateBody(sharesRotateBodySchema),
    wrap((req, res) => {
      const userId = req.wuxianSession?.userId;
      if (!userId) throw new ValidationError('缺少会话');
      const body = req.body as { scope?: string };
      const scope = body.scope === 'report_poster' ? 'report_poster' : body.scope === 'all' ? 'all' : 'shares';
      const out: Record<string, number> = {};
      if (scope === 'all') {
        out.shares = rotateShareTokenVersion(userId, 'shares');
        out.report_poster = rotateShareTokenVersion(userId, 'report_poster');
      } else {
        out[scope] = rotateShareTokenVersion(userId, scope as ShareTokenScope);
      }
      sendSuccess(res, { ok: true, tokenVersion: out });
    }),
  );
}
