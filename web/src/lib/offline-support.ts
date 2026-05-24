/**
 * WUXIAN · 离线 PWA 支持
 * Service Worker 注册 + IndexedDB 缓存 + 网络状态监听
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CACHE_PREFIX = 'wuxian-zhi-v1';

export function isOnline(): boolean {
  return navigator.onLine;
}

export function onNetworkChange(callback: (online: boolean) => void): () => void {
  const goOnline = () => callback(true);
  const goOffline = () => callback(false);
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);
  return () => {
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOffline);
  };
}

export async function registerServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    console.log('[Offline] Service Worker 不支持');
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    console.log('[Offline] Service Worker 已注册:', registration.scope);
    return true;
  } catch (err) {
    console.warn('[Offline] Service Worker 注册失败:', err);
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.log('[Push] 通知不支持');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch {
    return false;
  }
}

export async function subscribeToPushNotifications(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.log('[Push] VAPID 公钥未配置');
      return null;
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });
    console.log('[Push] 已订阅推送通知');
    return subscription;
  } catch (err) {
    console.warn('[Push] 订阅失败:', err);
    return null;
  }
}

export function showLocalNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'wuxian-zhi',
    });
  } catch {
    /* silent */
  }
}
