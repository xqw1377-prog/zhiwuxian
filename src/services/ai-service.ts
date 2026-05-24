/**
 * WUXIAN · 真实视频同化流水线
 * yt-dlp 字幕/元数据 → LLM 语义密度分块 → knowledge_nodes 指针
 */

import { getAIServiceManager } from '../../engine/core/ai-service';
import { conceptHash } from '../../server/wuxian-learning-db';
import { gatewayJsonCompletion } from './llm-gateway';
import { resolveYtDlpInvoker, runYtDlp } from './yt-dlp-runner';

export interface KnowledgeNode {
  id: string;
  timestampStart: number;
  timestampEnd: number;
  semanticHash: string;
  title: string;
  cognitiveLoadScore: number;
}

interface YtDlpMeta {
  id?: string;
  title?: string;
  duration?: number;
  webpage_url?: string;
  description?: string;
  tags?: string[];
  subtitles?: Record<string, Array<{ ext: string; url: string }>>;
  automatic_captions?: Record<string, Array<{ ext: string; url: string }>>;
}

interface LlmChunkResponse {
  nodes: Array<{
    timestampStart: number;
    timestampEnd: number;
    title: string;
    cognitiveLoadScore?: number;
  }>;
}

function semanticHash(title: string): string {
  return Buffer.from(title, 'utf8').toString('base64').replace(/[+/=]/g, '').slice(0, 12);
}

function clampScore(v: number): number {
  return Math.max(0.1, Math.min(1, v));
}

function parseVttTime(t: string): number {
  const clean = t.trim().replace(',', '.');
  const p = clean.split(':').map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return 0;
}

