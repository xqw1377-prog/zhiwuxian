/**
 * ZHI · 沟通形式目录（立约后持久化，驱动主动议程）
 */

import { getLearningDb } from '../../server/wuxian-learning-db';

export type ZhiCommProtocolRow = {
  user_id: string;
  established_at: number;
  last_proactive_at: number | null;
  last_mode: string | null;
  session_count: number;
  updated_at: number;
};

export function initializeZhiCommProtocolSchema(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS zhi_comm_protocol (
      user_id TEXT PRIMARY KEY,
      established_at INTEGER NOT NULL,
      last_proactive_at INTEGER,
      last_mode TEXT,
      session_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function getCommProtocol(userId: string): ZhiCommProtocolRow | null {
  initializeZhiCommProtocolSchema();
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_comm_protocol WHERE user_id = ?`)
    .get(userId.trim()) as ZhiCommProtocolRow | undefined;
  return row ?? null;
}

export function markCommProtocolEstablished(userId: string): ZhiCommProtocolRow {
  initializeZhiCommProtocolSchema();
  const uid = userId.trim();
  const now = Math.floor(Date.now() / 1000);
  const existing = getCommProtocol(uid);
  if (existing) return existing;

  getLearningDb()
    .prepare(
      `INSERT INTO zhi_comm_protocol (user_id, established_at, last_proactive_at, last_mode, session_count, updated_at)
       VALUES (?, ?, NULL, NULL, 0, ?)`,
    )
    .run(uid, now, now);

  return getCommProtocol(uid)!;
}

export function recordProactiveTouch(userId: string, mode: string): ZhiCommProtocolRow {
  initializeZhiCommProtocolSchema();
  const uid = userId.trim();
  const now = Math.floor(Date.now() / 1000);
  markCommProtocolEstablished(uid);
  const prev = getCommProtocol(uid)!;
  const sessionCount = (prev.session_count ?? 0) + 1;

  getLearningDb()
    .prepare(
      `UPDATE zhi_comm_protocol SET
        last_proactive_at = ?,
        last_mode = ?,
        session_count = ?,
        updated_at = ?
       WHERE user_id = ?`,
    )
    .run(now, mode, sessionCount, now, uid);

  return getCommProtocol(uid)!;
}
