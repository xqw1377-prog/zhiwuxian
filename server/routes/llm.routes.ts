import type { Application } from 'express';
import { wrap, sendSuccess, param } from './shared';
import { validateBody, validateParams } from '../middleware/validate';
import { userLlmConfigParamsSchema, userLlmConfigUpsertBodySchema } from '../schemas/llm';
import { assertTrustedUserId, resolveTrustedUserId } from '../middleware/session-auth';
import { getUserLlmSnapshotAll, upsertUserLlmConfig } from '../../src/db/user-llm-config-schema';

export function registerLlmRoutes(app: Application): void {
  app.get(
    '/api/v1/llm/config/:userId',
    validateParams(userLlmConfigParamsSchema),
    wrap((req, res) => {
      const requested = param(req.params.userId);
      assertTrustedUserId(req, requested);
      const userId = resolveTrustedUserId(req, requested);
      sendSuccess(res, { userId, ...getUserLlmSnapshotAll(userId) });
    }),
  );

  app.post(
    '/api/v1/llm/config',
    validateBody(userLlmConfigUpsertBodySchema),
    wrap((req, res) => {
      const body = req.body as {
        userId?: string;
        provider: 'deepseek' | 'qwen';
        apiKey?: string;
        clearKey?: boolean;
        baseURL?: string;
        model?: string;
      };
      const userId = resolveTrustedUserId(req, body.userId ?? '');
      const result = upsertUserLlmConfig({
        userId,
        provider: body.provider,
        apiKey: body.apiKey,
        clearKey: Boolean(body.clearKey),
        baseURL: body.baseURL,
        model: body.model,
      });
      sendSuccess(res, { success: true, hasKey: result.hasKey, userId, ...getUserLlmSnapshotAll(userId) });
    }),
  );
}
