/**
 * WUXIAN · 遥测路由（含隐私白名单过滤）
 */

import type { Application } from 'express';
import { wrap, sendSuccess, param } from './shared';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { userIdParamsSchema } from '../schemas/common';
import { telemetryIngestBodySchema, telemetryAggregateQuerySchema } from '../schemas/telemetry';
import { getTelemetryManager } from '../../engine/core/telemetry';
import { sanitizeTelemetryEvents } from '../privacy-telemetry';

export function registerTelemetryRoutes(app: Application): void {
  app.post(
    '/api/v1/telemetry/web-vitals',
    wrap((req, res) => {
      const { name, value, rating, url: pageUrl } = req.body as {
        name?: string; value?: number; rating?: string; url?: string;
      };
      if (name && value !== undefined) {
        console.log(`[WebVitals] ${name}: ${value} (${rating ?? 'unknown'}) @ ${pageUrl ?? '?'}`);
      }
      sendSuccess(res, { received: true });
    }),
  );


  app.post(
    '/api/v1/telemetry/ingest',
    validateBody(telemetryIngestBodySchema),
    wrap((req, res) => {
      const body = req.body as {
        userId: string;
        sessionId?: string;
        events: { ts?: string; type: string; payload?: unknown }[];
      };

      const safeEvents = sanitizeTelemetryEvents(
        body.events.map(e => ({
          ts: e.ts ?? new Date().toISOString(),
          type: e.type,
          ...(e.payload !== undefined ? { payload: e.payload as Record<string, unknown> } : {}),
        })),
      );

      if (safeEvents.length === 0) {
        sendSuccess(res, { ingested: 0, filtered: body.events.length });
        return;
      }

      const result = getTelemetryManager().ingest({
        userId: body.userId,
        sessionId: body.sessionId,
        events: safeEvents as Parameters<ReturnType<typeof getTelemetryManager>['ingest']>[0]['events'],
      });
      sendSuccess(res, { ...result, filtered: body.events.length - safeEvents.length });
    }),
  );

  app.get(
    '/api/v1/telemetry/:userId/aggregate',
    validateParams(userIdParamsSchema),
    validateQuery(telemetryAggregateQuerySchema),
    wrap((req, res) => {
      const userId = param(req.params.userId);
      const q = ((req as unknown as { _wuxianQuery?: unknown })._wuxianQuery ?? req.query) as { windowDays?: number };
      const windowDays = q.windowDays ?? 30;
      sendSuccess(res, getTelemetryManager().aggregate(userId, Math.max(1, windowDays) * 24 * 60 * 60 * 1000));
    }),
  );
}
