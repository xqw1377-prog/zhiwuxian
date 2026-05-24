/**
 * WUXIAN 2.0 · 自适应认知雷达编排
 */

import {
  recordAdaptiveFeed,
  adjustTimeSlopeWeight,
  getCognitiveTopology,
  pickWeaverTone,
  weaveAdaptiveWhisper,
  extractTopicFromText,
} from '../db/cognitive-topology-schema';
import { recordTelemetryFromRaw } from '../api/topology-engine';
import { DestinyExecutionEngine } from './destiny-engine';
import { getLearningDb } from '../../server/wuxian-learning-db';
import type { TopologyMetrics } from '../db/topology-schema';

const lastTopicByUser = new Map<string, string>();

function lastFeedTimestamp(userId: string): number {
  const db = getLearningDb();
  const row = db.prepare(`
    SELECT created_at FROM cognitive_feed_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 1 OFFSET 1
  `).get(userId) as { created_at: number } | undefined;
  return Number(row?.created_at ?? 0);
}

export interface AdaptiveRadarResult {
  topologyWarning?: string;
  timeSlopeWeight: number;
  weaverTone: 'gentle' | 'hardcore' | 'neutral';
  topicSlug: string;
  topicLabel: string;
  consecutiveFeeds: number;
  planExpanded: boolean;
  splitTriggered: boolean;
  metrics?: TopologyMetrics;
}

export function runAdaptiveRadar(input: {
  userId: string;
  rawInput: string;
  fatigueLevel?: number;
  parentGoalId?: string | null;
}): AdaptiveRadarResult {
  const prev = lastTopicByUser.get(input.userId) ?? null;
  const now = Math.floor(Date.now() / 1000);
  const lastTs = lastFeedTimestamp(input.userId);
  const intervalSec = lastTs > 0 ? Math.max(0, now - lastTs) : 86400;

  const feed = recordAdaptiveFeed({
    userId: input.userId,
    rawInput: input.rawInput,
    fatigueLevel: input.fatigueLevel,
    previousTopicSlug: prev,
  });

  const hit = recordTelemetryFromRaw({
    userId: input.userId,
    rawInput: input.rawInput,
    parentGoalId: input.parentGoalId,
  });

  if (!hit.splitTriggered) {
    void DestinyExecutionEngine.registerHardWork(input.userId, 0.5, 0);
  }

  lastTopicByUser.set(input.userId, feed.topic.slug);

  const weight = adjustTimeSlopeWeight(
    input.userId,
    input.fatigueLevel ?? 0.3,
    intervalSec,
  );

  const tone = pickWeaverTone(input.fatigueLevel ?? 0.3, weight);

  const topologyWarning = hit.splitTriggered
    ? hit.weaverWhisper
    : feed.topologyWarning;

  return {
    topologyWarning,
    timeSlopeWeight: weight,
    weaverTone: tone,
    topicSlug: feed.topic.slug,
    topicLabel: feed.topic.label,
    consecutiveFeeds: hit.hitCount,
    planExpanded: hit.splitTriggered,
    splitTriggered: hit.splitTriggered,
    metrics: hit.metrics,
  };
}

export function refineCompanionSpeech(
  baseSpeech: string,
  radar: AdaptiveRadarResult,
): string {
  if (radar.splitTriggered && radar.topologyWarning) return radar.topologyWarning;
  return weaveAdaptiveWhisper(baseSpeech, radar.weaverTone, radar.topologyWarning);
}

export { getCognitiveTopology, extractTopicFromText };
