/**
 * WUXIAN · 扩展 API 路由注册入口
 */

import type { Application } from 'express';
import { getLearningDb } from './wuxian-learning-db';
import { registerAuthRoutes } from './routes/auth.routes';
import { registerWalletRoutes } from './routes/wallet.routes';
import { registerPaymentRoutes } from './routes/payment.routes';
import { registerTelemetryRoutes } from './routes/telemetry.routes';
import { registerQuantumRoutes } from './routes/quantum.routes';
import { registerVideoRoutes } from './routes/video.routes';
import { registerReportRoutes } from './routes/report.routes';
import { registerFeaturesRoutes } from './routes/features.routes';
import { registerLegacyB2BRoutes } from './routes/legacy-b2b.routes';
import { registerPlatformRoutes } from './routes/platform.routes';
import { registerSharesRoutes } from './routes/shares.routes';
import { registerLlmRoutes } from './routes/llm.routes';
import { registerFuelRoutes } from './routes/fuel.routes';
import { registerStripeRoutes } from './routes/stripe.routes';
import { registerLegalRoutes } from './routes/legal.routes';
import { registerIapRoutes } from './routes/iap.routes';
import { registerAdminRoutes } from './routes/admin.routes';
import { registerSocialLoginRoutes } from './routes/social.routes';
import { registerPasswordResetRoutes } from './routes/password-reset.routes';
import { registerCompanionRoutes } from './companion/companion.routes';

export function registerExtendedRoutes(app: Application): void {
  getLearningDb();

  registerAuthRoutes(app);
  registerWalletRoutes(app);
  registerLlmRoutes(app);
  registerFuelRoutes(app);
  registerPaymentRoutes(app);
  registerTelemetryRoutes(app);
  registerQuantumRoutes(app);
  registerVideoRoutes(app);
  registerReportRoutes(app);
  registerFeaturesRoutes(app);
  registerLegacyB2BRoutes(app);
  registerPlatformRoutes(app);
  registerSharesRoutes(app);
  registerStripeRoutes(app);
  registerLegalRoutes(app);
  registerIapRoutes(app);
  registerAdminRoutes(app);
  registerSocialLoginRoutes(app);
  registerPasswordResetRoutes(app);
  registerCompanionRoutes(app);
}
