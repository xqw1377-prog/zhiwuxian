import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 原生壳配置。构建前请设置 VITE_API_BASE 指向线上 API（HTTPS）。
 * 开发真机调试可把 server.url 指到电脑局域网 Vite（仅 debug）。
 */
const config: CapacitorConfig = {
  appId: 'com.wuxian.zhi',
  appName: 'WUXIAN ZHI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: ['*'],
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: true,
  },
  plugins: {
    CapacitorPurchases: {
      RCAPIKey: process.env.VITE_REVENUECAT_API_KEY || '',
    },
  },
};

export default config;
