/**
 * WUXIAN · 虫洞跃迁评估引擎 (WormholeEvaluator)
 * 黄金 10 分钟微观行为微积分 → 零存储指针路由跃迁
 */

import {
  getNodeById,
  getNextNodes,
  insertTelemetry,
  insertWormholeLeapLog,
  upsertWaterline,
} from './wuxian-learning-db';

export interface TelemetryInput {
  userId: string;
  nodeId: string;
  playSpeed: number;
  skipCount: number;
  quizScore: number;
  interactionLatency: number;
}

export type WormholeStatus = 'WORMHOLE_TRIGGERED' | 'KEEP_COURSE';

export interface WormholeEvaluation {
  status: WormholeStatus;
  assimilationRate: number;
  metrics: { IL: number; PS: number };
  jumpFromNode?: string;
  jumpToNode?: string;
  targetTimestamp?: number;
  skippedCount?: number;
  skippedTitles?: string[];
  speech: string;
  leapLogId?: string;
}

const WORMHOLE_ABSORPTION_THRESHOLD = 0.95;
const MIN_NEXT_NODES_FOR_LEAP = 3;

function computeIL(quizScore: number, interactionLatencyMs: number): number {
  const quizFactor = Math.max(0, Math.min(1, quizScore));
  const latencyFactor = Math.max(0, 1 - interactionLatencyMs / 5000);
  return quizFactor * 0.7 + latencyFactor * 0.3;
}

function computePS(playSpeed: number, skipCount: number): number {
  const speedFactor = playSpeed >= 1.5 ? 1.2 : 1.0;
  const skipFactor = skipCount > 0 ? 1.3 : 1.0;
  // 归一化：最高组合 0.5×1.2×1.3=0.78 → 映射到 [0,1]
  return Math.min(1, (0.5 * speedFactor * skipFactor) / 0.78);
}

function computeAssimilationRate(il: number, ps: number): number {
  return il * 0.6 + ps * 0.4;
}

export function evaluateWormholeTransition(telemetry: TelemetryInput): WormholeEvaluation {
  const currentNode = getNodeById(telemetry.nodeId);
  if (!currentNode) {
    return {
      status: 'KEEP_COURSE',
      assimilationRate: 0,
      metrics: { IL: 0, PS: 0 },
      speech: '未找到当前认知节点，保持当前播放进度。',
    };
  }

  insertTelemetry({
    userId: telemetry.userId,
    nodeId: telemetry.nodeId,
    playSpeed: telemetry.playSpeed,
    skipCount: telemetry.skipCount,
    quizScore: telemetry.quizScore,
    interactionLatency: telemetry.interactionLatency,
  });

  const IL = computeIL(telemetry.quizScore, telemetry.interactionLatency);
  const PS = computePS(telemetry.playSpeed, telemetry.skipCount);
  const assimilationRate = computeAssimilationRate(IL, PS);

  upsertWaterline({
    userId: telemetry.userId,
    courseId: currentNode.course_id,
    nodeId: currentNode.id,
    il: IL,
    ps: PS,
    assimilationRate,
  });

  const nextNodes = getNextNodes(currentNode.course_id, currentNode.node_index, MIN_NEXT_NODES_FOR_LEAP);

  if (nextNodes.length === 0) {
    return {
      status: 'KEEP_COURSE',
      assimilationRate,
      metrics: { IL, PS },
      speech: '已达课程终点，无前方虫洞。',
    };
  }

  if (assimilationRate >= WORMHOLE_ABSORPTION_THRESHOLD && nextNodes.length >= MIN_NEXT_NODES_FOR_LEAP) {
    const skippedNodes = nextNodes.slice(0, 2);
    const targetNode = nextNodes[2];
    const oldSlope = assimilationRate;
    const newSlope = assimilationRate * 1.5;

    const feedback = `[霓虹跃迁激活] 检测到你的直觉跳跃度(IL)已达极限。系统已自动为你折叠后续冗余概念，正在穿越虫洞...`;

    const leapLogId = insertWormholeLeapLog({
      userId: telemetry.userId,
      courseId: currentNode.course_id,
      fromNodeId: currentNode.id,
      toNodeId: targetNode.id,
      skippedTitles: skippedNodes.map(n => n.title),
      il: IL,
      ps: PS,
      assimilationRate,
      oldSlope,
      newSlope,
      personaFeedback: feedback,
    });

    upsertWaterline({
      userId: telemetry.userId,
      courseId: currentNode.course_id,
      nodeId: targetNode.id,
      il: IL,
      ps: PS,
      assimilationRate,
    });

    return {
      status: 'WORMHOLE_TRIGGERED',
      assimilationRate,
      metrics: { IL, PS },
      jumpFromNode: currentNode.title,
      jumpToNode: targetNode.title,
      targetTimestamp: targetNode.video_timestamp_start,
      skippedCount: skippedNodes.length,
      skippedTitles: skippedNodes.map(n => n.title),
      speech: `指令接收。检测到你已瞬间同化当前概念。正在折叠空间，跳过 ${skippedNodes.length} 个基础节点，直达：[${targetNode.title}]。别停下，跟上这个节奏！`,
      leapLogId,
    };
  }

  return {
    status: 'KEEP_COURSE',
    assimilationRate,
    metrics: { IL, PS },
    speech: '当前认知水位平稳，保持当前斜率继续推进。',
  };
}
