/**
 * API 根地址：浏览器开发走 Vite 代理；Capacitor / 独立 WebView 需绝对地址
 */
import { Capacitor } from '@capacitor/core';

const DEFAULT_DEV = 'http://localhost:3401';

function normalizeBase(raw: string): string {
  return raw.trim().replace(/\/$/, '');
}

/** 构建时注入：VITE_API_BASE=https://api.yourdomain.com */
export function getApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE as string | undefined;
  if (fromEnv?.trim()) return normalizeBase(fromEnv);

  if (typeof window !== 'undefined') {
    const injected = (window as Window & { WUXIAN_API_BASE?: string }).WUXIAN_API_BASE;
    if (injected?.trim()) return normalizeBase(injected);
  }

  if (Capacitor.isNativePlatform()) {
    return normalizeBase(DEFAULT_DEV);
  }

  return '';
}

export function resolveApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBase();
  if (!base) return p;
  return `${base}${p}`;
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  const pl = Capacitor.getPlatform();
  if (pl === 'ios' || pl === 'android') return pl;
  return 'web';
}
