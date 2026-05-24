/**
 * WUXIAN 2.0 · 认知拓扑图谱账本 + 卡点遥测
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { getReversingMatrixRow, initializeReversingMatrixSystem } from './milestone-schema';

export type TopologyNodeStatus = 'LOCKED' | 'ACTIVE' | 'COGNIZED';
export type TelemetryCaptureType = 'VOICE' | 'VIDEO' | 'VISION' | 'TEXT';

export interface CognitiveTopologyNode {
  node_id: string;
  user_id: string;
  parent_goal_id: string | null;
  node_title: string;
  status: TopologyNodeStatus;
  hit_count: number;
  created_at: number;
}

export interface CognitiveTelemetryLog {
  log_id: string;
  user_id: string;
  node_id: string;
  capture_type: TelemetryCaptureType;
  created_at: number;
}

export interface TopologyMetrics {
  progressPercentage: number;
  totalUnits: number;
  completedUnits: number;
  daysLeft: number;
  targetDestination: string;
}

/**
 * 升级 2.0 图拓扑账本结构
 */
export function upgradeDatabaseToTopology(): void {
  initializeReversingMatrixSystem();
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS cognitive_topology_nodes (
      node_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      parent_goal_id TEXT,
      node_title TEXT NOT NULL,
      status TEXT DEFAULT 'LOCKED',
      hit_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS cognitive_telemetry_logs (
      log_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      capture_type TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS cognitive_topology_embeddings (
      node_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      embedding_json TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_topo_nodes_user_title ON cognitive_topology_nodes(user_id, node_title);
    CREATE INDEX IF NOT EXISTS idx_telemetry_user_time ON cognitive_telemetry_logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_topo_embed_user ON cognitive_topology_embeddings(user_id, updated_at);
  `);
}

export function pullTopologyMetrics(userId: string): TopologyMetrics {
  const matrix = getReversingMatrixRow(userId);
  if (!matrix?.target_destination) {
    return {
      progressPercentage: 1,
      totalUnits: 100,
      completedUnits: 1,
      daysLeft: 99,
      targetDestination: '未知高维引力源',
    };
  }
  const now = Math.floor(Date.now() / 1000);
  const daysLeft = matrix.target_deadline_timestamp
    ? Math.max(0, Math.ceil((matrix.target_deadline_timestamp - now) / 86400))
    : 99;
  const total = Math.max(1, Number(matrix.total_cognitive_units ?? 100));
  const completed = Math.max(0, Math.min(total, Number(matrix.completed_cognitive_units ?? 0)));
  return {
    progressPercentage: Math.min(100, Math.round((completed / total) * 100)),
    totalUnits: total,
    completedUnits: completed,
    daysLeft,
    targetDestination: matrix.target_destination,
  };
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export function listTopologyNodes(userId: string, limit = 32): CognitiveTopologyNode[] {
  upgradeDatabaseToTopology();
  return getLearningDb().prepare(`
    SELECT * FROM cognitive_topology_nodes
    WHERE user_id = ?
    ORDER BY hit_count DESC, created_at DESC
    LIMIT ?
  `).all(userId, limit) as CognitiveTopologyNode[];
}
