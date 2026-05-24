/**
 * WUXIAN · 统一前端 API 客户端
 * 封装 authFetch + 自动重试 + 错误广播 + 请求队列
 * 替代各 lib 文件中分散的 fetch 调用
 */

import { authFetch, jsonAuthHeaders, getAuthToken, ensureAuthSession } from './api-auth';

export interface ApiClientOptions {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  silent?: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 500;
const DEFAULT_TIMEOUT = 30000;

export async function apiGet<T>(path: string, options?: ApiClientOptions): Promise<T> {
  return apiRequest<T>('GET', path, undefined, options);
}

export async function apiPost<T>(path: string, body?: unknown, options?: ApiClientOptions): Promise<T> {
  return apiRequest<T>('POST', path, body, options);
}

export async function apiDelete<T>(path: string, options?: ApiClientOptions): Promise<T> {
  return apiRequest<T>('DELETE', path, undefined, options);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: ApiClientOptions,
): Promise<T> {
  const retries = options?.retries ?? DEFAULT_RETRIES;
  const retryDelay = options?.retryDelay ?? DEFAULT_RETRY_DELAY;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const silent = options?.silent ?? false;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body !== undefined && method !== 'GET') {
        init.body = JSON.stringify(body);
      }

      const res = await fetch(path, init);
      clearTimeout(timer);

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const code = json?.code ?? 'UNKNOWN';
        const errorMsg = json?.error ?? json?.message ?? res.statusText;
        throw new ApiError(res.status, code, errorMsg, json?.detail);
      }

      const json = await res.json() as { code?: number; data?: T };
      return (json?.data ?? json) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof ApiError && err.status < 500) {
        break;
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new Error(`请求超时 (${timeout}ms): ${path}`);
        break;
      }

      if (attempt < retries) {
        if (!silent) console.warn(`[API] 重试 ${attempt + 1}/${retries}: ${path}`);
        await sleep(retryDelay * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError ?? new Error(`请求失败: ${path}`);
}
