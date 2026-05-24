/**
 * WUXIAN · 钱包与用户配置路由
 */

import type { Application } from 'express';
import { wrap, sendSuccess, param } from './shared';
import { validateBody, validateParams } from '../middleware/validate';
import { userSaveConfigBodySchema, userLanguageBodySchema } from '../schemas/payment';
import { userIdParamsSchema } from '../schemas/common';
import { assertTrustedUserId, resolveTrustedUserId } from '../middleware/session-auth';
import { getWalletSummary } from '../user-wallet';
import { saveUserWalletConfig, getUserCertificationStatus } from '../../src/api/user-api';
import { getUserPreferenceSnapshot, setUserLanguagePreference } from '../../src/api/user-preferences-api';

export function registerWalletRoutes(app: Application): void {
  app.get(
    '/api/v1/wallet/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      const requested = param(req.params.userId);
      assertTrustedUserId(req, requested);
      const userId = resolveTrustedUserId(req, requested);
      sendSuccess(res, getWalletSummary(userId));
    }),
  );

  app.post(
    '/api/v1/user/save-config',
    validateBody(userSaveConfigBodySchema),
    wrap((req, res) => {
      const body = req.body as { userId?: string; apiKey?: string; ltcCode?: string };
      const userId = resolveTrustedUserId(req, body.userId ?? '');
      const result = saveUserWalletConfig({
        userId,
        apiKey: body.apiKey,
        ltcCode: body.ltcCode,
      });
      sendSuccess(res, result);
    }),
  );

  app.get(
    '/api/v1/user/certification/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      const userId = resolveTrustedUserId(req, param(req.params.userId));
      sendSuccess(res, getUserCertificationStatus(userId));
    }),
  );

  app.get(
    '/api/v1/user/preferences/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      const userId = resolveTrustedUserId(req, param(req.params.userId));
      sendSuccess(res, getUserPreferenceSnapshot(userId));
    }),
  );

  app.post(
    '/api/v1/user/preferences/language',
    validateBody(userLanguageBodySchema),
    wrap(async (req, res) => {
      const body = req.body as { userId?: string; lang: 'zh' | 'en'; syncCloud?: boolean | string };
      const userId = resolveTrustedUserId(req, body.userId ?? '');
      const syncCloud =
        typeof body.syncCloud === 'boolean'
          ? body.syncCloud
          : String(body.syncCloud ?? 'true').toLowerCase() !== 'false';
      sendSuccess(res, await setUserLanguagePreference({ userId, lang: body.lang, syncCloud }));
    }),
  );
}
