/**
 * WUXIAN Beta 1.0 · Wave 1 生产防护层
 */

import type { Application } from 'express';
import {
  rateLimitGlobalApi,
  rateLimitAssimilate,
  rateLimitVideo,
  rateLimitPayment,
  rateLimitVideoUrlPayload,
  rateLimitAuthBootstrap,
} from './rate-limiter';
import { attachSession, enforceSessionAuth } from './session-auth';

export function applyProductionShield(app: Application): void {
  app.set('trust proxy', 1);

  app.use(attachSession);
  app.use(enforceSessionAuth);

  app.use('/api', (req, res, next) => {
    const p = req.path;
    if (
      p.startsWith('/v1/topology/telemetry-hit') ||
      p.startsWith('/v2/omni/intrusion') ||
      p.startsWith('/v3.5/zhi/intrusion') ||
      p.startsWith('/v2/mentor/active-intervention')
    ) {
      next();
      return;
    }
    rateLimitGlobalApi(req, res, next);
  });

  app.use('/api/v1/quantum/assimilate', rateLimitAssimilate, rateLimitVideoUrlPayload);
  app.use('/api/v1/quantum/voice-intent', rateLimitAssimilate);
  app.use('/api/v1/quantum/vision-intent', rateLimitAssimilate);
  app.use('/api/v1/video/assimilate', rateLimitVideo);
  app.use('/api/v1/auth/bootstrap', rateLimitAuthBootstrap);
  app.use('/api/v1/payment', rateLimitPayment);
  app.use('/api/v1/billing/create-order', rateLimitPayment);
  app.use('/api/v1/billing/purchase-pack', rateLimitPayment);
}
