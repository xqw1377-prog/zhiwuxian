import type { Application, Request, Response } from 'express';
import { wrap, sendSuccess } from './shared';
import { resolveTrustedUserId } from '../middleware/session-auth';
import { createStripeCheckoutSession, getProducts, handleStripeWebhook } from '../stripe-payment';

export function registerStripeRoutes(app: Application): void {
  app.get('/api/v1/payment/stripe/products', wrap((_req, res) => {
    sendSuccess(res, { products: getProducts() });
  }));

  app.post('/api/v1/payment/stripe/create-checkout', wrap(async (req, res) => {
    const userId = resolveTrustedUserId(req, String(req.body.userId ?? ''));
    const productId = String(req.body.productId ?? '').trim();
    if (!productId) {
      res.status(400).json({ code: 400, status: 'ERROR', error: '缺少 productId' });
      return;
    }
    const session = await createStripeCheckoutSession(userId, productId);
    sendSuccess(res, session);
  }));

  app.post('/api/v1/payment/stripe-webhook', (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    if (!sig) {
      res.status(400).json({ error: '缺少 stripe-signature' });
      return;
    }
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body ?? ''));
    handleStripeWebhook(rawBody, sig)
      .then((result) => res.json(result))
      .catch((err) => {
        console.error('[Stripe] Webhook 处理失败:', err);
        res.status(400).json({ error: (err as Error).message });
      });
  });
}