function vttToPlainText(vtt: string): string {
  return vtt
    .split('\n')
    .filter(line => line && !line.startsWith('WEBVTT') && !line.includes('-->'))
    .map(line => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
    .join(' ');
}

function heuristicChunk(text: string, durationSec: number): KnowledgeNode[] {
  const sentences = text
    .split(/[。！？.!?\n,，;；]+/)
    .map(s => s.trim())
    .filter(s => s.length > 4);

  const seeds = sentences.length > 0
    ? sentences
    : [text || '课程导论', '核心概念折叠', '刻意练习节点', '瓶颈突破锚点'];

  const targetNodes = Math.min(5, Math.max(3, Math.ceil(seeds.length / 2)));
  const perNode = Math.max(1, Math.ceil(seeds.length / targetNodes));
  const secPerNode = durationSec / targetNodes;

  return Array.from({ length: targetNodes }, (_, i) => {
    const slice = seeds.slice(i * perNode, (i + 1) * perNode).join(' · ').slice(0, 64);
    const title = slice || `认知节点 ${i + 1}`;
    const hasMath = /[=∫∑矩阵公式推导]/.test(slice);
    return {
      id: `node_heuristic_${i}`,
      timestampStart: Math.floor(i * secPerNode),
      timestampEnd: Math.floor((i + 1) * secPerNode),
      semanticHash: semanticHash(title),
      title,
      cognitiveLoadScore: clampScore(hasMath ? 0.9 : 0.45),
    };
  });
}

async function fetchYtDlpMeta(videoUrl: string): Promise<YtDlpMeta | null> {
  try {
    const stdout = await runYtDlp([
      '--dump-single-json',
      '--skip-download',
      '--no-playlist',
      '--socket-timeout', '20',
      '--retries', '3',
      videoUrl,
    ]);
    return JSON.parse(stdout) as YtDlpMeta;
  } catch (err) {
    console.warn('[VideoAssimilation] yt-dlp meta:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchSubtitleText(meta: YtDlpMeta): Promise<string> {
  const tracks = { ...(meta.subtitles ?? {}), ...(meta.automatic_captions ?? {}) };
  const langs = ['zh-Hans', 'zh', 'en', 'ja'];

  for (const lang of langs) {
    const list = tracks[lang];
    if (!list?.length) continue;
    const track = list.find(t => t.ext === 'vtt' || t.ext === 'srv3' || t.ext === 'json3') ?? list[0];
    try {
      const res = await fetch(track.url, { signal: AbortSignal.timeout(30000) });
      const raw = await res.text();
      const plain = track.ext === 'vtt' ? vttToPlainText(raw) : raw.replace(/[{}"\[\]]/g, ' ').slice(0, 8000);
      if (plain.trim().length > 40) return plain;
    } catch {
      continue;
    }
  }

  const parts = [meta.title, meta.description, ...(meta.tags ?? [])].filter(Boolean);
  return parts.join('\n').slice(0, 8000);
}

async function llmSemanticChunk(
  title: string,
  rawText: string,
  durationSec: number,
  userId?: string,
): Promise<KnowledgeNode[] | null> {
  const uid = userId?.trim();
  if (!uid) return null;

  const messages = [
    {
      role: 'system' as const,
      content: `你是 WUXIAN 核心同化引擎。将冗长视频文本压缩折叠为非线性认知节点。
必须输出 JSON：{ "nodes": [{ "timestampStart": number, "timestampEnd": number, "title": string, "cognitiveLoadScore": number }] }
规则：3-5 个硬核节点；纯数学公式推导 cognitiveLoadScore=0.9；应用场景=0.4；废话全删。
timestampEnd 不得超过视频总时长 ${durationSec} 秒。`,
    },
    {
      role: 'user' as const,
      content: `视频标题: ${title}\n总时长(秒): ${durationSec}\n文本上下文:\n${rawText.slice(0, 8000)}`,
    },
  ];

  const gw = await gatewayJsonCompletion<LlmChunkResponse>(uid, messages, {
    traceId: `video_chunk_${uid}`,
    temperature: 0.2,
    billable: false,
  });

  const parsed = gw.data;
  if (!parsed) return null;
  if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) return null;

  return parsed.nodes.slice(0, 5).map((node, index) => ({
    id: `node_llm_${index}`,
    timestampStart: Math.max(0, Math.floor(node.timestampStart ?? 0)),
    timestampEnd: Math.min(durationSec, Math.max(1, Math.floor(node.timestampEnd ?? durationSec))),
    semanticHash: semanticHash(node.title ?? `节点${index + 1}`),
    title: (node.title ?? `认知节点 ${index + 1}`).slice(0, 80),
    cognitiveLoadScore: clampScore(node.cognitiveLoadScore ?? 0.5),
  }));
}

export class VideoAssimilationService {
  /**
   * 核心管线：真实 URL → yt-dlp 字幕 → LLM 语义分块 → 星团节点
   */
  async assimilateVideoPipeline(videoUrl: string, goalId: string, userId?: string): Promise<{
    nodes: KnowledgeNode[];
    source: 'yt-dlp+llm' | 'yt-dlp+heuristic' | 'fallback';
    videoId: string;
    title: string;
    durationSec: number;
    transcript: string;
  }> {
    const ai = getAIServiceManager();

    const inv = await resolveYtDlpInvoker(true);
    if (!inv) {
      ai.setAvailability('yt-dlp', false);
      throw new Error('yt-dlp 未安装。请 pip install yt-dlp 或设置 YT_DLP_PATH / PYTHON_PATH');
    }
    ai.setAvailability('yt-dlp', true);

    const meta = await fetchYtDlpMeta(videoUrl);
    if (!meta) throw new Error('yt-dlp 元数据拉取失败');

    const durationSec = meta.duration ?? 3600;
    const title = meta.title ?? '在线课程';
    const transcript = await fetchSubtitleText(meta);
    const videoId = meta.id ?? conceptHash(videoUrl).slice(0, 12);

    let nodes: KnowledgeNode[] | null = null;
    let source: 'yt-dlp+llm' | 'yt-dlp+heuristic' = 'yt-dlp+heuristic';

    try {
      nodes = await llmSemanticChunk(title, transcript, durationSec, userId);
      if (nodes?.length) source = 'yt-dlp+llm';
    } catch (err) {
      console.warn('[VideoAssimilation] LLM 分块降级:', err instanceof Error ? err.message : err);
    }

    if (!nodes?.length) {
      nodes = heuristicChunk(transcript, durationSec);
    }

    const stamped = nodes.map((node, index) => ({
      ...node,
      id: `node_${goalId}_${index}`,
    }));

    return {
      nodes: stamped,
      source,
      videoId: `yt-${videoId}`,
      title,
      durationSec,
      transcript,
    };
  }

  buildFallbackNodes(goalId: string): KnowledgeNode[] {
    return [{
      id: `fallback_${goalId}_${Date.now()}`,
      timestampStart: 0,
      timestampEnd: 600,
      semanticHash: 'FB_HASH',
      title: '基础认知锚点 (流媒体异常兜底)',
      cognitiveLoadScore: 0.5,
    }];
  }
}

let serviceInstance: VideoAssimilationService | null = null;

export function getVideoAssimilationService(): VideoAssimilationService {
  if (!serviceInstance) serviceInstance = new VideoAssimilationService();
  return serviceInstance;
}
