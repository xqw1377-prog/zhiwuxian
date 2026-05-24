import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectProductionReadinessIssues } from '../server/production-readiness';

describe('production-readiness', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  beforeEach(() => {
    process.env = { ...env };
  });

  it('生产 + AUTH_RELAXED 报错', () => {
    process.env.NODE_ENV = 'production';
    process.env.WUXIAN_AUTH_RELAXED = '1';
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const errors = collectProductionReadinessIssues().filter((i) => i.level === 'error');
    expect(errors.some((e) => e.code === 'AUTH_RELAXED')).toBe(true);
  });

  it('live 支付缺 webhook secret 报错', () => {
    process.env.NODE_ENV = 'production';
    process.env.WUXIAN_PAYMENT_MODE = 'live';
    process.env.WUXIAN_PAYMENT_WEBHOOK_SECRET = 'dev-local-secret';
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    delete process.env.WUXIAN_AUTH_RELAXED;
    const errors = collectProductionReadinessIssues().filter((i) => i.level === 'error');
    expect(errors.some((e) => e.code === 'PAYMENT_WEBHOOK')).toBe(true);
  });
});
