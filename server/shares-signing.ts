import { createHmac, timingSafeEqual } from 'crypto';
import {
  getShareTokenPolicy,
  isShareTokenJtiRevoked,
  type ShareTokenScope,
} from '../src/db/shares-security-schema';

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? padded : padded + '='.repeat(4 - (padded.length % 4));
  return Buffer.from(pad, 'base64');
}

function sharesSigningKey(): string {
  const key = process.env.WUXIAN_SHARES_SIGNING_KEY?.trim() || process.env.DB_ENCRYPTION_KEY?.trim() || '';
  if (!key && process.env.NODE_ENV === 'production') {
    throw new Error('WUXIAN_SHARES_SIGNING_KEY 未配置');
  }
  return key || 'dev-wuxian-shares-signing-key';
}

function sharesRequireToken(): boolean {
  const v = process.env.WUXIAN_SHARES_REQUIRE_TOKEN?.trim().toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function encodeSharePathSegments(rel: string): string {
  return rel.split('/').map(s => encodeURIComponent(s)).join('/');
}

export function extractShareRelativePath(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  let p = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      p = new URL(raw).pathname;
    } catch {
      return null;
    }
  }
  p = p.split('?')[0].split('#')[0];
  if (p.startsWith('/shares/')) return p.slice('/shares/'.length);
  if (p.startsWith('shares/')) return p.slice('shares/'.length);
  if (p.startsWith('/')) return null;
  return p;
}

export function buildShareUrl(sharePathOrRel: string, expiresInSec = 3600, userId?: string): string {
  const rel = extractShareRelativePath(sharePathOrRel);
  if (!rel) return sharePathOrRel;
  const encoded = encodeSharePathSegments(rel);
  if (!sharesRequireToken()) return `/shares/${encoded}`;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.max(30, Math.min(7 * 86400, Math.floor(expiresInSec)));
  const token = signTokenV2({
    userId: userId?.trim() || 'public',
    scope: 'shares',
    key: rel,
    issuedAtSec: now,
    expiresAtSec: exp,
  });
  return `/shares/${encoded}?t=${encodeURIComponent(token)}`;
}

function hmac(payload: string): string {
  return base64UrlEncode(createHmac('sha256', sharesSigningKey()).update(payload, 'utf8').digest());
}

