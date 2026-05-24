import type OpenAI from 'openai';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { cognizeTopologyNode, recordTelemetryHit } from '../api/topology-engine';
import { DestinyExecutionEngine } from './destiny-engine';
import { upgradeDatabaseToTopology } from '../db/topology-schema';
import { resolveUserLlm } from './deepseek-client';
import { chargePlatformCompute } from './billing-hub';
import {
  resolveDeepseekGatewayLlm,
  resolveVisionGatewayLlm,
} from './llm-gateway';
import { FUEL_TASK_POLICY, fuelOpenAiMessages, fuelText } from './llm-fuel-gateway';
import type { LlmChatMessageParam } from '../../server/llm/llm-provider';

type EmbeddingRow = {
  node_id: string;
  user_id: string;
  model: string;
  dim: number;
  embedding_json: string;
  updated_at: number;
};

function toDataUrl(screenshotData: string): string | null {
  const s = screenshotData.trim();
  if (!s) return null;
  if (s.startsWith('data:image/')) return s;
  const bare = s.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(bare) && bare.length > 200) {
    return `data:image/png;base64,${bare}`;
  }
  return null;
}

function clampLen(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return t.slice(0, n);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!denom) return 0;
  return dot / denom;
}

async function embedText(openai: OpenAI, text: string, model = 'text-embedding-3-small'): Promise<number[]> {
  const client = openai as any;
  const resp = await client.embeddings.create({
    model,
    input: text,
  });
  const vec = resp?.data?.[0]?.embedding as number[] | undefined;
  if (!Array.isArray(vec) || vec.length < 8) throw new Error('embedding 生成失败');
  return vec;
}

