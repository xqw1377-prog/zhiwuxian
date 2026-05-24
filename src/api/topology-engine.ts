/**
 * WUXIAN 2.0 · 自适应星团分裂引擎
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';
import {
  upgradeDatabaseToTopology,
  pullTopologyMetrics,
  listTopologyNodes,
  type TelemetryCaptureType,
  type TopologyMetrics,
} from '../db/topology-schema';
import { extractTopicFromText } from '../db/cognitive-topology-schema';
import { WarpRelayRouter } from '../services/relay-router';

export interface TelemetryHitInput {
  userId: string;
  matchedConcept: string;
  captureType?: TelemetryCaptureType;
  parentGoalId?: string | null;
}

export interface TelemetryHitResult {
  success: boolean;
  splitTriggered: boolean;
  weaverWhisper: string;
  metrics: TopologyMetrics;
  nodeId: string;
  hitCount: number;
}

function detectCaptureType(raw: string, override?: TelemetryCaptureType): TelemetryCaptureType {
  if (override) return override;
  if (/https?:\/\//i.test(raw)) return 'VIDEO';
  if (raw.includes('【屏幕捕捉】')) return 'VISION';
  return 'VOICE';
}

function newLogId(): string {
  return `log_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function newNodeId(): string {
  return `node_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

/** 路径 B / 桌面拦截：将认知卡点标记为已坍缩（COGNIZED） */
export function cognizeTopologyNode(userId: string, concept: string): boolean {
  upgradeDatabaseToTopology();
  const db = getLearningDb();
  const title = concept.trim().slice(0, 120);
  if (!userId.trim() || !title) return false;
  const result = db.prepare(`
    UPDATE cognitive_topology_nodes
    SET status = 'COGNIZED', hit_count = 0
    WHERE user_id = ? AND node_title = ? AND status != 'COGNIZED'
  `).run(userId.trim(), title);
  return result.changes > 0;
}

/**
 * 路径 B 投喂时暗中触发：更新拓扑节点撞击计数，必要时分裂星团（分母 +5）
 */
export function recordTelemetryHit(input: TelemetryHitInput): TelemetryHitResult {
  upgradeDatabaseToTopology();
  const db = getLearningDb();
  const userId = input.userId.trim();
  const concept = input.matchedConcept.trim().slice(0, 120);
  if (!userId || !concept) {
    throw new Error('缺少 userId 或 matchedConcept');
  }

  let node = db.prepare(`
    SELECT * FROM cognitive_topology_nodes WHERE user_id = ? AND node_title = ?
  `).get(userId, concept) as {
    node_id: string;
    hit_count: number;
    status: string;
  } | undefined;

  if (!node) {
    const nodeId = newNodeId();
    db.prepare(`
      INSERT INTO cognitive_topology_nodes (node_id, user_id, parent_goal_id, node_title, status, hit_count)
      VALUES (?, ?, ?, ?, 'ACTIVE', 1)
    `).run(nodeId, userId, input.parentGoalId ?? null, concept);
    node = { node_id: nodeId, hit_count: 1, status: 'ACTIVE' };
  } else {
    db.prepare(`
      UPDATE cognitive_topology_nodes SET hit_count = hit_count + 1, status = 'ACTIVE' WHERE node_id = ?
    `).run(node.node_id);
    node.hit_count += 1;
  }

  const captureType = input.captureType ?? 'TEXT';
  db.prepare(`
    INSERT INTO cognitive_telemetry_logs (log_id, user_id, node_id, capture_type)
    VALUES (?, ?, ?, ?)
  `).run(newLogId(), userId, node.node_id, captureType);

  let splitTriggered = false;
  let whisper = '正在修复边缘认知卡点…';

  if (node.hit_count >= 3 && node.status !== 'COGNIZED') {
    splitTriggered = true;
    whisper = `⚠️ 警告：检测到暗物质堵塞。你对【${concept}】的底层理解已经碎裂，进度条强行回调。`;

    db.prepare(`
      UPDATE goal_reversing_matrix
      SET total_cognitive_units = total_cognitive_units + 5,
          updated_at = strftime('%s', 'now')
      WHERE user_id = ?
    `).run(userId);

    db.prepare(`UPDATE cognitive_topology_nodes SET hit_count = 0 WHERE node_id = ?`).run(node.node_id);
  }

  return {
    success: true,
    splitTriggered,
    weaverWhisper: whisper,
    metrics: pullTopologyMetrics(userId),
    nodeId: node.node_id,
    hitCount: splitTriggered ? 0 : node.hit_count,
  };
}

/** 从原始投喂文本解析概念并触发遥测 */
export function recordTelemetryFromRaw(input: {
  userId: string;
  rawInput: string;
  captureType?: TelemetryCaptureType;
  parentGoalId?: string | null;
}): TelemetryHitResult {
  const topic = extractTopicFromText(input.rawInput);
  return recordTelemetryHit({
    userId: input.userId,
    matchedConcept: topic.label,
    captureType: detectCaptureType(input.rawInput, input.captureType),
    parentGoalId: input.parentGoalId,
  });
}

export function getTopologySnapshot(userId: string) {
  return {
    nodes: listTopologyNodes(userId),
    metrics: pullTopologyMetrics(userId),
  };
}

/** OS 层拦截：屏幕截图 + 用户意图 → Vision 清洗 → 遥测撞击 */
export async function recordDesktopIntercept(input: {
  userId: string;
  matchedConcept: string;
  screenshotData?: string;
  parentGoalId?: string | null;
}): Promise<
  TelemetryHitResult & {
    visionScene?: string;
    relaySource?: string | null;
    remainingWarpPoints?: number;
  }
> {
  let concept = input.matchedConcept.trim();
  let visionScene: string | undefined;
  let relaySource: string | null | undefined;
  let remainingWarpPoints: number | undefined;

  if (input.screenshotData?.startsWith('data:image')) {
    try {
      const relay = await WarpRelayRouter.dispatchVisionTask(input.userId, {
        screenshotData: input.screenshotData,
        userHint: concept,
      });
      concept = relay.detectedConcept;
      visionScene = relay.detectedConcept;
      relaySource = relay.relaySource;
      remainingWarpPoints = relay.remainingWarpPoints;
    } catch (err) {
      console.warn('[Topology] Warp 中继视觉降级:', err);
    }
  }

  const hit = recordTelemetryHit({
    userId: input.userId,
    matchedConcept: concept.slice(0, 200),
    captureType: input.screenshotData ? 'VISION' : 'TEXT',
    parentGoalId: input.parentGoalId,
  });

  return { ...hit, visionScene, relaySource, remainingWarpPoints };
}
