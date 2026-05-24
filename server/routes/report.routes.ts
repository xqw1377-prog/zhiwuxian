/**
 * WUXIAN · 认知报告与雷达海报路由
 */

import type { Application } from 'express';
import { wrap, sendSuccess, param } from './shared';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { userIdParamsSchema } from '../schemas/common';
import {
  reportGenerateBodySchema,
  reportIdParamsSchema,
  reportUnlockBodySchema,
  reportCognitiveQuerySchema,
  reportPosterQuerySchema,
  reportRadarQuerySchema,
} from '../schemas/report';
import { NotFoundError, ValidationError } from '../errors';
import { assertTrustedUserId, resolveTrustedUserId } from '../middleware/session-auth';
import {
  generateCognitiveReport,
  getCognitiveReport,
  verifyReportShareToken,
} from '../billing-api';
import { renderCognitiveCertificateSvg } from '../cognitive-report-poster';
import { createPaymentOrder, fulfillOrder } from '../payment-api';
import { getWalletSummary } from '../user-wallet';
import { generateRadarCard } from '../../engine/core/radar-report';
import { renderRadarPosterSvg } from '../../engine/core/radar-poster';
import { sendSvgPoster } from '../svg-response';
import { verifyShareToken } from '../shares-signing';

export function registerReportRoutes(app: Application): void {
  app.post(
    '/api/v1/report/generate',
    validateBody(reportGenerateBodySchema),
    wrap((req, res) => {
      const body = req.body as {
        userId?: string;
        sessionId?: string;
        goalId?: string;
        courseId?: string;
      };
      const userId = resolveTrustedUserId(req, (body.userId ?? body.sessionId ?? '').trim());
      sendSuccess(res, generateCognitiveReport({
        userId,
        goalId: body.goalId ?? body.sessionId,
        courseId: body.courseId,
      }));
    }),
  );

  app.post(
    '/api/v1/report/cognitive/:reportId/unlock',
    validateParams(reportIdParamsSchema),
    validateBody(reportUnlockBodySchema),
    wrap(async (req, res) => {
      const reportId = param(req.params.reportId);
      const body = req.body as { userId: string; orderId?: string };
      assertTrustedUserId(req, body.userId);
      const userId = resolveTrustedUserId(req, body.userId);

      if (body.orderId) {
        const order = fulfillOrder(body.orderId.trim());
        if (order.userId !== userId) throw new ValidationError('订单与用户不匹配');
        sendSuccess(res, {
          order,
          report: getCognitiveReport(reportId, userId),
          wallet: getWalletSummary(userId),
        });
        return;
      }

      const order = await createPaymentOrder(userId, 'report_unlock', { reportId });
      sendSuccess(res, {
        order,
        simulateHint: '调用 POST /api/v1/payment/confirm 或在本接口传 orderId 完成解锁',
        preview: getCognitiveReport(reportId, userId),
      });
    }),
  );

  app.get(
    '/api/v1/report/cognitive/:reportId',
    validateParams(reportIdParamsSchema),
    validateQuery(reportCognitiveQuerySchema),
    wrap((req, res) => {
      const reportId = param(req.params.reportId);
      const q = ((req as unknown as { _wuxianQuery?: unknown })._wuxianQuery ?? req.query) as { userId?: string };
      const userId = resolveTrustedUserId(req, q.userId ?? '');
      const report = getCognitiveReport(reportId, userId);
      if (!report) throw new NotFoundError('CognitiveReport', reportId);
      sendSuccess(res, report);
    }),
  );

  app.get(
    '/api/v1/report/cognitive/:reportId/poster.svg',
    validateParams(reportIdParamsSchema),
    validateQuery(reportPosterQuerySchema),
    wrap((req, res) => {
      const reportId = param(req.params.reportId);
      const q = ((req as unknown as { _wuxianQuery?: unknown })._wuxianQuery ?? req.query) as { token?: string; t?: string };
      const signed = typeof q.t === 'string' ? q.t.trim() : '';
      if (signed) {
        const v = verifyShareToken(signed);
        if (!v.ok || v.scope !== 'report_poster' || v.key !== reportId) {
          res.status(403).end('Report locked or invalid token');
          return;
        }
      } else {
        if (!verifyReportShareToken(reportId, q.token ?? '')) {
          res.status(403).end('Report locked or invalid token');
          return;
        }
      }
      const report = getCognitiveReport(reportId);
      if (!report) {
        res.status(404).end('Not found');
        return;
      }
      if (!report.isUnlocked) {
        res.status(403).end('Report locked or invalid token');
        return;
      }
      const svg = renderCognitiveCertificateSvg({
        userId: report.userId,
        ilPeak: report.ilPeak,
        psPeak: report.psPeak,
        resilienceDensity: report.resilienceDensity,
        summaryText: report.summaryText,
        generatedAt: report.createdAt,
      });
      sendSvgPoster(res, svg, `wuxian-cert-${reportId.slice(0, 8)}.svg`, { cacheSeconds: 3600 });
    }),
  );

  app.get(
    '/api/v1/report/radar/:userId',
    validateParams(userIdParamsSchema),
    validateQuery(reportRadarQuerySchema),
    wrap((req, res) => {
      const requested = param(req.params.userId);
      assertTrustedUserId(req, requested);
      const userId = resolveTrustedUserId(req, requested);
      const q = ((req as unknown as { _wuxianQuery?: unknown })._wuxianQuery ?? req.query) as { windowDays?: number };
      const windowDays = q.windowDays ?? 30;
      sendSuccess(res, generateRadarCard(userId, Math.max(1, windowDays)));
    }),
  );

  app.get(
    '/api/v1/report/radar/:userId/poster.svg',
    validateParams(userIdParamsSchema),
    validateQuery(reportRadarQuerySchema),
    wrap((req, res) => {
      const requested = param(req.params.userId);
      assertTrustedUserId(req, requested);
      const userId = resolveTrustedUserId(req, requested);
      const q = ((req as unknown as { _wuxianQuery?: unknown })._wuxianQuery ?? req.query) as { windowDays?: number };
      const windowDays = q.windowDays ?? 30;
      const report = generateRadarCard(userId, Math.max(1, windowDays));
      const svg = renderRadarPosterSvg(report);
      sendSvgPoster(res, svg, `wuxian-radar-${userId.slice(0, 8)}.svg`);
    }),
  );
}
