/**
 * live 模式收银台 URL 生成（Stripe / 微信 H5 中转）
 */

import { initStripe, createStripeCheckoutSession } from './stripe-payment';

export type LiveCheckoutResult = {
  checkoutUrl: string | null;
  provider: 'stripe' | 'wechat_h5' | 'manual';
  externalSessionId?: string;
};

const STRIPE_PRODUCT_MAP: Record<string, string> = {
  warp_10h: 'warp_10h',
  warp_unlimited_month: 'sub_growth_monthly',
  subscription_growth: 'sub_growth_monthly',
  subscription_pro: 'sub_pro_yearly',
  report_unlock: 'cert_unlock',
};

export async function resolveLiveCheckoutUrl(
  userId: string,
  productId: string,
  orderId: string,
): Promise<LiveCheckoutResult> {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (stripeKey) {
    initStripe();
    const mapped = STRIPE_PRODUCT_MAP[productId] ?? productId;
    try {
      const session = await createStripeCheckoutSession(userId, mapped);
      const base = process.env.WUXIAN_FRONTEND_URL?.trim() || 'http://localhost:3401';
      const url =
        session.url ??
        `${base}/#/pricing?orderId=${encodeURIComponent(orderId)}&sessionId=${encodeURIComponent(session.sessionId)}`;
      return { checkoutUrl: url, provider: 'stripe', externalSessionId: session.sessionId };
    } catch (err) {
      console.warn('[Payment] Stripe checkout 失败，回退微信 H5 模板:', err);
    }
  }

  const wechatTemplate = process.env.WUXIAN_WECHAT_PAY_H5_URL?.trim();
  if (wechatTemplate) {
    const url = wechatTemplate
      .replace('{orderId}', encodeURIComponent(orderId))
      .replace('{userId}', encodeURIComponent(userId))
      .replace('{productId}', encodeURIComponent(productId));
    return { checkoutUrl: url, provider: 'wechat_h5' };
  }

  const manualBase = process.env.WUXIAN_PAYMENT_MANUAL_URL?.trim();
  if (manualBase) {
    const sep = manualBase.includes('?') ? '&' : '?';
    return {
      checkoutUrl: `${manualBase}${sep}orderId=${encodeURIComponent(orderId)}`,
      provider: 'manual',
    };
  }

  return {
    checkoutUrl: null,
    provider: 'manual',
  };
}
