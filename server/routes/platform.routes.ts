/**
 * WUXIAN · 平台能力路由（隐私 / 订阅 / AI 健康）
 */

import type { Application } from 'express';
import { wrap, sendSuccess, param } from './shared';
import { validateBody, validateParams } from '../middleware/validate';
import { userIdParamsSchema } from '../schemas/common';
import { z } from 'zod';
import { getPrivacyManager } from '../../engine/core/privacy-consent';
import { getSubscriptionManager } from '../../engine/core/subscription';
import { getAIServiceManager } from '../../engine/core/ai-service';
import { llmStatus } from '../llm/llm-provider';

const privacyCategorySchema = z.object({
  category: z.string().trim().min(1, '缺少数据类别 (category)'),
});

const subscriptionUpgradeSchema = z.object({
  tier: z.enum(['growth', 'pro'], { message: '套餐类型无效 (growth/pro)' }),
});

const aiServiceParamsSchema = z.object({
  service: z.string().trim().min(1),
});

export function registerPlatformRoutes(app: Application): void {
  app.get(
    '/api/privacy/consents/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      const userId = param(req.params.userId);
      const consent = getPrivacyManager();
      const profile = consent.getProfile(userId);
      if (!profile) {
        res.json({ code: 200, status: 'SUCCESS', data: { consents: [], message: '新用户，请先初始化隐私偏好' } });
        return;
      }
      sendSuccess(res, { consents: consent.getConsentSummary(userId) });
    }),
  );

  app.post(
    '/api/privacy/consents/:userId/grant',
    validateParams(userIdParamsSchema),
    validateBody(privacyCategorySchema),
    wrap((req, res) => {
      sendSuccess(res, getPrivacyManager().grant(param(req.params.userId), req.body.category));
    }),
  );

  app.post(
    '/api/privacy/consents/:userId/deny',
    validateParams(userIdParamsSchema),
    validateBody(privacyCategorySchema),
    wrap((req, res) => {
      sendSuccess(res, getPrivacyManager().deny(param(req.params.userId), req.body.category));
    }),
  );

  app.post(
    '/api/privacy/export/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      sendSuccess(res, getPrivacyManager().requestDataExport(param(req.params.userId)));
    }),
  );

  app.post(
    '/api/privacy/delete/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      sendSuccess(res, getPrivacyManager().requestDeletion(param(req.params.userId)));
    }),
  );

  app.get('/api/subscription/plans', wrap((_req, res) => {
    sendSuccess(res, { plans: getSubscriptionManager().listPlans() });
  }));

  app.get(
    '/api/subscription/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      const userId = param(req.params.userId);
      const sub = getSubscriptionManager();
      sendSuccess(res, {
        subscription: sub.getSubscription(userId),
        upgradeSuggestion: sub.getPlanUpgradeSuggestion(userId),
      });
    }),
  );

  app.post(
    '/api/subscription/:userId/upgrade',
    validateParams(userIdParamsSchema),
    validateBody(subscriptionUpgradeSchema),
    wrap((req, res) => {
      const userId = param(req.params.userId);
      const body = req.body as { tier: 'growth' | 'pro' };
      const sub = getSubscriptionManager();
      const result = sub.upgrade(userId, body.tier);
      sendSuccess(res, { subscription: result, message: `已升级至 ${sub.getPlan(body.tier).label}` });
    }),
  );

  app.post(
    '/api/subscription/:userId/downgrade',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      const sub = getSubscriptionManager();
      sendSuccess(res, { subscription: sub.downgradeToFree(param(req.params.userId)), message: '已切换至星尘漫游者' });
    }),
  );

  app.get('/api/ai/health', wrap((_req, res) => {
    sendSuccess(res, {
      services: getAIServiceManager().healthCheckAll(),
      llm: llmStatus(),
    });
  }));

  app.post(
    '/api/ai/health/:service',
    validateParams(aiServiceParamsSchema),
    wrap((req, res) => {
      sendSuccess(res, getAIServiceManager().healthCheck(param(req.params.service) as never));
    }),
  );
}
