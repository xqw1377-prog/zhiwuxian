/**
 * WUXIAN · 量子意图 / 拓扑 / 星链路由
 */

import type { Application } from 'express';
import { wrap, sendSuccess, param } from './shared';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { userIdParamsSchema } from '../schemas/common';
import {
  quantumAssimilateBodySchema,
  quantumPulseBodySchema,
  quantumPulseQuerySchema,
  quantumCompleteBodySchema,
  quantumStarcardBodySchema,
  quantumIntentBodySchema,
  reversingMetricsQuerySchema,
  reversingAdvanceBodySchema,
  reversePlanBodySchema,
  topologyTelemetryHitBodySchema,
  topologyVisionInterceptBodySchema,
  relayToggleBodySchema,
  relayDispatchBodySchema,
  relayReferralBodySchema,
} from '../schemas/quantum';
import { ValidationError } from '../errors';
import {
  trustedBodyUserId,
  trustedCaptureUserId,
  trustedParamUserId,
  trustedQueryUserId,
} from '../trusted-user-id';
import { assertTrustedUserId, resolveTrustedUserId } from '../middleware/session-auth';
import {
  assimilateQuantum,
  pulseQuantum,
  completeQuantumNode,
  generateQuantumStarCard,
} from '../quantum-intent-api';
import { parseIntent } from '../quantum-intent-parser';
import { getUserLlmApiKey } from '../../src/db/user-llm-config-schema';
import {
  voiceIntentMulter,
  processVoiceIntent,
} from '../audio-processor';
import { visionIntentMulter, processVisionIntent } from '../vision-capture';
import { reversePlan } from '../../src/api/reversing-engine-api';
import { getReversingMetrics, advanceReversingUnits } from '../../src/db/milestone-schema';
import { visionIntercept } from '../../src/services/vision-router';
import { recordTelemetryHit, getTopologySnapshot, recordDesktopIntercept } from '../../src/api/topology-engine';
import {
  getStarLeagueDashboard,
  toggleRelayValve,
  dispatchVisionViaRelay,
  ingestReferral,
} from '../../src/api/relay-network-api';
import type { TelemetryCaptureType } from '../../src/db/topology-schema';

function bodyUserId(body: { userId?: string }, fallback = 'me'): string {
  return (body.userId ?? fallback).trim() || fallback;
}

