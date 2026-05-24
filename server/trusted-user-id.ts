/**
 * WUXIAN · 生产环境可信 userId 解析（与 session-auth 配合）
 */

import type { Request } from 'express';
import { ValidationError } from './errors';
import { assertTrustedUserId, resolveTrustedUserId } from './middleware/session-auth';
import { resolveCaptureUserId } from './audio-processor';

function pickParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? '').trim();
}

function pickQuery(req: Request, key: string): string {
  const q = req.query[key];
  if (typeof q === 'string') return q.trim();
  if (Array.isArray(q) && typeof q[0] === 'string') return q[0].trim();
  return '';
}

export function trustedParamUserId(req: Request, key = 'userId'): string {
  const claimed = pickParam(req.params[key] as string | string[] | undefined);
  if (!claimed) throw new ValidationError(`缺少 ${key}`);
  assertTrustedUserId(req, claimed);
  return resolveTrustedUserId(req, claimed);
}

export function trustedBodyUserId(req: Request, key = 'userId'): string {
  const body = req.body as Record<string, unknown> | undefined;
  const claimed = String(body?.[key] ?? '').trim();
  if (!claimed) throw new ValidationError(`缺少 ${key}`);
  assertTrustedUserId(req, claimed);
  return resolveTrustedUserId(req, claimed);
}

export function trustedQueryUserId(req: Request, key = 'userId'): string {
  const claimed = pickQuery(req, key);
  if (!claimed) throw new ValidationError(`缺少 ${key}`);
  assertTrustedUserId(req, claimed);
  return resolveTrustedUserId(req, claimed);
}

/** 伴生/语音/视觉上传：header/body userId 与会话对齐 */
export function trustedCaptureUserId(req: Request): string {
  const claimed = resolveCaptureUserId(
    req.headers as Record<string, string | string[] | undefined>,
    (req.body as { userId?: string } | undefined)?.userId,
  );
  if (!claimed) throw new ValidationError('缺少 userId');
  assertTrustedUserId(req, claimed);
  return resolveTrustedUserId(req, claimed);
}

/** body 未传 userId 时仅信任会话（生产必填） */
export function trustedBodyOrSessionUserId(req: Request, key = 'userId', devFallback = ''): string {
  const body = req.body as Record<string, unknown> | undefined;
  const claimed = String(body?.[key] ?? devFallback).trim();
  if (claimed) {
    assertTrustedUserId(req, claimed);
    return resolveTrustedUserId(req, claimed);
  }
  return resolveTrustedUserId(req, '');
}
