/**
 * WUXIAN · 核心学习特性路由（虫洞 / 学分 / 边缘对话 / 海报）
 */

import type { Application } from 'express';
import { wrap, sendSuccess, param, tocGate } from './shared';
import { validateBody, validateParams } from '../middleware/validate';
import { userIdParamsSchema } from '../schemas/common';
import { z } from 'zod';
import { scanAwareness } from '../../engine/api/awareness';
import { analyzeTalent } from '../../engine/api/talent-radar';
import { evaluateWormhole } from '../../engine/api/wormhole';
import { assimilateClassroomAudio } from '../../engine/api/audio-assimilation';
import { monitorCoLearn } from '../../engine/api/live-correction';
import { semanticMatch } from '../../engine/api/public-course';
import { getPrivacyManager } from '../../engine/core/privacy-consent';
import { getSubscriptionManager } from '../../engine/core/subscription';
import { getTelemetryManager } from '../../engine/core/telemetry';
import { getCreditManager } from '../../engine/core/credits';
import { ValidationError, PaymentRequiredError } from '../errors';
import { insertEdgeUtterance } from '../wuxian-learning-db';
import { PosterGeneratorService } from '../poster-generator';
import { buildShareUrl } from '../shares-signing';
import { bumpReversingMatrixProgress } from '../../src/db/milestone-schema';

const sessionBodySchema = z.object({
  sessionId: z.string().trim().min(1, '缺少 sessionId'),
}).passthrough();

const edgeUtteranceSchema = z.object({
  userId: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  text: z.string().trim().min(1, '缺少 text'),
  fatigue: z.coerce.number().optional(),
});

const creditsTopupSchema = z.object({
  credits: z.coerce.number().int().min(1, 'credits 必须 ≥ 1'),
});

const courseMatchSchema = z.object({
  topic: z.string().trim().min(1, '缺少搜索主题 (topic)'),
}).passthrough();

const posterStarcardSchema = z.object({
  userId: z.string().trim().min(1, '缺少 userId'),
  userName: z.string().optional(),
  whisper: z.string().optional(),
  currentWhisper: z.string().optional(),
});

