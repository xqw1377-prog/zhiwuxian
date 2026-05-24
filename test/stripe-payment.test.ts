import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Stripe from 'stripe';

const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;

describe('Stripe Payment Integration', () => {
  beforeAll(() => {
    if (hasStripeKey) {
      process.env.WUXIAN_PAYMENT_MODE = 'stripe';
    }
  });

  it('应跳过测试当缺少 STRIPE_SECRET_KEY', () => {
    if (!hasStripeKey) {
      expect(process.env.STRIPE_SECRET_KEY).toBeUndefined();
    }
  });

  it('应能初始化 Stripe 客户端', () => {
    if (!hasStripeKey) return;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: undefined });
    expect(stripe).toBeInstanceOf(Stripe);
  });

  it('应能创建 Checkout Session', async () => {
    if (!hasStripeKey) return;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: undefined });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      line_items: [{ price: process.env.STRIPE_PRICE_ID || 'price_test', quantity: 1 }],
      metadata: { userId: 'test-user' },
    });
    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('url');
    expect(session.metadata?.userId).toBe('test-user');
  }, 15000);

  it('应能查询产品列表', async () => {
    if (!hasStripeKey) return;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: undefined });
    const products = await stripe.products.list({ limit: 10 });
    expect(products.data).toBeInstanceOf(Array);
  }, 15000);

  it('应验证 Webhook 签名', () => {
    if (!hasStripeKey) return;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: undefined });
    const secret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test';
    const payload = JSON.stringify({ type: 'checkout.session.completed' });
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    const event = stripe.webhooks.constructEvent(payload, header, secret);
    expect(event.type).toBe('checkout.session.completed');
  });

  it('应拒绝无效 Webhook 签名', () => {
    if (!hasStripeKey) return;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: undefined });
    const payload = JSON.stringify({ type: 'checkout.session.completed' });
    expect(() => {
      stripe.webhooks.constructEvent(payload, 'invalid_signature', 'whsec_test');
    }).toThrow();
  });
});
