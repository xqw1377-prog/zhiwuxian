/**
 * WUXIAN 2.0 · 自适应认知动态拓扑（SQLite 邻接表模拟图数据库）
 */

import { getLearningDb } from '../../server/wuxian-learning-db';
import { getReversingMatrixRow } from './milestone-schema';

export interface CognitiveTopicNode {
  id: string;
  user_id: string;
  topic_slug: string;
  topic_label: string;
  feed_count: number;
  consecutive_feeds: number;
  last_feed_at: number;
  mastery_score: number;
  created_at: number;
}

export interface TopologyEdge {
  from_slug: string;
  to_slug: string;
  weight: number;
}

const TOPIC_PATTERNS: { slug: string; label: string; re: RegExp }[] = [
  { slug: 'fourier', label: '傅里叶变换', re: /傅里叶|fourier/i },
  { slug: 'matrix', label: '矩阵乘法', re: /矩阵|matrix/i },
  { slug: 'calculus', label: '微积分', re: /微积分|导数|积分|极限|calculus/i },
  { slug: 'laplace', label: '拉普拉斯', re: /拉普拉斯|laplace/i },
  { slug: 'structure', label: '结构力学草图', re: /structural|结构|力学草图|桁架/i },
  { slug: 'ap_calc', label: 'AP 微积分', re: /AP\s*微积分|AP\s*calc/i },
  { slug: 'reading', label: '阅读卡点', re: /阅读|reading/i },
];

export function initializeCognitiveTopology(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS cognitive_topic_nodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      topic_slug TEXT NOT NULL,
      topic_label TEXT NOT NULL,
      feed_count INTEGER DEFAULT 0,
      consecutive_feeds INTEGER DEFAULT 0,
      last_feed_at INTEGER DEFAULT 0,
      mastery_score REAL DEFAULT 0.3,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(user_id, topic_slug)
    );

    CREATE TABLE IF NOT EXISTS cognitive_topic_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      from_slug TEXT NOT NULL,
      to_slug TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(user_id, from_slug, to_slug)
    );

    CREATE TABLE IF NOT EXISTS cognitive_feed_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      topic_slug TEXT,
      raw_snippet TEXT,
      fatigue_level REAL DEFAULT 0.3,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cog_nodes_user ON cognitive_topic_nodes(user_id);
    CREATE INDEX IF NOT EXISTS idx_cog_edges_user ON cognitive_topic_edges(user_id);
    CREATE INDEX IF NOT EXISTS idx_cog_feed_user ON cognitive_feed_log(user_id, created_at);
  `);

  const matrixCols = db.prepare(`PRAGMA table_info(goal_reversing_matrix)`).all() as { name: string }[];
  const names = new Set(matrixCols.map((c) => c.name));
  if (!names.has('time_slope_weight')) {
    db.exec(`ALTER TABLE goal_reversing_matrix ADD COLUMN time_slope_weight REAL DEFAULT 1.0`);
  }
  if (!names.has('gravity_relay_stars')) {
    db.exec(`ALTER TABLE goal_reversing_matrix ADD COLUMN gravity_relay_stars INTEGER DEFAULT 0`);
  }
  if (!names.has('last_feed_interval_sec')) {
    db.exec(`ALTER TABLE goal_reversing_matrix ADD COLUMN last_feed_interval_sec INTEGER DEFAULT 0`);
  }
}

export function extractTopicFromText(raw: string): { slug: string; label: string } {
  const text = raw.trim();
  for (const p of TOPIC_PATTERNS) {
    if (p.re.test(text)) return { slug: p.slug, label: p.label };
  }
  const short = text.replace(/\s+/g, '').slice(0, 12) || 'general';
  return { slug: `t_${short.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '')}`, label: text.slice(0, 24) || '泛化认知块' };
}

function uid(): string {
  return `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function recordAdaptiveFeed(input: {
  userId: string;
  rawInput: string;
  fatigueLevel?: number;
  previousTopicSlug?: string | null;
}): {
  topic: { slug: string; label: string };
  consecutiveFeeds: number;
  planExpanded: boolean;
  topologyWarning?: string;
} {
  initializeCognitiveTopology();
  const db = getLearningDb();
  const topic = extractTopicFromText(input.rawInput);
  const now = Math.floor(Date.now() / 1000);
  const fatigue = Math.max(0, Math.min(1, input.fatigueLevel ?? 0.3));

  db.prepare(`
    INSERT INTO cognitive_feed_log (user_id, topic_slug, raw_snippet, fatigue_level)
    VALUES (?, ?, ?, ?)
  `).run(input.userId, topic.slug, input.rawInput.slice(0, 200), fatigue);

  const existing = db.prepare(`
    SELECT * FROM cognitive_topic_nodes WHERE user_id = ? AND topic_slug = ?
  `).get(input.userId, topic.slug) as CognitiveTopicNode | undefined;

  let consecutive = 1;
  if (existing) {
    consecutive = existing.consecutive_feeds + 1;
    db.prepare(`
      UPDATE cognitive_topic_nodes
      SET feed_count = feed_count + 1,
          consecutive_feeds = ?,
          last_feed_at = ?,
          mastery_score = MAX(0, mastery_score - 0.05)
      WHERE user_id = ? AND topic_slug = ?
    `).run(consecutive, now, input.userId, topic.slug);
  } else {
    db.prepare(`
      INSERT INTO cognitive_topic_nodes (id, user_id, topic_slug, topic_label, feed_count, consecutive_feeds, last_feed_at)
      VALUES (?, ?, ?, ?, 1, 1, ?)
    `).run(uid(), input.userId, topic.slug, topic.label, now);
  }

  if (input.previousTopicSlug && input.previousTopicSlug !== topic.slug) {
    db.prepare(`
      INSERT INTO cognitive_topic_edges (user_id, from_slug, to_slug, weight, updated_at)
      VALUES (?, ?, ?, 1.0, ?)
      ON CONFLICT(user_id, from_slug, to_slug) DO UPDATE SET
        weight = weight + 0.5,
        updated_at = excluded.updated_at
    `).run(input.userId, input.previousTopicSlug, topic.slug, now);
  }

  const planExpanded = false;
  let topologyWarning: string | undefined;

  return {
    topic,
    consecutiveFeeds: consecutive,
    planExpanded,
    topologyWarning,
  };
}

