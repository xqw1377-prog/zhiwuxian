/**
 * WUXIAN · 支付订单 API
 * 结构化收银台；WUXIAN_PAYMENT_MODE=simulate 时本地验单
 */

import { learningUid, getLearningDb } from './wuxian-learning-db';
import {
  addCredits,
  addTokens,
  addWarpMinutes,
  setWarpUnlimited,
  setSubscriptionTier,
  ensureWalletSchema,
  ensureWallet,
} from './user-wallet';
import { WARP_PACKS, REPORT_UNLOCK_PRICE_CNY } from './billing-api';
import { unlockCognitiveReport } from './billing-api';
import { verifyPaymentWebhook } from './payment-verifiers';
import { resolveLiveCheckoutUrl } from './payment-checkout';

export const PRODUCT_CATALOG = {
  token_1m: { type: 'token_pack', priceCNY: 39, label: '1,000,000 Token 套餐' },
  token_5m: { type: 'token_pack', priceCNY: 99, label: '5,000,000 Token 套餐' },
  token_20m: { type: 'token_pack', priceCNY: 299, label: '20,000,000 Token 套餐' },
  warp_10h: { type: 'warp_pack', priceCNY: 39, label: '10 小时硬核折叠包' },
  warp_unlimited_month: { type: 'warp_pack', priceCNY: 99, label: '全时空折叠月卡' },
  subscription_growth: { type: 'subscription', priceCNY: 29, label: '复活甲 · Growth' },
  subscription_pro: { type: 'subscription', priceCNY: 79, label: '虫洞机甲 · Pro' },
  report_unlock: { type: 'report', priceCNY: REPORT_UNLOCK_PRICE_CNY, label: '天赋诊断证书解锁' },
  credits_100: { type: 'credits', priceCNY: 9.9, label: '100 认知算力 Credits' },
} as const;

export type ProductId = keyof typeof PRODUCT_CATALOG;

export interface PaymentOrder {
  orderId: string;
  userId: string;
  productId: ProductId;
  amountCNY: number;
  status: 'PENDING' | 'PAID' | 'FAILED';
  checkoutUrl: string | null;
  checkoutProvider?: string;
  createdAt: string;
}

function paymentMode(): 'simulate' | 'live' {
  return process.env.WUXIAN_PAYMENT_MODE === 'live' ? 'live' : 'simulate';
}

