/** WUXIAN · 客户端会话 Token（与 POST /api/v1/auth/bootstrap 对齐） */

import { resolveApiUrl } from './api-base';

export const AUTH_TOKEN_KEY = 'wuxian_auth_token';
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAuthToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function jsonAuthHeaders(): HeadersInit {
  return authHeaders({ 'Content-Type': 'application/json' });
}

/** 上传 FormData 时使用（勿设置 Content-Type，由浏览器带 boundary） */
export function multipartAuthHeaders(extra?: HeadersInit): HeadersInit {
  return authHeaders(extra);
}

export function withAuthInit(init?: RequestInit): RequestInit {
  return { ...init, headers: authHeaders(init?.headers) };
}

/** 自动附带 Bearer（若 localStorage 有 token） */
export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof input === 'string') {
    return fetch(resolveApiUrl(input), withAuthInit(init));
  }
  if (input instanceof URL) {
    return fetch(resolveApiUrl(input.toString()), withAuthInit(init));
  }
  return fetch(resolveApiUrl(input.url), withAuthInit(init));
}
function unwrapBootstrap(json: unknown): { token?: string; userId?: string } {
  const j = json as { data?: { token?: string; userId?: string } };
  return j?.data ?? (json as { token?: string; userId?: string });
}

export function getOrCreateDeviceId(): string {
  const key = 'wuxian_device_id';
  const existing = localStorage.getItem(key);
  if (existing && existing.trim()) return existing.trim();
  const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, created);
  return created;
}

/** 唤醒/云目录等 v3.5 接口前确保已有 Bearer（与 OmniCockpit bootstrap 对齐） */
export async function ensureAuthSession(_userId: string): Promise<boolean> {
  if (getAuthToken()) return true;
  try {
    const res = await fetch(resolveApiUrl('/api/v1/auth/bootstrap'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: getOrCreateDeviceId() }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return false;
    const d = unwrapBootstrap(json);
    if (d.token) setAuthToken(d.token);
    if (d.userId) localStorage.setItem('wuxian_user_id', d.userId);
    return Boolean(d.token);
  } catch {
    return false;
  }
}

export function parseApiErrorMessage(json: unknown, res: Response): string {
  const j = json as { error?: string; message?: string; data?: { message?: string } };
  if (j?.message) return j.message;
  if (j?.error && j.error !== 'INTERNAL_ERROR') return j.error;
  if (j?.error) return j.error;
  if (res.status === 401) return '未登录：请刷新页面后重试（会话 bootstrap 失败）';
  if (res.status === 500) return '服务端错误：请确认后端已启动且数据库初始化成功';
  return res.statusText || '请求失败';
}
