import Stripe from 'stripe';
import { getLearningDb } from './wuxian-learning-db';
import { recordPayment } from './telemetry-otel';

let stripe: Stripe | null = null;
let webhookSecret: string = '';

export function initStripe(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.log('[Stripe] 未配置 STRIPE_SECRET_KEY');
    return false;
  }
  stripe = new Stripe(key, { apiVersion: undefined });
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
  console.log('[Stripe] 已初始化');
  return true;
}

export function getStripe(): Stripe {
  if (!stripe) throw new Error('Stripe 未初始化');
  return stripe;
}

export interface ProductDefinition {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  type: 'warp_pack' | 'subscription' | 'certificate';
  warpMinutes?: number;
  credits?: number;
  interval?: 'month' | 'year';
}

const PRODUCTS: ProductDefinition[] = [
  { id: 'warp_10h', name: 'Warp 10小时包', description: '10小时视频同化/LLM算力', amount: 2990, currency: 'cny', type: 'warp_pack', warpMinutes: 600 },
  { id: 'warp_50h', name: 'Warp 50小时包', description: '50小时视频同化/LLM算力', amount: 9990, currency: 'cny', type: 'warp_pack', warpMinutes: 3000 },
  { id: 'sub_growth_monthly', name: 'Growth 月付', description: '无限Warp + 高级能力', amount: 4990, currency: 'cny', type: 'subscription', interval: 'month' },
  { id: 'sub_pro_yearly', name: 'Pro 年付', description: '全部能力 + 优先排队', amount: 39990, currency: 'cny', type: 'subscription', interval: 'year' },
  { id: 'cert_unlock', name: '证书解锁', description: '单次认知证书解锁', amount: 990, currency: 'cny', type: 'certificate' },
];

export function getProducts(): ProductDefinition[] {
  return PRODUCTS;
}

export async function createStripeCheckoutSession(
  userId: string,
  productId: string,
): Promise<{ sessionId: string; url: string | null }> {
  const s = getStripe();
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) throw new Error(`未知商品: ${productId}`);

  const session = await s.checkout.sessions.create({
    mode: product.type === 'subscription' ? 'subscription' : 'payment',
    payment_method_types: ['card', 'alipay', 'wechat_pay'],
    line_items: [{
      price_data: {
        currency: product.currency,
        product_data: { name: product.name, description: product.description },
        unit_amount: product.amount,
        ...(product.interval ? { recurring: { interval: product.interval } } : {}),
      },
      quantity: 1,
    }],
    metadata: { userId, productId },
    success_url: `${process.env.WUXIAN_FRONTEND_URL || 'http://localhost:3401'}/#/?payment=success`,
    cancel_url: `${process.env.WUXIAN_FRONTEND_URL || 'http://localhost:3401'}/#/?payment=cancelled`,
  });

  return { sessionId: session.id, url: session.url };
}

export async function handleStripeWebhook(
  payload: Buffer,
  signature: string,
): Promise<{ received: boolean }> {
  const s = getStripe();
  let event: Stripe.Event;

  try {
    event = s.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    throw new Error(`Webhook 验签失败: ${(err as Error).message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const productId = session.metadata?.productId;
      if (userId && productId) {
        await fulfillOrder(userId, productId, session.id);
        recordPayment(session.amount_total ?? 0, session.currency ?? 'cny', 'completed');
      }
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.userId) {
        recordPayment(0, 'cny', 'expired');
      }
      break;
    }
  }

  return { received: true };
}

async function fulfillOrder(userId: string, productId: string, stripeSessionId: string): Promise<void> {
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) return;

  const db = getLearningDb();

  db.prepare(`
    INSERT INTO payment_orders (id, user_id, product_id, amount, currency, status, provider, provider_session_id, created_at)
    VALUES (?, ?, ?, ?, ?, 'completed', 'stripe', ?, ?)
  `).run(
    `stripe_${stripeSessionId}`, userId, productId, product.amount, product.currency,
    stripeSessionId, new Date().toISOString(),
  );

  if (product.warpMinutes) {
    db.prepare(`
      INSERT INTO user_billing (user_id, available_warp_minutes, total_warp_purchased, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        available_warp_minutes = available_warp_minutes + ?,
        total_warp_purchased = total_warp_purchased + ?
    `).run(userId, product.warpMinutes, product.warpMinutes, new Date().toISOString(),
      product.warpMinutes, product.warpMinutes);
  }

  console.log(`[Stripe] 订单已完成: userId=${userId} productId=${productId}`);
}
