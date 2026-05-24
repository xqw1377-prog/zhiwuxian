/**
 * WUXIAN · 零侵入视频指针路由 API
 * 语义标签 → 公开视频时间戳，虫洞跃迁零存储
 */

import { resolveVideoClip as legacyResolveClip } from '../engine/api/video-assimilation';
import {
  findNodeByTimestamp,
  getLearningDb,
  listCourseNodes,
  persistKnowledgeGraph,
  type KnowledgeNodeRow,
} from './wuxian-learning-db';
import { evaluateWormholeTransition } from './wormhole-evaluator';

export interface ResolveClipPointerRequest {
  userId: string;
  courseId?: string;
  currentTimestamp?: number;
  telemetryData?: {
    playSpeed?: number;
    skipCount?: number;
    quizScore?: number;
    interactionLatency?: number;
  };
  topic?: string;
  minWormholeValue?: number;
}

export interface PointerRouteResult {
  event: 'WORMHOLE_ACTIVATED' | 'CONTINUE_PLAYBACK' | 'LEGACY_CLIP';
  effect?: 'NEON_CYBERPUNK_WARP';
  redirectToSeconds?: number;
  currentNode?: KnowledgeNodeRow;
  meta: Record<string, unknown>;
}

export function resolveClipPointer(req: ResolveClipPointerRequest): PointerRouteResult {
  const userId = req.userId;

  if (req.courseId && typeof req.currentTimestamp === 'number') {
    const currentNode = findNodeByTimestamp(req.courseId, req.currentTimestamp);
    if (!currentNode) {
      throw new Error('未能在图谱中检索到对应的认知指针');
    }

    const telemetry = req.telemetryData ?? {};
    const evaluation = evaluateWormholeTransition({
      userId,
      nodeId: currentNode.id,
      playSpeed: telemetry.playSpeed ?? 1.0,
      skipCount: telemetry.skipCount ?? 0,
      quizScore: telemetry.quizScore ?? 0.5,
      interactionLatency: telemetry.interactionLatency ?? 3000,
    });

    if (evaluation.status === 'WORMHOLE_TRIGGERED') {
      return {
        event: 'WORMHOLE_ACTIVATED',
        effect: 'NEON_CYBERPUNK_WARP',
        redirectToSeconds: evaluation.targetTimestamp,
        currentNode,
        meta: {
          ...evaluation,
          edgeShield: true,
          transmittedMetrics: ['IL', 'PS'],
          pointerOnly: true,
        },
      };
    }

    return {
      event: 'CONTINUE_PLAYBACK',
      currentNode,
      meta: {
        ...evaluation,
        edgeShield: true,
        transmittedMetrics: ['IL', 'PS'],
      },
    };
  }

  const legacy = legacyResolveClip({
    userId,
    topic: req.topic ?? '',
    minWormholeValue: req.minWormholeValue,
  });

  return {
    event: 'LEGACY_CLIP',
    meta: {
      legacy: true,
      clip: legacy.data.clip,
      message: legacy.data.message,
      status: legacy.status,
    },
  };
}

export function syncAssimilationToLearningGraph(input: {
  userId: string;
  videoId: string;
  title?: string;
  sourceUrl?: string;
  estimatedDurationMin: number;
  cells: { id: string; name: string; timestampStart: number; timestampEnd: number; densityScore: number }[];
}): { courseId: string; nodeCount: number } {
  const courseId = `course-${input.videoId}`;
  return persistKnowledgeGraph({
    courseId,
    title: input.title ?? input.videoId,
    sourceUrl: input.sourceUrl,
    videoId: input.videoId,
    totalDurationSec: Math.round(input.estimatedDurationMin * 60),
    cells: input.cells.map(c => ({
      id: c.id,
      name: c.name,
      densityScore: c.densityScore,
      wormholeValue: c.densityScore,
      reconceptualizedLaTeX: '',
      timestampStart: c.timestampStart,
      timestampEnd: c.timestampEnd,
      prerequisiteIds: [],
      successorIds: [],
    })),
  });
}

export function getCourseGraph(courseId: string) {
  const db = getLearningDb();
  const course = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(courseId);
  const nodes = listCourseNodes(courseId);
  const waterline = db.prepare(`
    SELECT * FROM user_cognitive_waterline WHERE course_id = ?
  `).all(courseId);
  return { course, nodes, waterline };
}
