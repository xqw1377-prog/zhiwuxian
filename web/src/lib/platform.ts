/**
 * WUXIAN · 平台检测工具
 */

declare const window: Window & { capacitor?: unknown };

export function isPlatform(platform: 'ios' | 'android' | 'electron'): boolean {
  if (platform === 'electron') {
    return navigator.userAgent.includes('Electron');
  }

  // Capacitor native
  try {
    const ua = navigator.userAgent.toLowerCase();
    if (platform === 'ios') return /iphone|ipad|ipod/.test(ua) && !!(window as any).Capacitor;
    if (platform === 'android') return ua.includes('android') && !!(window as any).Capacitor;
  } catch {
    return false;
  }

  return false;
}

export function getPlatform(): 'web' | 'ios' | 'android' | 'electron' {
  if (isPlatform('electron')) return 'electron';
  if (isPlatform('ios')) return 'ios';
  if (isPlatform('android')) return 'android';
  return 'web';
}
