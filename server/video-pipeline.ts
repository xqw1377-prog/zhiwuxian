/**
 * WUXIAN · 真实视频管线（P0-2 生产入口）
 */

import type { RawVideoPayload } from '../engine/core/video-assimilation-brain';
import { getAIServiceManager } from '../engine/core/ai-service';
import { conceptHash } from './wuxian-learning-db';
import { getVideoAssimilationService, type KnowledgeNode } from '../src/services/ai-service';
import { getYtDlpVersion, resolveYtDlpInvoker } from '../src/services/yt-dlp-runner';

export interface VideoIngestResult {
  payload: RawVideoPayload;
  source: 'yt-dlp+llm' | 'yt-dlp+heuristic' | 'heuristic' | 'fallback';
  durationMinutes: number;
  subtitleLines: number;
  cellsPreview: { title: string; startSec: number; endSec: number }[];
  knowledgeNodes: KnowledgeNode[];
}

export interface PipelineStatus {
  ytDlp: { available: boolean; version: string | null; invoker: string | null };
  deepseek: { configured: boolean; model: string; baseURL: string };
}

export async function getPipelineStatus(): Promise<PipelineStatus> {
  const inv = await resolveYtDlpInvoker(true);
  const version = inv ? await getYtDlpVersion() : null;
  return {
    ytDlp: {
      available: Boolean(inv),
      version,
      invoker: inv?.label ?? null,
    },
    deepseek: {
      configured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
      model: process.env.WUXIAN_DEEPSEEK_MODEL?.trim() || process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4pro',
      baseURL: process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1',
    },
  };
}

export async function probeYtDlp(): Promise<boolean> {
  const inv = await resolveYtDlpInvoker(true);
  const ok = Boolean(inv);
  getAIServiceManager().setAvailability('yt-dlp', ok);
  return ok;
}

function nodesToPayload(
  nodes: KnowledgeNode[],
  meta: { videoId: string; title: string; sourceUrl: string; durationSec: number; transcript: string },
): RawVideoPayload {
  return {
    videoId: meta.videoId,
    title: meta.title,
    sourceUrl: meta.sourceUrl,
    estimatedDuration: Math.max(1, Math.round(meta.durationSec / 60)),
    frameCount: nodes.length * 30,
    keyframeTimestamps: nodes.map(n => n.timestampStart),
    audioTranscript: meta.transcript,
    ocrTexts: nodes.map(n => n.title.slice(0, 80)),
  };
}

function nodesToPreview(nodes: KnowledgeNode[]) {
  return nodes.map(n => ({
    title: n.title,
    startSec: n.timestampStart,
    endSec: n.timestampEnd,
  }));
}

export async function ingestVideoFromUrl(url: string, goalId = 'session', userId?: string): Promise<VideoIngestResult> {
  const service = getVideoAssimilationService();
  const hasYtDlp = getAIServiceManager().isAvailable('yt-dlp') || await probeYtDlp();

  if (hasYtDlp) {
    try {
      const pipeline = await service.assimilateVideoPipeline(url, goalId, userId);
      const payload = nodesToPayload(pipeline.nodes, {
        videoId: pipeline.videoId,
        title: pipeline.title,
        sourceUrl: url,
        durationSec: pipeline.durationSec,
        transcript: pipeline.transcript,
      });

      return {
        payload,
        source: pipeline.source,
        durationMinutes: payload.estimatedDuration,
        subtitleLines: pipeline.nodes.length,
        cellsPreview: nodesToPreview(pipeline.nodes),
        knowledgeNodes: pipeline.nodes,
      };
    } catch (err) {
      console.warn('[video-pipeline] 真实管线降级:', err instanceof Error ? err.message : err);
    }
  }

  const host = tryParseHost(url);
  const heuristicTitle = host.includes('bilibili') ? 'B站硬核公开课' : host.includes('youtube') ? 'YouTube 长视频' : '在线学习资源';
  const durationMin = 45;
  const fallbackNodes = service.buildFallbackNodes(goalId);

  const payload: RawVideoPayload = {
    videoId: `url-${conceptHash(url)}`,
    title: heuristicTitle,
    sourceUrl: url,
    estimatedDuration: durationMin,
    frameCount: 24,
    audioTranscript: `课程来源：${url}。系统将以指针路由方式折叠时空，请确保链接可公开访问。`,
    ocrTexts: fallbackNodes.map(n => n.title),
    keyframeTimestamps: fallbackNodes.map(n => n.timestampStart),
  };

  return {
    payload,
    source: hasYtDlp ? 'fallback' : 'heuristic',
    durationMinutes: durationMin,
    subtitleLines: fallbackNodes.length,
    cellsPreview: nodesToPreview(fallbackNodes),
    knowledgeNodes: fallbackNodes,
  };
}

function tryParseHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function isVideoUrl(text: string): boolean {
  return /https?:\/\/[^\s]+/i.test(text) && /(bilibili|youtube|youtu\.be|cvideo|ted\.com)/i.test(text);
}

export function knowledgeNodesToCells(nodes: KnowledgeNode[]) {
  return nodes.map(n => ({
    id: n.id,
    name: n.title,
    timestampStart: n.timestampStart,
    timestampEnd: n.timestampEnd,
    densityScore: n.cognitiveLoadScore,
  }));
}
