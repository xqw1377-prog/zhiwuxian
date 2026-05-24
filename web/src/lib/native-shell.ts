import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNativeApp } from './api-base';

/** App 启动：状态栏、收起启动图 */
export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0D0E12' });
  } catch {
    /* 部分 WebView 不支持 */
  }
  try {
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }
}

export function isTabletNativeApp(): boolean {
  return isNativeApp();
}