export function registerQuantumRoutes(app: Application): void {
  app.post(
    '/api/v1/quantum/assimilate',
    validateBody(quantumAssimilateBodySchema),
    wrap(async (req, res) => {
      const body = req.body as { rawInput: string; userId?: string; sessionId?: string };
      sendSuccess(res, await assimilateQuantum({
        rawInput: body.rawInput,
        userId: bodyUserId(body),
        sessionId: body.sessionId,
      }));
    }),
  );

  app.post(
    '/api/v1/quantum/pulse',
    validateBody(quantumPulseBodySchema),
    wrap((req, res) => {
      const body = req.body as { userId?: string; sessionId?: string };
      sendSuccess(res, pulseQuantum(bodyUserId(body), body.sessionId));
    }),
  );

  app.get(
    '/api/v1/quantum/pulse',
    validateQuery(quantumPulseQuerySchema),
    wrap((req, res) => {
      const q = ((req as unknown as { _wuxianQuery?: unknown })._wuxianQuery ?? req.query) as { userId?: string; sessionId?: string };
      sendSuccess(res, pulseQuantum(q.userId ?? 'me', q.sessionId));
    }),
  );

  app.post(
    '/api/v1/quantum/complete',
    validateBody(quantumCompleteBodySchema),
    wrap(async (req, res) => {
      const body = req.body as {
        userId?: string;
        sessionId: string;
        nodeId?: string;
        userName?: string;
      };
      sendSuccess(res, await completeQuantumNode({
        userId: bodyUserId(body),
        sessionId: body.sessionId,
        nodeId: body.nodeId,
        userName: body.userName,
      }));
    }),
  );

  app.post(
    '/api/v1/quantum/starcard',
    validateBody(quantumStarcardBodySchema),
    wrap((req, res) => {
      const body = req.body as { userId?: string; sessionId?: string };
      sendSuccess(res, generateQuantumStarCard(bodyUserId(body), body.sessionId));
    }),
  );

  app.post(
    '/api/v1/quantum/intent',
    validateBody(quantumIntentBodySchema),
    wrap(async (req, res) => {
      const body = req.body as { rawInput: string };
      const userId = resolveTrustedUserId(req, 'me');
      const deepseekKey = getUserLlmApiKey(userId, 'deepseek') || undefined;
      sendSuccess(res, await parseIntent(body.rawInput, deepseekKey));
    }),
  );

  app.post('/api/v1/quantum/voice-intent', (req, res, next) => {
    voiceIntentMulter(req, res, (err: unknown) => {
      if (err) {
        next(err);
        return;
      }
      void (async () => {
        try {
          const userId = trustedCaptureUserId(req);
          if (!req.file?.path) throw new ValidationError('未捕捉到有效的量子音频流');
          sendSuccess(res, await processVoiceIntent(userId, req.file.path));
        } catch (e) {
          next(e);
        }
      })();
    });
  });

  app.post('/api/v1/quantum/vision-intent', (req, res, next) => {
    visionIntentMulter(req, res, (err: unknown) => {
      if (err) {
        next(err);
        return;
      }
      void (async () => {
        try {
          const userId = trustedCaptureUserId(req);
          if (!req.file?.path) throw new ValidationError('未捕捉到有效的视觉帧');
          sendSuccess(res, await processVisionIntent(userId, req.file.path, req.file.mimetype));
        } catch (e) {
          next(e);
        }
      })();
    });
  });

  app.get(
    '/api/v1/quantum/reversing-metrics',
    validateQuery(reversingMetricsQuerySchema),
    wrap((req, res) => {
      const userId = trustedQueryUserId(req);
      sendSuccess(res, { success: true, metrics: getReversingMetrics(userId) });
    }),
  );

  app.post(
    '/api/v1/topology/telemetry-hit',
    validateBody(topologyTelemetryHitBodySchema),
    wrap(async (req, res) => {
      const body = req.body as {
        userId: string;
        matchedConcept: string;
        screenshotData?: string;
        captureType?: string;
        parentGoalId?: string;
        sessionId?: string;
      };
      const userId = trustedBodyUserId(req);
      const result = body.screenshotData
        ? await recordDesktopIntercept({
            userId,
            matchedConcept: body.matchedConcept,
            screenshotData: body.screenshotData,
            parentGoalId: body.parentGoalId ?? body.sessionId,
          })
        : recordTelemetryHit({
            userId,
            matchedConcept: body.matchedConcept,
            captureType: body.captureType as TelemetryCaptureType | undefined,
            parentGoalId: body.parentGoalId ?? body.sessionId,
          });
      sendSuccess(res, result);
    }),
  );

  app.post(
    '/api/v1/topology/vision-intercept',
    validateBody(topologyVisionInterceptBodySchema),
    wrap(async (req, res) => {
      const body = req.body as {
        userId: string;
        intentText?: string;
        screenshotData?: string;
        parentGoalId?: string;
        sessionId?: string;
        nodeResolved?: boolean;
        resolved?: boolean;
      };
      const userId = trustedBodyUserId(req);
      sendSuccess(res, await visionIntercept({
        userId,
        intentText: body.intentText ?? '',
        screenshotData: body.screenshotData,
        parentGoalId: body.parentGoalId ?? body.sessionId,
        nodeResolved: Boolean(body.nodeResolved ?? body.resolved),
      }));
    }),
  );

  app.get(
    '/api/v1/topology/snapshot/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      sendSuccess(res, getTopologySnapshot(trustedParamUserId(req)));
    }),
  );

  app.get(
    '/api/v1/relay/status/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      sendSuccess(res, getStarLeagueDashboard(trustedParamUserId(req)));
    }),
  );

  app.post(
    '/api/v1/relay/toggle',
    validateBody(relayToggleBodySchema),
    wrap((req, res) => {
      const userId = trustedBodyUserId(req);
      const body = req.body as { enabled?: boolean; active?: boolean };
      sendSuccess(res, toggleRelayValve(userId, Boolean(body.enabled ?? body.active)));
    }),
  );

  app.post(
    '/api/v1/relay/dispatch-vision',
    validateBody(relayDispatchBodySchema),
    wrap(async (req, res) => {
      const body = req.body as {
        userId?: string;
        consumerUserId?: string;
        screenshotData?: string;
        userHint?: string;
        matchedConcept?: string;
      };
      const claimed = (body.userId ?? body.consumerUserId ?? '').trim();
      assertTrustedUserId(req, claimed);
      const userId = resolveTrustedUserId(req, claimed);
      sendSuccess(res, await dispatchVisionViaRelay(userId, {
        screenshotData: body.screenshotData,
        userHint: body.userHint ?? body.matchedConcept,
      }));
    }),
  );

  app.post(
    '/api/v1/relay/referral',
    validateBody(relayReferralBodySchema),
    wrap((req, res) => {
      const body = req.body as {
        referrerUserId: string;
        inviteeUserId?: string;
        userId?: string;
        inviteToken?: string;
        inviteCode?: string;
      };
      sendSuccess(res, ingestReferral({
        referrerUserId: body.referrerUserId,
        inviteeUserId: (body.inviteeUserId ?? body.userId ?? '').trim(),
        inviteToken: body.inviteToken ?? body.inviteCode,
      }));
    }),
  );

  app.post(
    '/api/v1/quantum/reverse-plan',
    validateBody(reversePlanBodySchema),
    wrap(async (req, res) => {
      const body = req.body as {
        userId: string;
        targetDestination: string;
        currentStatus: string;
        daysToDeadline?: number;
        days?: number;
      };
      const daysToDeadline = body.daysToDeadline ?? body.days ?? 180;
      sendSuccess(res, await reversePlan({
        userId: body.userId,
        targetDestination: body.targetDestination,
        currentStatus: body.currentStatus,
        daysToDeadline,
      }));
    }),
  );

  app.post(
    '/api/v1/quantum/reversing-advance',
    validateBody(reversingAdvanceBodySchema),
    wrap((req, res) => {
      const body = req.body as { userId: string; delta?: number };
      sendSuccess(res, {
        success: true,
        metrics: advanceReversingUnits(body.userId, Math.round(body.delta ?? 1)),
      });
    }),
  );
}
