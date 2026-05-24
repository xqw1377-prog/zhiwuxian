/**
 * WUXIAN 3.0 · 逆向因果链 / 航标指标精算 API
 */

import type { Application, Request, Response, NextFunction } from 'express';
import { ValidationError } from './errors';
import { trustedBodyUserId, trustedParamUserId } from './trusted-user-id';
import { WUXIAN_API_ZHI, WUXIAN_PRODUCT_VERSION } from './product-version';
import {
  compileSchoolMetrics,
  consultMentorArchitect,
  fetchSchoolMatrix,
  fetchMentorPlan,
  bindDesktopActivePhase,
  registerDestinyHardWork,
} from '../src/api/school-metrics-api';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function sendSuccess(res: Response, data: unknown) {
  res.json({ code: 200, status: 'SUCCESS', data });
}

function wrap(handler: (req: Request, res: Response) => void | Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}

export function registerWuxianV3Routes(app: Application): void {
  app.use('/api/v3', (_req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('X-WUXIAN-API-Deprecated', `v3; use ${WUXIAN_API_ZHI} or /api/v1`);
    res.setHeader('X-WUXIAN-Product-Version', WUXIAN_PRODUCT_VERSION);
    next();
  });

  app.get('/api/v3/school-matrix/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, fetchSchoolMatrix(userId));
  }));

  app.post('/api/v3/school-matrix/compile', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const targetSchool = (req.body.targetSchool ?? req.body.target_school ?? '').trim();
    if (!targetSchool) throw new ValidationError('缺少 targetSchool');

    const currentBaseline =
      req.body.currentBaseline && typeof req.body.currentBaseline === 'object'
        ? (req.body.currentBaseline as Record<string, unknown>)
        : {};

    const useMentor = req.body.mode !== 'metrics';
    sendSuccess(
      res,
      useMentor
        ? await consultMentorArchitect({
            userId,
            targetSchool,
            currentBaseline,
            daysToDeadline: Number(req.body.daysToDeadline ?? req.body.days ?? 180),
          })
        : await compileSchoolMetrics({
            userId,
            targetSchool,
            currentBaseline,
            daysToDeadline: Number(req.body.daysToDeadline ?? req.body.days ?? 180),
          }),
    );
  }));

  app.get('/api/v3/mentor/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, fetchMentorPlan(userId));
  }));

  app.post('/api/v3/mentor/consult', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const targetSchool = (req.body.targetSchool ?? req.body.target_school ?? '').trim();
    if (!targetSchool) throw new ValidationError('缺少 targetSchool');
    const currentBaseline =
      req.body.currentBaseline && typeof req.body.currentBaseline === 'object'
        ? (req.body.currentBaseline as Record<string, unknown>)
        : {};
    sendSuccess(
      res,
      await consultMentorArchitect({
        userId,
        targetSchool,
        currentBaseline,
        daysToDeadline: Number(req.body.daysToDeadline ?? req.body.days ?? 365),
      }),
    );
  }));

  app.post('/api/v3/school-matrix/bind-phase', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(res, bindDesktopActivePhase(userId, req.body.phase));
  }));

  app.post('/api/v3/destiny/hard-work', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const result = await registerDestinyHardWork({
      userId,
      hoursInvested: Number(req.body.hoursInvested ?? req.body.hours ?? 0),
      solvedNodeCount: Number(req.body.solvedNodeCount ?? req.body.solvedNodes ?? 0),
      resolvedConcept:
        typeof req.body.resolvedConcept === 'string'
          ? req.body.resolvedConcept
          : typeof req.body.matchedConcept === 'string'
            ? req.body.matchedConcept
            : undefined,
    });
    if (!result) {
      res.status(404).json({
        code: 404,
        status: 'NOT_FOUND',
        error: '尚未建立导师航标账本，请先召唤导师精算',
      });
      return;
    }
    sendSuccess(res, result);
  }));
}
