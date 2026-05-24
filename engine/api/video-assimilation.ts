/**
 * WUXIAN · 视频课件吞噬 API
 * P0-2：默认走真实管线；仅 simulate=true 时启用 Mock
 */

import {
  getVideoBrain,
  simulateVideoPayload,
  simulateLowGradeVideo,
  type RawVideoPayload,
} from '../core/video-assimilation-brain';
import { ingestVideoFromUrl } from '../../server/video-pipeline';

export interface VideoAssimilateRequest {
  userId?: string;
  payload?: RawVideoPayload;
  videoUrl?: string;
  goalId?: string;
  simulate?: boolean;
  lowGradeDemo?: boolean;
  autoReserve?: boolean;
}

export async function assimilateVideo(req: VideoAssimilateRequest = {}) {
  const brain = getVideoBrain();
  const userId = req.userId ?? 'anonymous';
  const goalId = req.goalId ?? req.userId ?? 'session';

  let payload = req.payload;
  let ingestMeta: { source: string; durationMinutes: number; nodeCount: number } | null = null;

  if (req.simulate) {
    payload = req.lowGradeDemo ? simulateLowGradeVideo() : simulateVideoPayload();
  } else if (req.videoUrl) {
    const ingested = await ingestVideoFromUrl(req.videoUrl, goalId);
    payload = ingested.payload;
    ingestMeta = {
      source: ingested.source,
      durationMinutes: ingested.durationMinutes,
      nodeCount: ingested.knowledgeNodes.length,
    };
  }

  if (!payload) {
    throw new Error('缺少 videoUrl 或 payload；演示模式请显式传 simulate=true');
  }

  const report = brain.executeSecondaryAssessment(payload);

  let reserve = null;
  if (req.autoReserve !== false) {
    reserve = brain.saveToCognitiveReserve(userId, report);
  }

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      report,
      reserve,
      filtered: reserve?.status === 'FILTERED',
      stats: brain.getReserveStats(userId),
      protocol: ingestMeta ? 'VIDEO_ASSIMILATION_v3_REAL' : req.simulate ? 'VIDEO_ASSIMILATION_MOCK' : 'VIDEO_ASSIMILATION_v2',
      ingest: ingestMeta,
      toolChain: ingestMeta
        ? ['yt-dlp', 'OpenAI-SemanticChunk', 'SecondaryAssessment', 'SQLite-knowledge_nodes']
        : ['SecondaryAssessment'],
    },
  };
}

export function listVideoReserve(userId = 'anonymous') {
  const brain = getVideoBrain();
  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      reserve: brain.listReserve(userId),
      stats: brain.getReserveStats(userId),
    },
  };
}

export interface ResolveClipRequest {
  userId?: string;
  topic: string;
  minWormholeValue?: number;
}

export function resolveVideoClip(req: ResolveClipRequest) {
  const brain = getVideoBrain();
  const userId = req.userId ?? 'anonymous';
  const clip = brain.resolveClipForBlindSpot(userId, req.topic, req.minWormholeValue ?? 0.5);

  return {
    code: 200,
    status: clip ? 'SUCCESS' : 'NOT_FOUND',
    data: {
      clip,
      message: clip
        ? clip.message
        : '认知储备库暂无匹配切片。请先执行视频吞噬入库。',
    },
  };
}
