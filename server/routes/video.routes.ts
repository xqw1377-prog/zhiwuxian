/**
 * WUXIAN · 视频同化与指针路由
 */

import type { Application } from 'express';
import { wrap, sendSuccess, param } from './shared';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
  videoAssimilateBodySchema,
  videoReserveQuerySchema,
  videoResolveClipBodySchema,
  courseIdParamsSchema,
} from '../schemas/video';
import { NotFoundError, ValidationError } from '../errors';
import { assimilateVideo, listVideoReserve } from '../../engine/api/video-assimilation';
import { consumeWarpPower, WARP_PACKS } from '../billing-api';
import { getTelemetryManager } from '../../engine/core/telemetry';
import { resolveClipPointer, syncAssimilationToLearningGraph, getCourseGraph } from '../video-pointer-api';
import { ingestCoursewareFromAssimilation } from '../../src/services/zhi-courseware-ingest';

export function registerVideoRoutes(app: Application): void {
  app.get('/api/v1/video/pipeline/status', wrap(async (_req, res) => {
    const { getPipelineStatus } = await import('../video-pipeline');
    sendSuccess(res, await getPipelineStatus());
  }));

  app.post(
    '/api/v1/video/assimilate',
    validateBody(videoAssimilateBodySchema),
    wrap(async (req, res) => {
      const body = req.body as Record<string, unknown> & {
        userId?: string;
        sessionId?: string;
        goalId?: string;
        videoUrl?: string;
        simulate?: boolean;
        videoDurationMinutes?: number;
        payload?: {
          estimatedDuration?: number;
          videoId?: string;
          title?: string;
          sourceUrl?: string;
        };
      };

      const userId = String(body.userId ?? body.sessionId ?? '').trim();

      let durationMin = Number(
        body.payload?.estimatedDuration ?? body.videoDurationMinutes ?? 60,
      );
      if (body.videoUrl && !body.simulate) {
        const { ingestVideoFromUrl } = await import('../video-pipeline');
        const ingested = await ingestVideoFromUrl(
          body.videoUrl,
          String(body.goalId ?? body.sessionId ?? userId),
          userId,
        );
        durationMin = ingested.durationMinutes;
        body.payload = ingested.payload;
      }

      const warp = consumeWarpPower({
        userId,
        videoDurationMinutes: durationMin,
        goalId: String(body.sessionId ?? body.goalId ?? ''),
        videoId: body.payload?.videoId,
      });
      if (!warp.success) {
        res.status(402).json({
          code: 402,
          status: 'INSUFFICIENT_WARP_POWER',
          data: { ...warp, packs: WARP_PACKS },
        });
        return;
      }

      const result = await assimilateVideo({ ...body, userId } as Parameters<typeof assimilateVideo>[0]);
      const report = result.data.report;
      const graph = syncAssimilationToLearningGraph({
        userId,
        videoId: report.videoId,
        title: body.payload?.title,
        sourceUrl: body.payload?.sourceUrl,
        estimatedDurationMin: body.payload?.estimatedDuration ?? 60,
        cells: report.knowledgeCells,
      });
      getTelemetryManager().ingest({
        userId,
        sessionId: body.sessionId as string | undefined,
        events: [{
          ts: new Date().toISOString(),
          type: 'VIDEO_ASSIMILATION',
          payload: {
            videoId: report.videoId,
            grade: report.overallGrade,
            foldRate: report.spatialFoldRate,
            courseId: graph.courseId,
            nodeCount: graph.nodeCount,
          },
        }],
      });

      const coursewareIngest = ingestCoursewareFromAssimilation({
        userId,
        sourceUrl: body.videoUrl ?? body.payload?.sourceUrl,
        title: body.payload?.title,
        durationMin: durationMin,
        simulate: Boolean(body.simulate),
        report,
      });

      sendSuccess(res, {
        ...result,
        data: {
          ...result.data,
          billing: warp,
          warpPower: warp,
          courseId: graph.courseId,
          nodeCount: graph.nodeCount,
          pointerRouting: 'ZERO_STORAGE',
          coursewareIngest,
        },
      });
    }),
  );

  app.get(
    '/api/v1/video/reserve',
    validateQuery(videoReserveQuerySchema),
    wrap((req, res) => {
      const q = ((req as unknown as { _wuxianQuery?: unknown })._wuxianQuery ?? req.query) as { userId?: string };
      sendSuccess(res, listVideoReserve(q.userId ?? 'anonymous'));
    }),
  );

  app.post(
    '/api/v1/video/resolve-clip',
    validateBody(videoResolveClipBodySchema),
    wrap((req, res) => {
      const body = req.body as {
        userId?: string;
        sessionId?: string;
        courseId?: string;
        currentTimestamp?: number;
        telemetryData?: unknown;
        topic?: string;
        minWormholeValue?: number;
      };

      const userId = String(body.userId ?? body.sessionId ?? '').trim();
      const hasPointerRoute = body.courseId && typeof body.currentTimestamp === 'number';

      if (hasPointerRoute) {
        try {
          const result = resolveClipPointer({
            userId,
            courseId: body.courseId!,
            currentTimestamp: body.currentTimestamp!,
            telemetryData: body.telemetryData as {
              playSpeed?: number;
              skipCount?: number;
              quizScore?: number;
              interactionLatency?: number;
            } | undefined,
          });

          if (result.event === 'WORMHOLE_ACTIVATED') {
            getTelemetryManager().ingest({
              userId,
              sessionId: body.sessionId,
              events: [{
                ts: new Date().toISOString(),
                type: 'WORMHOLE_WARP',
                payload: {
                  courseId: body.courseId,
                  redirectToSeconds: result.redirectToSeconds,
                  IL: (result.meta as { metrics?: { IL: number } }).metrics?.IL,
                  PS: (result.meta as { metrics?: { PS: number } }).metrics?.PS,
                },
              }],
            });
          }

          res.json({ code: 200, status: 'SUCCESS', data: result });
        } catch (err) {
          if (err instanceof Error && err.message.includes('认知指针')) {
            throw new NotFoundError('KnowledgeNode', String(body.currentTimestamp));
          }
          throw err;
        }
        return;
      }

      if (!body.topic?.trim()) throw new ValidationError('缺少 courseId+currentTimestamp 或 topic');
      const result = resolveClipPointer({
        userId,
        topic: body.topic,
        minWormholeValue: body.minWormholeValue,
      });
      if (result.event === 'LEGACY_CLIP' && result.meta.clip) {
        const clip = result.meta.clip as {
          cellName: string;
          wormholeValue: number;
          timestampStart: number;
          durationSeconds: number;
        };
        getTelemetryManager().ingest({
          userId,
          sessionId: body.sessionId,
          events: [{
            ts: new Date().toISOString(),
            type: 'CLIP_RESOLVED',
            payload: {
              topic: body.topic,
              cellName: clip.cellName,
              wormholeValue: clip.wormholeValue,
              timestampStart: clip.timestampStart,
              durationSeconds: clip.durationSeconds,
            },
          }],
        });
      }
      sendSuccess(res, result);
    }),
  );

  app.get(
    '/api/v1/course/:courseId/graph',
    validateParams(courseIdParamsSchema),
    wrap((req, res) => {
      const courseId = param(req.params.courseId);
      const graph = getCourseGraph(courseId);
      if (!graph.course) throw new NotFoundError('Course', courseId);
      sendSuccess(res, graph);
    }),
  );
}
