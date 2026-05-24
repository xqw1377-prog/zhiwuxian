import type { Application } from 'express';
import crypto from 'crypto';
import { wrap, sendSuccess } from './shared';
import { addWarpMinutesToDB } from '../../src/db/wallet-schema';

const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET || '';

/**
 * 验证 RevenueCat Webhook 签名
 * RevenueCat 使用 HMAC-SHA1 签名
 */
function verifyRevenueCatSignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return true; // 无密钥时信任所有请求（开发模式）
  const expected = crypto.createHmac('sha1', WEBHOOK_SECRET).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function registerIapRoutes(app: Application): void {
  /**
   * RevenueCat Webhook 端点
   * 当用户在原生 App 内完成 IAP 购买后，RevenueCat 会回调此接口
   */
  app.post('/api/v1/iap/revenuecat-webhook', (req, res) => {
    const signature = req.headers['x-revenuecat-signature'] as string || '';
    const rawBody = JSON.stringify(req.body);

    if (signature && !verifyRevenueCatSignature(rawBody, signature)) {
      console.warn('[IAP] RevenueCat 签名验证失败');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const event = req.body?.event;
    if (!event) {
      res.status(200).json({ received: true });
      return;
    }

    const { type, app_user_id, product_id, entitlement_ids } = event;

    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PURCHASE': {
        const userId = app_user_id?.toString() || '';
        const minutes = getWarpMinutesForProduct(product_id?.toString() || '');
        if (userId && minutes > 0) {
          addWarpMinutesToDB(userId, minutes);
          console.log(`[IAP] ${userId} 购买 ${product_id} 获得 ${minutes} Warp 分钟`);
        }
        break;
      }

      case 'CANCELLATION':
        console.log(`[IAP] 用户 ${app_user_id} 取消订阅 ${product_id}`);
        break;

      case 'UNCANCELLATION':
        console.log(`[IAP] 用户 ${app_user_id} 恢复订阅 ${product_id}`);
        break;

      default:
        break;
    }

    res.status(200).json({ received: true });
  });

  /**
   * 客户端主动通知购买完成（离线场景备用）
   */
  app.post('/api/v1/iap/record-purchase', wrap(async (req, res) => {
    const userId = req.wuxianSession?.userId;
    if (!userId) {
      res.status(401).json({ error: '未登录' });
      return;
    }

    const { productId, entitlementIds } = req.body as {
      productId?: string;
      entitlementIds?: string[];
    };

    if (productId && Array.isArray(entitlementIds) && entitlementIds.length > 0) {
      const minutes = getWarpMinutesForProduct(productId);
      if (minutes > 0) {
        addWarpMinutesToDB(userId, minutes);
        console.log(`[IAP] 客户端通知: ${userId} 购买 ${productId} 获得 ${minutes} Warp 分钟`);
      }
    }

    sendSuccess(res, { ok: true });
  }));
}

function getWarpMinutesForProduct(productId: string): number {
  const map: Record<string, number> = {
    // RevenueCat 产品 ID → Warp 分钟数
    'wuxian_pro_monthly': 600,
    'wuxian_pro_yearly': 7200,
    'wuxian_lifetime': 999999,
    // 兼容临时产品 ID
    'pro_monthly': 600,
    'pro_yearly': 7200,
  };
  return map[productId] || 0;
}
