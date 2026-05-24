/**
 * WUXIAN 2.0 · 统一 API 路由（三大纵队）
 * @deprecated 请迁移至 /api/v3.5/zhi/* 与 /api/v1 核心接口。响应带 Deprecation 头。
 */

import type { Application, Request, Response, NextFunction } from 'express';
import { WUXIAN_API_ZHI, WUXIAN_PRODUCT_VERSION } from './product-version';
import { ValidationError } from './errors';
import {
  trustedBodyUserId,
  trustedParamUserId,
  trustedQueryUserId,
  trustedBodyOrSessionUserId,
  trustedCaptureUserId,
} from './trusted-user-id';
import { assertTrustedUserId, resolveTrustedUserId } from './middleware/session-auth';
import { getCognitiveTopology } from '../src/db/cognitive-topology-schema';
import { runAdaptiveRadar } from '../src/services/adaptive-radar';
import {
  getRelayMarketplace,
  toggleRelaySharing,
  requestRelayCompute,
  ingestReferral,
  issueMedalForPoster,
  verifyMedal,
} from '../src/api/relay-network-api';
import { reversePlanWithTopology } from '../src/api/reversing-engine-api';
import { visionIntentMulter, processVisionIntent } from './vision-capture';
import { assimilateQuantum } from './quantum-intent-api';
import { StarLeaguePosterEngine } from '../src/services/poster-generator-v2';
import { buildShareUrl, extractShareRelativePath } from './shares-signing';
import { upsertBaselineStatus } from '../src/db/baseline-schema';
import { generateCustomPath } from '../src/services/planner-engine';
import { listTopologyNodes, pullTopologyMetrics } from '../src/db/topology-schema';
import { triggerActiveIntervention } from '../src/services/active-mentor';
import { ZhiCoreEngine } from '../src/services/zhi-core';
import { enrichZhiIntrusionApiPayload } from '../src/services/zhi-intrusion-compat';
import { upsertWebrtcSession, getWebrtcSession } from './wuxian-learning-db';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function q(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
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

const leaguePosterEngine = new StarLeaguePosterEngine();

export function registerWuxianV2Routes(app: Application): void {
  app.use('/api/v2', (_req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('X-WUXIAN-API-Deprecated', `v2; use ${WUXIAN_API_ZHI} or /api/v1`);
    res.setHeader('X-WUXIAN-Product-Version', WUXIAN_PRODUCT_VERSION);
    next();
  });

  // —— 第二纵队：自适应认知雷达 ——
  app.get('/api/v2/cognitive/topology/:userId', wrap((req, res) => {
    sendSuccess(res, getCognitiveTopology(trustedParamUserId(req)));
  }));

  app.post('/api/v2/cognitive/feed-probe', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const rawInput = (req.body.rawInput ?? '').trim();
    if (!rawInput) throw new ValidationError('缺少 rawInput');
    sendSuccess(res, runAdaptiveRadar({
      userId,
      rawInput,
      fatigueLevel: Number(req.body.fatigueLevel ?? 0.3),
    }));
  }));

  app.post('/api/v2/quantum/reverse-plan', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(res, await reversePlanWithTopology({
      userId,
      targetDestination: (req.body.targetDestination ?? '').trim(),
      currentStatus: (req.body.currentStatus ?? '').trim(),
      daysToDeadline: Number(req.body.daysToDeadline ?? 180),
    }));
  }));

  app.post('/api/v2/planner/baseline', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const currentScores = (req.body.currentScores ?? req.body.scores ?? {}) as Record<string, string>;
    const weakSubjects = Array.isArray(req.body.weakSubjects ?? req.body.weak) ? (req.body.weakSubjects ?? req.body.weak) : [];
    const estimatedHoursPerDay = Number(req.body.estimatedHoursPerDay ?? req.body.hoursPerDay ?? null);
    upsertBaselineStatus({
      userId,
      currentScores,
      weakSubjects: weakSubjects.map((x: unknown) => String(x ?? '')).filter(Boolean),
      estimatedHoursPerDay: Number.isFinite(estimatedHoursPerDay) ? estimatedHoursPerDay : null,
    });
    const plan = await generateCustomPath(userId);
    sendSuccess(res, {
      success: true,
      plan,
      topology: {
        nodes: listTopologyNodes(userId, 24),
        metrics: pullTopologyMetrics(userId),
      },
    });
  }));

  app.post('/api/v2/planner/regenerate', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const plan = await generateCustomPath(userId);
    sendSuccess(res, {
      success: true,
      plan,
      topology: {
        nodes: listTopologyNodes(userId, 24),
        metrics: pullTopologyMetrics(userId),
      },
    });
  }));

  app.get('/api/v2/mentor/active-intervention', wrap(async (req, res) => {
    const userId = trustedQueryUserId(req);
    const force = q(req.query.force) === '1' || q(req.query.force).toLowerCase() === 'true';
    sendSuccess(res, await triggerActiveIntervention(userId, { force }));
  }));

  /** @deprecated 代理至 /api/v3.5/zhi/intrusion（ZHI 学业内核 + 学习快照） */
  app.post('/api/v2/omni/intrusion', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const userText =
      typeof req.body.userText === 'string'
        ? req.body.userText
        : typeof req.body.userFeedback === 'string'
          ? req.body.userFeedback
          : undefined;
    const force = Boolean(req.body.force);
    const focusDirectoryId =
      typeof req.body.focusDirectoryId === 'string' ? req.body.focusDirectoryId : undefined;
    const raw = await ZhiCoreEngine.zhiIntrusion(userId, userText, { focusDirectoryId });
    sendSuccess(res, enrichZhiIntrusionApiPayload(raw, { userText, force }));
  }));

  // —— 第三纵队：分布式中继 + 星盟 ——
  app.get('/api/v2/relay/providers', wrap((_req, res) => {
    sendSuccess(res, getRelayMarketplace());
  }));

  app.post('/api/v2/relay/sharing', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(res, toggleRelaySharing(userId, Boolean(req.body.enabled)));
  }));

  app.post('/api/v2/relay/consume', wrap((req, res) => {
    const consumerClaimed = (req.body.consumerUserId ?? req.body.userId ?? '').trim();
    const providerUserId = (req.body.providerUserId ?? '').trim();
    if (!consumerClaimed || !providerUserId) throw new ValidationError('缺少 consumerUserId 或 providerUserId');
    assertTrustedUserId(req, consumerClaimed);
    const consumerUserId = resolveTrustedUserId(req, consumerClaimed);
    sendSuccess(res, requestRelayCompute({
      consumerUserId,
      providerUserId,
      warpCost: Number(req.body.warpCost ?? 8),
    }));
  }));

  app.post('/api/v2/star-alliance/referral', wrap((req, res) => {
    const referrerUserId = (req.body.referrerUserId ?? '').trim();
    const inviteeUserId = trustedBodyUserId(req, 'inviteeUserId');
    if (!referrerUserId) throw new ValidationError('缺少 referrerUserId');
    sendSuccess(res, ingestReferral({
      referrerUserId,
      inviteeUserId,
      inviteToken: req.body.inviteToken,
    }));
  }));

  app.post('/api/v2/star-alliance/medal', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const rawPoster = (req.body.posterPath ?? req.body.cardUrl ?? '').trim();
    const rel = extractShareRelativePath(rawPoster);
    const posterPath = rel ? `/shares/${rel}` : rawPoster.split('?')[0].split('#')[0];
    if (!posterPath) throw new ValidationError('缺少 posterPath');
    sendSuccess(res, issueMedalForPoster(userId, posterPath));
  }));

  app.get('/api/v2/star-alliance/league-card', wrap(async (req, res) => {
    const userId = trustedQueryUserId(req);
    const userName = q(req.query.userName).trim();
    const cardPath = await leaguePosterEngine.generateLeagueStarCard(userId, userName || userId);
    const cardUrl = buildShareUrl(cardPath, 3600, userId);
    sendSuccess(res, { cardUrl, cardPath });
  }));

  app.get('/api/v2/star-alliance/verify/:medalId', wrap((req, res) => {
    const hash = typeof req.query.h === 'string' ? req.query.h : '';
    sendSuccess(res, verifyMedal(param(req.params.medalId), hash));
  }));

  // —— 第一纵队：伴生端 / 桌面捕获 ——
  app.post('/api/v2/companion/vision-frame', (req, res, next) => {
    visionIntentMulter(req, res, (err: unknown) => {
      if (err) {
        next(err);
        return;
      }
      void (async () => {
        try {
          const userId = trustedCaptureUserId(req);
          if (!req.file?.path) throw new ValidationError('伴生端未传输有效视觉张量');
          const vision = await processVisionIntent(userId, req.file.path, req.file.mimetype);
          const radar = runAdaptiveRadar({
            userId,
            rawInput: vision.rawSpeechText,
            fatigueLevel: 0.35,
          });
          sendSuccess(res, { ...vision, radar, device: req.headers['x-wuxian-device'] ?? 'companion' });
        } catch (e) {
          next(e);
        }
      })();
    });
  });

  app.post('/api/v2/desktop/capture', wrap(async (req, res) => {
    const userId = trustedBodyOrSessionUserId(req, 'userId', 'desktop');
    const rawInput = [
      req.body.activeWindowTitle ? `TITLE:${req.body.activeWindowTitle}` : '',
      req.body.activeWindowUrl ? `URL:${req.body.activeWindowUrl}` : '',
      req.body.ocrText ? `OCR:${req.body.ocrText}` : '',
      req.body.caption ?? req.body.rawInput ?? '桌面屏幕帧捕获',
    ].filter(Boolean).join(' ');

    const radar = runAdaptiveRadar({ userId, rawInput, fatigueLevel: Number(req.body.fatigueLevel ?? 0.25) });
    const assimilate = await assimilateQuantum({
      rawInput,
      userId,
      sessionId: req.body.sessionId,
    });
    sendSuccess(res, {
      radar,
      assimilate,
      topology: getCognitiveTopology(userId),
    });
  }));

  app.post('/api/v2/companion/webrtc/offer', wrap((req, res) => {
    const sessionId = (req.body.sessionId ?? `rtc-${Date.now()}`).toString();
    upsertWebrtcSession(sessionId, req.body.sdp, undefined);
    sendSuccess(res, { sessionId, status: 'offer_stored' });
  }));

  app.post('/api/v2/companion/webrtc/answer', wrap((req, res) => {
    const sessionId = (req.body.sessionId ?? '').toString();
    const session = getWebrtcSession(sessionId);
    if (!session) throw new ValidationError('未知 WebRTC session');
    upsertWebrtcSession(sessionId, session.offer, req.body.sdp);
    sendSuccess(res, { sessionId, status: 'answer_stored' });
  }));

  app.get('/api/v2/companion/webrtc/signal/:sessionId', wrap((req, res) => {
    const session = getWebrtcSession(param(req.params.sessionId));
    if (!session) throw new ValidationError('会话不存在或已过期');
    sendSuccess(res, { offer: session.offer, answer: session.answer, updatedAt: session.updated_at });
  }));
}