export function registerFeaturesRoutes(app: Application): void {
  const posterService = new PosterGeneratorService();

  app.post(
    '/api/v1/edge/utterance',
    validateBody(edgeUtteranceSchema),
    wrap((req, res) => {
      const body = req.body as { userId?: string; sessionId?: string; text: string; fatigue?: number };
      const userId = (body.userId ?? body.sessionId ?? 'me').trim();
      const fatigue = Number.isFinite(body.fatigue) ? Number(body.fatigue) : 0;
      const id = insertEdgeUtterance({
        userId,
        sessionId: body.sessionId,
        text: body.text,
        fatigue,
      });
      const speech = [
        '收到，重力异常。',
        '今日航线已自动降维。',
        '那本厚教材今天闭合，别看了。',
        '下午 14:00，我把第三章核心推导压缩成 3 分钟音频切片发到你耳机里。',
        '你闭着眼睛听完，主航线不算掉队。',
      ].join(' ');
      getTelemetryManager().ingest({
        userId,
        sessionId: body.sessionId,
        events: [{
          ts: new Date().toISOString(),
          type: 'VOICE_UTTERANCE',
          payload: { text: body.text, fatigue },
        }],
      });
      sendSuccess(res, {
        id,
        persona: 'WEAVER',
        speech,
        schedule: { at: '14:00', kind: 'AUDIO_CLIP', durationSeconds: 180 },
      });
    }),
  );

  app.get(
    '/api/v1/credits/:userId',
    validateParams(userIdParamsSchema),
    wrap((req, res) => {
      sendSuccess(res, getCreditManager().get(param(req.params.userId)));
    }),
  );

  app.post(
    '/api/v1/credits/:userId/topup',
    validateParams(userIdParamsSchema),
    validateBody(creditsTopupSchema),
    wrap((req, res) => {
      const body = req.body as { credits: number };
      sendSuccess(res, getCreditManager().topUp(param(req.params.userId), body.credits));
    }),
  );

  app.post(
    '/api/v1/audio/assimilate',
    validateBody(sessionBodySchema),
    wrap((req, res) => {
      const credits = getCreditManager().consume(req.body.sessionId, 'AUDIO_ASSIMILATION', req.body);
      if (!credits.allowed) throw new PaymentRequiredError(credits.message);
      const result = assimilateClassroomAudio(req.body);
      sendSuccess(res, { ...result, data: { ...result.data, billing: credits } });
    }),
  );

  app.post(
    '/api/v1/co-learn/monitor',
    validateBody(sessionBodySchema),
    tocGate((req, res) => {
      const credits = getCreditManager().consume(req.body.sessionId, 'CO_LEARN_MONITOR', req.body);
      if (!credits.allowed) throw new PaymentRequiredError(credits.message);
      const result = monitorCoLearn(req.body);
      sendSuccess(res, { ...result, data: { ...result.data, billing: credits } });
    }),
  );

  app.post(
    '/api/v1/wormhole/evaluate',
    validateBody(sessionBodySchema),
    wrap(async (req, res) => {
      const subscription = getSubscriptionManager();
      if (!subscription.canWormhole(req.body.sessionId)) {
        throw new PaymentRequiredError('虫洞跃迁是复活甲（Growth）及以上特权。升级后解锁。');
      }
      const result = evaluateWormhole(req.body);
      const wormhole = result.data?.wormhole;
      if (wormhole?.isJumpTriggered) {
        const userId = String(req.body.userId ?? req.body.sessionId ?? 'anonymous').trim();
        bumpReversingMatrixProgress(userId, 3);
        const posterPath = await posterService.generateDynamicStarCard({
          userId,
          userName: req.body.userName ?? '匿名自学者',
          currentWhisper: '因果链条已重组，进度条向前逼近。',
        });
        const posterUrl = buildShareUrl(posterPath, 3600, userId);
        (result.data as Record<string, unknown>).posterUrl = posterUrl;
        (result.data as Record<string, unknown>).cardUrl = posterUrl;
        (result.data as Record<string, unknown>).posterPath = posterPath;
      }
      sendSuccess(res, result);
    }),
  );

  app.post(
    '/api/v1/talent/analyze',
    validateBody(sessionBodySchema),
    wrap((req, res) => {
      const credits = getCreditManager().consume(req.body.sessionId, 'TALENT_ANALYZE', req.body);
      if (!credits.allowed) throw new PaymentRequiredError(credits.message);
      const result = analyzeTalent(req.body);
      sendSuccess(res, { ...result, data: { ...result.data, billing: credits } });
    }),
  );

  app.post(
    '/api/v1/life/awareness',
    validateBody(sessionBodySchema),
    tocGate((req, res) => {
      const privacy = getPrivacyManager();
      if (!privacy.isGranted(req.body.sessionId, 'emotional_signal')) {
        privacy.requestConsent(req.body.sessionId, 'emotional_signal');
      }
      sendSuccess(res, scanAwareness(req.body));
    }),
  );

  app.get('/api/v1/manifest', wrap(async (_req, res) => {
    const { TOC_MANIFEST } = await import('../toc-manifest');
    const { WUXIAN_MANIFEST } = await import('../../engine/core/brand-manifest');
    const { llmStatus } = await import('../llm/llm-provider');
    sendSuccess(res, { ...TOC_MANIFEST, brandManifest: WUXIAN_MANIFEST, llm: llmStatus() });
  }));

  app.post(
    '/api/v1/course/match',
    validateBody(courseMatchSchema),
    wrap((req, res) => {
      sendSuccess(res, semanticMatch(req.body));
    }),
  );

  app.post(
    '/api/v1/poster/starcard',
    validateBody(posterStarcardSchema),
    wrap(async (req, res) => {
      const body = req.body as { userId: string; userName?: string; whisper?: string; currentWhisper?: string };
      const posterPath = await posterService.generateDynamicStarCard({
        userId: body.userId,
        userName: body.userName ?? '匿名自学者',
        currentWhisper: body.whisper ?? body.currentWhisper ?? '你负责专注，我负责重路由。',
      });
      const posterUrl = buildShareUrl(posterPath, 3600, body.userId);
      sendSuccess(res, { posterUrl, cardUrl: posterUrl, posterPath });
    }),
  );
}