async function extractConcept(
  userId: string,
  dataUrl: string | null,
  intentText: string,
  usesPrivateKey: boolean,
): Promise<string> {
  const hint = intentText?.trim() || '我卡在这步了。';
  if (!dataUrl || !usesPrivateKey) {
    const gw = await fuelText(userId, 'VISION_INTERCEPT', [
      {
        role: 'system',
        content: '提取用户描述中阻碍学习进度的核心学术概念。只输出概念名称，中文优先。',
      },
      { role: 'user', content: hint },
    ], {
      traceId: `vision_concept_${userId}`,
      policyOverride: { cost: 0, channel: 'text', maxTokens: 120 },
    });
    const text = (gw.data ?? hint).trim();
    return clampLen(text.replace(/["'“”]/g, ''), 80);
  }

  const messages: LlmChatMessageParam[] = [
    {
      role: 'system',
      content:
        '你是冷酷的一针见血的学习监视器。分析截图与用户碎碎念，提取当前阻碍前进的核心学术/技术概念。只输出概念名称，中文优先，禁止废话。',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: `用户吐槽: ${hint}` },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ];
  const gw = await fuelOpenAiMessages(userId, 'VISION_INTERCEPT', messages, {
    traceId: `vision_concept_mm_${userId}`,
    policyOverride: { cost: 0, maxTokens: 140 },
  });
  const extracted = (gw.data ?? '').trim();
  const cleaned = extracted.replace(/["'“”]/g, '').trim();
  return clampLen(cleaned || hint, 80);
}

function getNodeTitles(userId: string, limit: number): Array<{ node_id: string; node_title: string; hit_count: number; status: string }> {
  upgradeDatabaseToTopology();
  const db = getLearningDb();
  return db.prepare(`
    SELECT node_id, node_title, hit_count, status
    FROM cognitive_topology_nodes
    WHERE user_id = ?
    ORDER BY hit_count DESC, created_at DESC
    LIMIT ?
  `).all(userId, limit) as Array<{ node_id: string; node_title: string; hit_count: number; status: string }>;
}

function getEmbeddingRow(nodeId: string): EmbeddingRow | null {
  const db = getLearningDb();
  const row = db.prepare(`
    SELECT node_id, user_id, model, dim, embedding_json, updated_at
    FROM cognitive_topology_embeddings
    WHERE node_id = ?
  `).get(nodeId) as EmbeddingRow | undefined;
  return row ?? null;
}

function upsertEmbeddingRow(input: { nodeId: string; userId: string; model: string; vec: number[] }): void {
  const db = getLearningDb();
  db.prepare(`
    INSERT INTO cognitive_topology_embeddings (node_id, user_id, model, dim, embedding_json, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(node_id) DO UPDATE SET
      model = excluded.model,
      dim = excluded.dim,
      embedding_json = excluded.embedding_json,
      updated_at = excluded.updated_at
  `).run(
    input.nodeId,
    input.userId,
    input.model,
    input.vec.length,
    JSON.stringify(input.vec),
  );
}

function parseEmbedding(json: string): number[] | null {
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return null;
    const out: number[] = [];
    for (let i = 0; i < v.length; i += 1) {
      const n = Number((v as any)[i]);
      out.push(Number.isFinite(n) ? n : 0);
    }
    return out.length >= 8 ? out : null;
  } catch {
    return null;
  }
}

export async function visionIntercept(input: {
  userId: string;
  intentText?: string;
  screenshotData?: string;
  parentGoalId?: string | null;
  /** 桌面挂件：用户宣告本卡点已歼灭 */
  nodeResolved?: boolean;
}): Promise<{
  success: boolean;
  detectedConcept: string;
  similarity: number;
  matchedNodeTitle: string;
  splitTriggered: boolean;
  weaverWhisper: string;
  metrics: { progressPercentage: number; totalUnits: number; completedUnits: number; daysLeft: number; targetDestination: string };
  nodeId: string;
  hitCount: number;
  destiny?: Awaited<ReturnType<typeof DestinyExecutionEngine.registerHardWork>>;
}> {
  const userId = input.userId.trim();
  if (!userId) throw new Error('缺少 userId');

  const llm = resolveUserLlm(userId);
  if (!llm) {
    const detectedConcept = clampLen((input.intentText ?? '').trim().replace(/["'“”]/g, ''), 80) || '未命名卡点';
    const hit = recordTelemetryHit({
      userId,
      matchedConcept: detectedConcept,
      captureType: 'VISION',
      parentGoalId: input.parentGoalId ?? null,
    });
    if (input.nodeResolved) {
      cognizeTopologyNode(userId, detectedConcept);
    }

    const splitTriggered = Boolean(hit.splitTriggered);
    const whisper = splitTriggered
      ? `⚠️ 织者低语：你在【${detectedConcept}】持续撞墙。星团分裂已触发，进度线回调。`
      : '模板模式：已记录视觉卡点。配置 DeepSeek Key 后将启用拓扑拦截。';

    let destiny: Awaited<ReturnType<typeof DestinyExecutionEngine.registerHardWork>> | undefined;
    if (!splitTriggered) {
      if (input.nodeResolved) {
        destiny =
          (await DestinyExecutionEngine.registerHardWork(userId, 1, 1, { resolvedConcept: detectedConcept })) ?? undefined;
      } else {
        destiny = (await DestinyExecutionEngine.registerHardWork(userId, 0.5, 0)) ?? undefined;
      }
    }

    return {
      success: true,
      detectedConcept,
      similarity: 0,
      matchedNodeTitle: detectedConcept,
      splitTriggered,
      weaverWhisper: destiny?.mentorWhisper ?? whisper,
      metrics: hit.metrics,
      nodeId: hit.nodeId,
      hitCount: hit.hitCount,
      destiny,
    };
  }

  const pricing = FUEL_TASK_POLICY.VISION_INTERCEPT;
  const charge = chargePlatformCompute(
    userId,
    pricing.cost,
    pricing.reason,
    llm.usesPrivateKey,
  );
  if (!charge.ok) {
    throw new Error('Warp 燃料已耗尽，请充值因果能量包后继续');
  }

  const dataUrl = typeof input.screenshotData === 'string' ? toDataUrl(input.screenshotData) : null;
  if (dataUrl && dataUrl.length > 12_000_000) throw new Error('桌面视觉帧过大，请缩小分辨率后重试');
  if (dataUrl && !llm.usesPrivateKey) {
    console.warn('[vision-router] 平台 DeepSeek 文本模式：截图将以用户描述为主');
  }

  const detectedConcept = await extractConcept(userId, dataUrl, input.intentText ?? '', llm.usesPrivateKey);
  let queryVec: number[];
  try {
    queryVec = await embedText(llm.client, detectedConcept);
  } catch {
    queryVec = await embedText(llm.client, detectedConcept, 'text-embedding-3-small');
  }

  const candidates = getNodeTitles(userId, 64);
  let best: { nodeId: string; title: string; sim: number } | null = null;

  for (const c of candidates) {
    const row = getEmbeddingRow(c.node_id);
    let vec: number[] | null = row?.embedding_json ? parseEmbedding(row.embedding_json) : null;
    if (!vec) {
      vec = await embedText(llm.client, c.node_title);
      upsertEmbeddingRow({ nodeId: c.node_id, userId, model: 'text-embedding-3-small', vec });
    }
    const sim = cosineSimilarity(queryVec, vec);
    if (!best || sim > best.sim) best = { nodeId: c.node_id, title: c.node_title, sim };
  }

  const similarity = best?.sim ?? 0;
  const matchedNodeTitle = similarity >= 0.85 && best ? best.title : detectedConcept;

  const hit = recordTelemetryHit({
    userId,
    matchedConcept: matchedNodeTitle,
    captureType: 'VISION',
    parentGoalId: input.parentGoalId ?? null,
  });

  const splitTriggered = Boolean(hit.splitTriggered);
  const whisper = splitTriggered
    ? `⚠️ 织者低语：视觉神经确认你在【${matchedNodeTitle}】持续撞墙。星团分裂已触发，进度线回调。`
    : '视觉重路由已确立，引力线轻微修正。';

  let destiny: Awaited<ReturnType<typeof DestinyExecutionEngine.registerHardWork>> | undefined;
  if (!splitTriggered) {
    if (input.nodeResolved) {
      destiny =
        (await DestinyExecutionEngine.registerHardWork(userId, 1, 1, {
          resolvedConcept: matchedNodeTitle,
        })) ?? undefined;
    } else {
      destiny =
        (await DestinyExecutionEngine.registerHardWork(userId, 0.5, 0)) ?? undefined;
    }
  }

  return {
    success: true,
    detectedConcept,
    similarity,
    matchedNodeTitle,
    splitTriggered,
    weaverWhisper: destiny?.mentorWhisper ?? whisper,
    metrics: hit.metrics,
    nodeId: hit.nodeId,
    hitCount: hit.hitCount,
    destiny,
  };
}