export async function createPaymentOrder(
  userId: string,
  productId: string,
  metadata?: Record<string, string>,
): Promise<PaymentOrder> {
  ensureWalletSchema();
  const product = PRODUCT_CATALOG[productId as ProductId];
  if (!product) throw new Error(`未知商品: ${productId}`);

  const orderId = learningUid();
  const mode = paymentMode();
  const db = getLearningDb();

  db.transaction(() => {
    ensureWallet(userId);
    db.prepare(`
      INSERT INTO payment_orders (id, user_id, product_type, product_id, amount_cny, amount_cents, status, payment_provider, metadata)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(
      orderId,
      userId,
      product.type,
      productId,
      product.priceCNY,
      Math.round(product.priceCNY * 100),
      mode,
      metadata ? JSON.stringify(metadata) : null,
    );
  })();

  let checkoutUrl: string | null = mode === 'simulate' ? `/api/v1/payment/confirm` : null;
  let checkoutProvider: string = mode;

  if (mode === 'live') {
    const live = await resolveLiveCheckoutUrl(userId, productId, orderId);
    checkoutUrl = live.checkoutUrl;
    checkoutProvider = live.provider;
    if (live.externalSessionId) {
      db.prepare(`UPDATE payment_orders SET metadata = ? WHERE id = ?`).run(
        JSON.stringify({
          ...(metadata ?? {}),
          stripeSessionId: live.externalSessionId,
          checkoutProvider: live.provider,
        }),
        orderId,
      );
    }
    if (!checkoutUrl) {
      checkoutUrl = `/api/v1/payment/confirm`;
      checkoutProvider = 'manual';
    }
  }

  return {
    orderId,
    userId,
    productId: productId as ProductId,
    amountCNY: product.priceCNY,
    status: 'PENDING',
    checkoutUrl,
    createdAt: new Date().toISOString(),
    checkoutProvider: mode === 'live' ? checkoutProvider : undefined,
  };
}

export function fulfillOrder(orderId: string, paymentRef?: string, extra?: { provider?: string; thirdPartyTxId?: string }): PaymentOrder {
  ensureWalletSchema();
  const db = getLearningDb();

  const tx: (oid: string, ref?: string, x?: { provider?: string; thirdPartyTxId?: string }) => PaymentOrder = db.transaction((
    oid: string,
    ref?: string,
    x?: { provider?: string; thirdPartyTxId?: string },
  ): PaymentOrder => {
    const row = db.prepare(`SELECT * FROM payment_orders WHERE id = ?`).get(oid) as {
      id: string;
      user_id: string;
      product_id: string;
      amount_cny: number;
      status: string;
      metadata: string | null;
      created_at: string;
    } | undefined;

    if (!row) throw new Error('订单不存在');
    if (row.status === 'PAID') {
      return {
        orderId: row.id,
        userId: row.user_id,
        productId: row.product_id as ProductId,
        amountCNY: row.amount_cny,
        status: 'PAID',
        checkoutUrl: null,
        createdAt: row.created_at,
      };
    }

    const meta = row.metadata ? JSON.parse(row.metadata) as Record<string, string> : {};
    const productId = row.product_id as ProductId;

    switch (productId) {
      case 'token_1m':
        addTokens(row.user_id, 1_000_000);
        break;
      case 'token_5m':
        addTokens(row.user_id, 5_000_000);
        break;
      case 'token_20m':
        addTokens(row.user_id, 20_000_000);
        break;
      case 'warp_10h':
        addWarpMinutes(row.user_id, 600);
        break;
      case 'warp_unlimited_month':
        setWarpUnlimited(row.user_id, 30);
        break;
      case 'subscription_growth':
        setSubscriptionTier(row.user_id, 'growth', 30);
        break;
      case 'subscription_pro':
        setSubscriptionTier(row.user_id, 'pro', 30);
        break;
      case 'credits_100':
        addCredits(row.user_id, 100);
        break;
      case 'report_unlock':
        if (meta.reportId) unlockCognitiveReport(meta.reportId, row.user_id);
        break;
      default:
        if (WARP_PACKS.some(p => p.id === productId)) {
          const pack = WARP_PACKS.find(p => p.id === productId)!;
          if ('minutes' in pack && pack.minutes) addWarpMinutes(row.user_id, pack.minutes);
          if ('unlimitedDays' in pack && pack.unlimitedDays) setWarpUnlimited(row.user_id, pack.unlimitedDays);
        }
    }

    const finalPaymentRef = ref ?? `sim-${Date.now()}`;
    const provider = x?.provider ?? paymentMode();
    const txId = x?.thirdPartyTxId ?? finalPaymentRef;

    db.prepare(`
      UPDATE payment_orders
      SET status = 'PAID',
          payment_provider = ?,
          payment_ref = ?,
          third_party_tx_id = ?,
          paid_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(provider, finalPaymentRef, txId, oid);

    return {
      orderId: row.id,
      userId: row.user_id,
      productId,
      amountCNY: row.amount_cny,
      status: 'PAID',
      checkoutUrl: null,
      createdAt: row.created_at,
    };
  });

  return tx(orderId, paymentRef, extra);
}

export function listOrders(userId: string, limit = 20) {
  ensureWalletSchema();
  return getLearningDb().prepare(`
    SELECT id as orderId, product_id as productId, amount_cny as amountCNY, status, created_at as createdAt, paid_at as paidAt
    FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
}

export function handlePaymentWebhook(input: {
  provider: 'stripe' | 'wechat' | 'simulate';
  orderId: string;
  thirdPartyTxId: string;
  rawBody?: string | Buffer;
  headers?: Record<string, string | string[] | undefined>;
}): PaymentOrder {
  const verify = verifyPaymentWebhook({
    provider: input.provider,
    rawBody: input.rawBody ?? JSON.stringify({ orderId: input.orderId }),
    headers: input.headers ?? {},
  });

  if (!verify.ok) {
    throw new Error(verify.error ?? '支付 webhook 验签失败');
  }

  const orderId = verify.orderId ?? input.orderId;
  const txId = verify.thirdPartyTxId ?? input.thirdPartyTxId;

  return fulfillOrder(orderId, txId, { provider: input.provider, thirdPartyTxId: txId });
}

export function getOrderById(orderId: string): PaymentOrder | null {
  ensureWalletSchema();
  const row = getLearningDb().prepare(`SELECT * FROM payment_orders WHERE id = ?`).get(orderId) as {
    id: string;
    user_id: string;
    product_id: string;
    amount_cny: number;
    status: string;
    created_at: string;
  } | undefined;
  if (!row) return null;
  return {
    orderId: row.id,
    userId: row.user_id,
    productId: row.product_id as ProductId,
    amountCNY: row.amount_cny,
    status: row.status as PaymentOrder['status'],
    checkoutUrl: null,
    createdAt: row.created_at,
  };
}
