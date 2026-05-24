/**
 * WUXIAN · 支付与账单路由
 */

import type { Application } from 'express';
import { wrap, sendSuccess, param } from './shared';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
  paymentCreateBodySchema,
  paymentConfirmBodySchema,
  billingCreateOrderBodySchema,
  billingConsumeWarpBodySchema,
  billingPurchasePackBodySchema,
  billingWalletStatusQuerySchema,
} from '../schemas/payment';
import { userIdParamsSchema } from '../schemas/common';
import { resolveTrustedUserId, assertTrustedUserId } from '../middleware/session-auth';
import { ValidationError } from '../errors';
import {
  consumeWarpPower,
  getBillingAccount,
  WARP_PACKS,
  REPORT_UNLOCK_PRICE_CNY,
} from '../billing-api';
import {
  createPaymentOrder,
  fulfillOrder,
  listOrders,
  handlePaymentWebhook,
  PRODUCT_CATALOG,
} from '../payment-api';
import { getWalletSummary } from '../user-wallet';

function mapBillingProductType(productType: string): string {
  if (productType === 'WARP_PACK_10H') return 'warp_10h';
  if (productType === 'SUBSCRIPTION_MONTHLY') return 'subscription_growth';
  if (productType === 'POSTER_UNLOCK') return 'report_unlock';
  return productType;
}