function newJti(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

type TokenV2Payload = {
  v: number;
  uid: string;
  scope: ShareTokenScope;
  iat: number;
  exp: number;
  jti: string;
  key: string;
};

function encodePayloadJson(payload: TokenV2Payload): string {
  return base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
}

function decodePayloadJson(encoded: string): TokenV2Payload | null {
  try {
    const raw = base64UrlDecode(encoded).toString('utf8');
    const obj = JSON.parse(raw) as Partial<TokenV2Payload>;
    if (!obj || typeof obj !== 'object') return null;
    const v = Number(obj.v);
    const iat = Number(obj.iat);
    const exp = Number(obj.exp);
    const uid = typeof obj.uid === 'string' ? obj.uid.trim() : '';
    const scope =
      obj.scope === 'report_poster'
        ? 'report_poster'
        : obj.scope === 'parent_link'
          ? 'parent_link'
          : 'shares';
    const jti = typeof obj.jti === 'string' ? obj.jti.trim() : '';
    const key = typeof obj.key === 'string' ? obj.key.trim() : '';
    if (!Number.isFinite(v) || v < 1) return null;
    if (!Number.isFinite(iat) || iat <= 0) return null;
    if (!Number.isFinite(exp) || exp <= 0) return null;
    if (!uid || uid.length > 128) return null;
    if (!jti || jti.length > 64) return null;
    if (!key || key.length > 3000) return null;
    return { v, uid, scope, iat, exp, jti, key };
  } catch {
    return null;
  }
}

function signTokenV2(input: {
  userId: string;
  scope: ShareTokenScope;
  key: string;
  issuedAtSec: number;
  expiresAtSec: number;
}): string {
  const uid = input.userId.trim() || 'public';
  const scope = input.scope;
  const key = input.key.trim();
  const iat = Math.max(1, Math.floor(input.issuedAtSec));
  const exp = Math.max(iat + 1, Math.floor(input.expiresAtSec));
  const policy = getShareTokenPolicy(uid, scope);
  const payload: TokenV2Payload = {
    v: policy.tokenVersion,
    uid,
    scope,
    iat,
    exp,
    jti: newJti(),
    key,
  };
  const payloadEncoded = encodePayloadJson(payload);
  const sig = hmac(payloadEncoded);
  return `${payloadEncoded}.${sig}`;
}

export function signSharePath(userId: string, path: string, expiresAtSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  return signTokenV2({
    userId,
    scope: 'shares',
    key: path,
    issuedAtSec: now,
    expiresAtSec: Math.floor(expiresAtSec),
  });
}

export function buildReportPosterUrl(reportId: string, userId: string, expiresInSec: number): string {
  const rid = reportId.trim();
  const uid = userId.trim() || 'public';
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.max(60, Math.min(3650 * 86400, Math.floor(expiresInSec)));
  const token = signTokenV2({
    userId: uid,
    scope: 'report_poster',
    key: rid,
    issuedAtSec: now,
    expiresAtSec: exp,
  });
  return `/api/v1/report/cognitive/${encodeURIComponent(rid)}/poster.svg?t=${encodeURIComponent(token)}`;
}

export function signParentLinkToken(studentId: string, expiresInSec = 30 * 86400): { token: string; expiresAtSec: number } {
  const uid = studentId.trim();
  if (!uid) throw new Error('studentId 不能为空');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.max(60, Math.min(3650 * 86400, Math.floor(expiresInSec)));
  const token = signTokenV2({
    userId: uid,
    scope: 'parent_link',
    key: uid,
    issuedAtSec: now,
    expiresAtSec: exp,
  });
  return { token, expiresAtSec: exp };
}

export function verifyShareToken(token: string): {
  ok: boolean;
  uid?: string;
  scope?: ShareTokenScope;
  key?: string;
  expiresAtSec?: number;
  issuedAtSec?: number;
  jti?: string;
  legacy?: boolean;
} {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false };
  const sig = parts[1];
  const payloadEncoded = parts[0];
  const expected = hmac(payloadEncoded);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false };
  } catch {
    return { ok: false };
  }
  const now = Math.floor(Date.now() / 1000);

  const v2 = decodePayloadJson(payloadEncoded);
  if (v2) {
    if (v2.exp < now) return { ok: false };
    const policy = getShareTokenPolicy(v2.uid, v2.scope);
    if (v2.v !== policy.tokenVersion) return { ok: false };
    if (v2.iat < policy.revokedBefore) return { ok: false };
    if (isShareTokenJtiRevoked(v2.uid, v2.scope, v2.jti)) return { ok: false };
    return {
      ok: true,
      uid: v2.uid,
      scope: v2.scope,
      key: v2.key,
      expiresAtSec: v2.exp,
      issuedAtSec: v2.iat,
      jti: v2.jti,
      legacy: false,
    };
  }

  let payloadRaw = '';
  try {
    payloadRaw = base64UrlDecode(payloadEncoded).toString('utf8');
  } catch {
    return { ok: false };
  }
  const idx = payloadRaw.indexOf('.');
  if (idx <= 0) return { ok: false };
  const exp = Number(payloadRaw.slice(0, idx));
  const p = payloadRaw.slice(idx + 1);
  if (!Number.isFinite(exp) || exp <= 0) return { ok: false };
  if (!p || p.length > 3000) return { ok: false };
  if (exp < now) return { ok: false };
  return { ok: true, uid: 'public', scope: 'shares', key: p, expiresAtSec: exp, issuedAtSec: 0, jti: '', legacy: true };
}
