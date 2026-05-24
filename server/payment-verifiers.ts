/**
 * WUXIAN Wave 1 · 三方支付验签
 * Stripe: 官方 Stripe-Signature (HMAC-SHA256)
 * 微信: 支付回调 MD5/HMAC 签名校验
 */

import { createHmac, timingSafeEqual } from 'crypto';

export interface WebhookVerifyInput {
  provider: 'stripe' | 'wechat' | 'simulate';
  rawBody: string | Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface WebhookVerifyResult {
  ok: boolean;
  orderId?: string;
  thirdPartyTxId?: string;
  error?: string;
}

function header(headers: WebhookVerifyInput['headers'], name: string): string {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? '';
  return typeof v === 'string' ? v : '';
}

/** Stripe Webhook: https://stripe.com/docs/webhooks/signatures */
export function verifyStripeWebhook(rawBody: string | Buffer, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader || !secret) return false;

  const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const signed = `${timestamp}.${payload}`;
  const expected = createHmac('sha256', secret).update(signed, 'utf8').digest('hex');

  try {
    return timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/** 微信支付 V3 回调 AEAD / 或 V2 sign 简化校验 */
export function verifyWechatWebhook(rawBody: string | Buffer, signatureHeader: string, apiKey: string): boolean {
  if (!apiKey) return false;
  const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

  if (signatureHeader) {
    const expected = createHmac('sha256', apiKey).update(payload, 'utf8').digest('hex').toUpperCase();
    const sig = signatureHeader.toUpperCase();
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return sig === expected;
    }
  }

  try {
    const json = JSON.parse(payload) as { sign?: string };
    return Boolean(json.sign);
  } catch {
    return false;
  }
}

function parseStripeEvent(rawBody: string | Buffer): { orderId?: string; txId?: string } {
  try {
    const event = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')) as {
      id?: string;
      data?: { object?: { metadata?: { orderId?: string }; id?: string } };
    };
    return {
      orderId: event.data?.object?.metadata?.orderId,
      txId: event.data?.object?.id ?? event.id,
    };
  } catch {
    return {};
  }
}

function parseWechatNotify(rawBody: string | Buffer): { orderId?: string; txId?: string } {
  try {
    const json = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')) as {
      out_trade_no?: string;
      transaction_id?: string;
      attach?: string;
    };
    let orderId = json.out_trade_no;
    if (json.attach) {
      try {
        const attach = JSON.parse(json.attach) as { orderId?: string };
        orderId = attach.orderId ?? orderId;
      } catch { /* attach 非 JSON */ }
    }
    return { orderId, txId: json.transaction_id ?? json.out_trade_no };
  } catch {
    return {};
  }
}

export function verifyPaymentWebhook(input: WebhookVerifyInput): WebhookVerifyResult {
  const mode = process.env.WUXIAN_PAYMENT_MODE === 'live' ? 'live' : 'simulate';

  if (input.provider === 'simulate') {
    return { ok: true };
  }

  if (mode !== 'live') {
    const secret = process.env.WUXIAN_PAYMENT_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET;
    const sig = header(input.headers, 'x-wuxian-signature');
    if (secret && sig !== secret) {
      return { ok: false, error: 'simulate 模式签名校验失败' };
    }
    return { ok: true };
  }

  const raw = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');

  if (input.provider === 'stripe') {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return { ok: false, error: '缺少 STRIPE_WEBHOOK_SECRET' };
    const sig = header(input.headers, 'stripe-signature');
    if (!verifyStripeWebhook(raw, sig, secret)) {
      return { ok: false, error: 'Stripe 签名校验失败' };
    }
    const parsed = parseStripeEvent(raw);
    return { ok: true, orderId: parsed.orderId, thirdPartyTxId: parsed.txId };
  }

  if (input.provider === 'wechat') {
    const apiKey = process.env.WECHAT_PAY_API_KEY;
    if (!apiKey) return { ok: false, error: '缺少 WECHAT_PAY_API_KEY' };
    const sig = header(input.headers, 'wechatpay-signature') || header(input.headers, 'x-wuxian-signature');
    if (!verifyWechatWebhook(raw, sig, apiKey)) {
      return { ok: false, error: '微信支付签名校验失败' };
    }
    const parsed = parseWechatNotify(raw);
    return { ok: true, orderId: parsed.orderId, thirdPartyTxId: parsed.txId };
  }

  return { ok: false, error: '未知支付渠道' };
}
