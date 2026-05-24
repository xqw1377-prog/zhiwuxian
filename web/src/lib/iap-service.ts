/**
 * WUXIAN · 统一应用内购买服务
 * Web: Stripe Checkout
 * 原生 (iOS/Android): RevenueCat (IAP)
 */

import { isPlatform } from '../lib/platform';

export interface ProductItem {
  id: string;
  name: string;
  price: string;
  period: string;
  rcIdentifier?: string; // RevenueCat product identifier
}

export interface PurchaseResult {
  success: boolean;
  productId?: string;
  error?: string;
  cancelled?: boolean;
}

let rcInitialized = false;
let rcProducts: ProductItem[] = [];

export async function initIAP(apiKey: string | null, userId: string): Promise<void> {
  if (!isPlatformNative() || !apiKey) return;

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    await Purchases.configure({ apiKey, appUserID: userId });
    rcInitialized = true;
  } catch (e) {
    console.warn('[IAP] RevenueCat 初始化失败:', e);
  }
}

export async function fetchProducts(): Promise<ProductItem[]> {
  if (!isPlatformNative() || !rcInitialized) return [];

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const offerings = (await Purchases.getOfferings()) as any;
    const current = offerings?.current ?? offerings?.offerings?.current;
    if (!current) return [];

    rcProducts = (current.availablePackages ?? []).map((pkg: any) => ({
      id: pkg.identifier,
      name: pkg.product?.title ?? '',
      price: pkg.product?.priceString ?? '',
      period: pkg.product?.subscriptionPeriod ?? '',
      rcIdentifier: pkg.product?.identifier ?? '',
    }));

    return rcProducts;
  } catch {
    return [];
  }
}

export async function purchaseProduct(productId: string): Promise<PurchaseResult> {
  if (!isPlatformNative()) {
    return { success: false, error: 'Not available on web', cancelled: false };
  }

  if (!rcInitialized) {
    return { success: false, error: 'IAP 未初始化', cancelled: false };
  }

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const offerings = (await Purchases.getOfferings()) as any;
    const current = offerings?.current ?? offerings?.offerings?.current;
    if (!current) return { success: false, error: '无可购买项目', cancelled: false };

    const pkg = (current.availablePackages ?? []).find((p: any) => p.identifier === productId);
    if (!pkg) return { success: false, error: '产品不可用', cancelled: false };

    const result = await Purchases.purchasePackage({ aPackage: pkg });

    const customerInfo = result.customerInfo;
    const activeEntitlements = customerInfo.entitlements.active;

    // Notify our backend about the purchase
    const token = localStorage.getItem('wuxian_auth_token');
    if (token) {
      await fetch('/api/v1/iap/revenuecat-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productId: pkg.product.identifier,
          entitlementIds: Object.keys(activeEntitlements),
        }),
      }).catch(() => {});
    }

    return { success: true, productId: pkg.product.identifier };
  } catch (e: unknown) {
    const err = e as { code?: number; userCancelled?: boolean; message?: string };
    if (err.userCancelled) {
      return { success: false, cancelled: true };
    }
    return { success: false, error: err.message || '购买失败', cancelled: false };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isPlatformNative() || !rcInitialized) {
    return { success: false, cancelled: false };
  }

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    await Purchases.restorePurchases();
    return { success: true };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return { success: false, error: err.message || '恢复失败', cancelled: false };
  }
}

export function isPlatformNative(): boolean {
  try {
    return isPlatform('ios') || isPlatform('android');
  } catch {
    return false;
  }
}