export function registerPaymentRoutes(app: Application): void {
  app.get('/api/v1/payment/catalog', wrap((_req, res) => {
    sendSuccess(res, { products: PRODUCT_CATALOG, mode: process.env.WUXIAN_PAYMENT_MODE ?? 'simulate' });
  }));

  app.post(
    '/api/v1/payment/create',
    validateBody(paymentCreateBodySchema),
    wrap(async (req, res) => {
      const body = req.body as { userId?: string; productId?: string; packId?: string; metadata?: Record<string, string> };
      const userId = resolveTrustedUserId(req, body.userId ?? '');
      const productId = (body.productId ?? body.packId ?? '').trim();
      const order = await createPaymentOrder(userId, productId, body.metadata);
      sendSuccess(res, order);
    }),
  );

  app.post(
    '/api/v1/payment/confirm',
    validateBody(paymentConfirmBodySchema),
    wrap((req, res) => {
      const body = req.body as { orderId: string; paymentRef?: string };
      const order = fulfillOrder(body.orderId, body.paymentRef);
      assertTrustedUserId(req, order.userId);
      sendSuccess(res, { order, wallet: getWalletSummary(order.userId) });
    }),
  );

  app.post('/api/v1/payment/webhook/:provider', wrap((req, res) => {
    const provider = param(req.params.provider) as 'stripe' | 'wechat' | 'simulate';
    if (!['stripe', 'wechat', 'simulate'].includes(provider)) {
      throw new ValidationError('provider 必须为 stripe | wechat | simulate');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch { /* 非 JSON */ }

    const orderId = String(
      parsed.orderId ?? (parsed.metadata as Record<string, string>)?.orderId ?? '',
    ).trim();
    const thirdPartyTxId = String(
      parsed.thirdPartyTxId ?? parsed.transaction_id ?? parsed.id ?? '',
    ).trim();

    if (provider === 'simulate') {
      if (!orderId) throw new ValidationError('simulate 模式缺少 orderId');
      if (!thirdPartyTxId) throw new ValidationError('simulate 模式缺少 thirdPartyTxId');
    }

    const order = handlePaymentWebhook({
      provider,
      orderId,
      thirdPartyTxId: thirdPartyTxId || `wh-${Date.now()}`,
      rawBody,
      headers: req.headers as Record<string, string | string[] | undefined>,
    });
    sendSuccess(res, { order, wallet: getWalletSummary(order.userId) });
  }));

  app.get(
    '/api/v1/payment/orders/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      const userId = resolveTrustedUserId(req, param(req.params.userId));
      sendSuccess(res, { orders: listOrders(userId) });
    }),
  );

  app.get(
    '/api/v1/billing/wallet-status',
    validateQuery(billingWalletStatusQuerySchema),
    wrap((req, res) => {
      const q = ((req as unknown as { _wuxianQuery?: unknown })._wuxianQuery ?? req.query) as { userId: string };
      const userId = resolveTrustedUserId(req, q.userId);
      const wallet = getWalletSummary(userId);
      sendSuccess(res, {
        success: true,
        wallet: {
          ...wallet,
          available_warp_minutes: wallet.availableWarpMinutes,
          subscription_status: wallet.tier === 'free' ? 'INACTIVE' : 'ACTIVE',
        },
      });
    }),
  );

  app.post(
    '/api/v1/billing/create-order',
    validateBody(billingCreateOrderBodySchema),
    wrap(async (req, res) => {
      const body = req.body as {
        userId?: string;
        productType?: string;
        productId?: string;
        metadata?: Record<string, string>;
      };
      const userId = resolveTrustedUserId(req, body.userId ?? '');
      const productType = (body.productType ?? body.productId ?? '').trim();
      const mappedProductId = mapBillingProductType(productType);
      const order = await createPaymentOrder(userId, mappedProductId, body.metadata);
      sendSuccess(res, { success: true, orderId: order.orderId, payUrl: order.checkoutUrl, order });
    }),
  );

  app.post('/api/v1/billing/webhook', wrap((req, res) => {
    const status = String(req.body.status ?? '').trim().toUpperCase();
    if (status !== 'SUCCESS') throw new ValidationError('签名缺失或非成功报文');
    const orderId = String(req.body.orderId ?? '').trim();
    const thirdPartyTxId = String(req.body.thirdPartyTxId ?? req.body.transactionId ?? req.body.id ?? '').trim();
    if (!orderId) throw new ValidationError('缺少 orderId');
    if (!thirdPartyTxId) throw new ValidationError('缺少 thirdPartyTxId / transactionId');

    const provider = (req.body.provider ?? 'simulate') as 'stripe' | 'wechat' | 'simulate';
    const order = handlePaymentWebhook({
      provider,
      orderId,
      thirdPartyTxId,
      rawBody: JSON.stringify(req.body),
      headers: req.headers as Record<string, string | string[] | undefined>,
    });
    sendSuccess(res, { success: true, order, wallet: getWalletSummary(order.userId) });
  }));

  app.get('/api/v1/billing/packs', wrap((_req, res) => {
    sendSuccess(res, { packs: WARP_PACKS, reportUnlockPrice: REPORT_UNLOCK_PRICE_CNY });
  }));

  app.get(
    '/api/v1/billing/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      const userId = resolveTrustedUserId(req, param(req.params.userId));
      sendSuccess(res, getBillingAccount(userId));
    }),
  );

  app.post(
    '/api/v1/billing/consume-warp',
    validateBody(billingConsumeWarpBodySchema),
    wrap((req, res) => {
      const body = req.body as {
        userId?: string;
        videoDurationMinutes: number;
        goalId?: string;
        sessionId?: string;
        videoId?: string;
      };
      const userId = resolveTrustedUserId(req, body.userId ?? '');
      const result = consumeWarpPower({
        userId,
        videoDurationMinutes: body.videoDurationMinutes,
        goalId: body.goalId ?? body.sessionId,
        videoId: body.videoId,
      });
      if (!result.success) {
        res.status(402).json({ code: 402, status: 'PAYMENT_REQUIRED', data: result });
        return;
      }
      sendSuccess(res, result);
    }),
  );

  app.post(
    '/api/v1/billing/purchase-pack',
    validateBody(billingPurchasePackBodySchema),
    wrap(async (req, res) => {
      const body = req.body as { userId?: string; packId: string };
      const userId = resolveTrustedUserId(req, body.userId ?? '');
      const order = await createPaymentOrder(userId, body.packId);
      sendSuccess(res, {
        order,
        simulateHint: '调用 POST /api/v1/payment/confirm 完成验单',
        wallet: getWalletSummary(userId),
      });
    }),
  );
}
