import { describe, it, expect } from 'vitest';
import express from 'express';
import type { Application } from 'express';

describe('production-shield integration', () => {
  it('applies middleware without error', async () => {
    const mod = await import('../server/middleware/production-shield');
    const app = express() as Application;
    expect(() => mod.applyProductionShield(app)).not.toThrow();
  });

  it('trusts proxy setting is applied', async () => {
    const mod = await import('../server/middleware/production-shield');
    const app = express() as Application;
    mod.applyProductionShield(app);
    expect(app.get('trust proxy')).toBe(1);
  });

  it('rate limiters are exported', async () => {
    const rateMod = await import('../server/middleware/rate-limiter');
    expect(rateMod.rateLimitGlobalApi).toBeDefined();
    expect(rateMod.rateLimitAssimilate).toBeDefined();
    expect(rateMod.rateLimitVideo).toBeDefined();
    expect(rateMod.rateLimitPayment).toBeDefined();
    expect(rateMod.rateLimitAuthBootstrap).toBeDefined();
    expect(rateMod.rateLimitVideoUrlPayload).toBeDefined();
  });

  it('session auth middleware are exported', async () => {
    const authMod = await import('../server/middleware/session-auth');
    expect(authMod.attachSession).toBeDefined();
    expect(authMod.enforceSessionAuth).toBeDefined();
    expect(authMod.extractBearerToken).toBeDefined();
    expect(authMod.isAuthRelaxed).toBeDefined();
    expect(authMod.resolveTrustedUserId).toBeDefined();
    expect(authMod.assertTrustedUserId).toBeDefined();
  });
});
