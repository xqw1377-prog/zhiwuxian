/**
 * ZHI · 学习进度快照（支撑进度条动态 delta）
 */

import { getLearningDb } from '../../server/wuxian-learning-db';

export type ProgressSnapshotRow = {
  id: number;
  user_id: string;
  dream_pct: number;
  subjects_json: string;
  recorded_at: number;
};

export function initializeZhiProgressHistorySchema(): void {
  getLearningDb().exec(`
    CREATE TABLE IF NOT EXISTS zhi_progress_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      dream_pct REAL NOT NULL,
      subjects_json TEXT NOT NULL,
      recorded_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_progress_user_time ON zhi_progress_snapshots(user_id, recorded_at);
  `);
}

export function recordProgressSnapshot(input: {
  userId: string;
  dreamPct: number;
  subjects: Record<string, number>;
}): void {
  initializeZhiProgressHistorySchema();
  getLearningDb()
    .prepare(
      `INSERT INTO zhi_progress_snapshots (user_id, dream_pct, subjects_json, recorded_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      input.userId.trim(),
      input.dreamPct,
      JSON.stringify(input.subjects),
      Math.floor(Date.now() / 1000),
    );
}

export function getLatestSnapshot(userId: string): ProgressSnapshotRow | null {
  initializeZhiProgressHistorySchema();
  const row = getLearningDb()
    .prepare(
      `SELECT * FROM zhi_progress_snapshots WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`,
    )
    .get(userId.trim()) as ProgressSnapshotRow | undefined;
  return row ?? null;
}

export function getSnapshotNear(userId: string, secondsAgo: number): ProgressSnapshotRow | null {
  initializeZhiProgressHistorySchema();
  const cutoff = Math.floor(Date.now() / 1000) - secondsAgo;
  const row = getLearningDb()
    .prepare(
      `SELECT * FROM zhi_progress_snapshots
       WHERE user_id = ? AND recorded_at <= ?
       ORDER BY recorded_at DESC LIMIT 1`,
    )
    .get(userId.trim(), cutoff) as ProgressSnapshotRow | undefined;
  return row ?? null;
}