export function adjustTimeSlopeWeight(userId: string, fatigueLevel: number, intervalSec: number): number {
  initializeCognitiveTopology();
  const db = getLearningDb();
  const row = getReversingMatrixRow(userId);
  if (!row) return 1;

  let weight = Number((row as { time_slope_weight?: number }).time_slope_weight ?? 1);
  if (fatigueLevel > 0.7) weight = Math.max(0.55, weight - 0.12);
  else if (fatigueLevel < 0.35 && intervalSec > 3600) weight = Math.min(1.45, weight + 0.08);
  else if (intervalSec < 120) weight = Math.min(1.35, weight + 0.05);

  db.prepare(`
    UPDATE goal_reversing_matrix
    SET time_slope_weight = ?, last_feed_interval_sec = ?, updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(weight, intervalSec, userId);

  return weight;
}

export function getCognitiveTopology(userId: string): {
  nodes: CognitiveTopicNode[];
  edges: TopologyEdge[];
  timeSlopeWeight: number;
  gravityRelayStars: number;
} {
  initializeCognitiveTopology();
  const db = getLearningDb();
  const nodes = db.prepare(`
    SELECT * FROM cognitive_topic_nodes WHERE user_id = ? ORDER BY feed_count DESC LIMIT 24
  `).all(userId) as CognitiveTopicNode[];

  const edges = db.prepare(`
    SELECT from_slug, to_slug, weight FROM cognitive_topic_edges WHERE user_id = ? ORDER BY weight DESC LIMIT 48
  `).all(userId) as TopologyEdge[];

  const matrix = getReversingMatrixRow(userId) as {
    time_slope_weight?: number;
    gravity_relay_stars?: number;
  } | null;

  return {
    nodes,
    edges,
    timeSlopeWeight: Number(matrix?.time_slope_weight ?? 1),
    gravityRelayStars: Number(matrix?.gravity_relay_stars ?? 0),
  };
}

export function pickWeaverTone(fatigueLevel: number, timeSlopeWeight: number): 'gentle' | 'hardcore' | 'neutral' {
  if (fatigueLevel > 0.65 || timeSlopeWeight < 0.75) return 'gentle';
  if (fatigueLevel < 0.25 && timeSlopeWeight > 1.2) return 'hardcore';
  return 'neutral';
}

export function weaveAdaptiveWhisper(
  base: string,
  tone: 'gentle' | 'hardcore' | 'neutral',
  topologyWarning?: string,
): string {
  if (topologyWarning) return topologyWarning;
  if (tone === 'gentle') return `${base} 今天不必硬扛，把最小一格点亮就够了。`;
  if (tone === 'hardcore') return `${base} 航线在收紧，把这一格打穿。`;
  return base;
}
