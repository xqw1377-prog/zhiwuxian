/**
 * ZHI · 视频学习会话（章节卡点、掌握度）
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';

export type VideoSessionRow = {
  id: string;
  user_id: string;
  course_id: string | null;
  video_title: string | null;
  chapter_title: string;
  timestamp_sec: number;
  question: string | null;
  user_answer: string | null;
  mastery_score: number | null;
  gap_fix: string | null;
  passed_checkpoint: number;
  created_at: number;
};

export function initializeZhiVideoSessionSchema(): void {
  getLearningDb().exec(`
    CREATE TABLE IF NOT EXISTS zhi_video_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT,
      video_title TEXT,
      chapter_title TEXT NOT NULL,
      timestamp_sec INTEGER DEFAULT 0,
      question TEXT,
      user_answer TEXT,
      mastery_score REAL,
      gap_fix TEXT,
      passed_checkpoint INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_video_user ON zhi_video_sessions(user_id, created_at DESC);
  `);
}

export function saveVideoCheckpoint(input: {
  userId: string;
  courseId?: string | null;
  videoTitle?: string | null;
  chapterTitle: string;
  timestampSec: number;
  question?: string;
  userAnswer?: string;
  masteryScore?: number | null;
  gapFix?: string;
  passed: boolean;
}): VideoSessionRow {
  initializeZhiVideoSessionSchema();
  const id = randomUUID();
  getLearningDb()
    .prepare(
      `
    INSERT INTO zhi_video_sessions (
      id, user_id, course_id, video_title, chapter_title, timestamp_sec,
      question, user_answer, mastery_score, gap_fix, passed_checkpoint
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      id,
      input.userId.trim(),
      input.courseId ?? null,
      input.videoTitle?.slice(0, 200) ?? null,
      input.chapterTitle.slice(0, 200),
      Math.floor(input.timestampSec),
      input.question?.slice(0, 500) ?? null,
      input.userAnswer?.slice(0, 2000) ?? null,
      input.masteryScore ?? null,
      input.gapFix?.slice(0, 300) ?? null,
      input.passed ? 1 : 0,
    );
  return getVideoSession(id)!;
}

export function getVideoSession(id: string): VideoSessionRow | null {
  initializeZhiVideoSessionSchema();
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_video_sessions WHERE id = ?`)
    .get(id) as VideoSessionRow | undefined;
  return row ?? null;
}

export function listRecentVideoSessions(userId: string, limit = 12): VideoSessionRow[] {
  initializeZhiVideoSessionSchema();
  return getLearningDb()
    .prepare(`SELECT * FROM zhi_video_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId.trim(), limit) as VideoSessionRow[];
}

export function listVideoStudyDays(userId: string, days = 7): Array<{
  date: string;
  checkpoints: number;
  avgMastery: number | null;
  passed: number;
}> {
  initializeZhiVideoSessionSchema();
  const uid = userId.trim();
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = getLearningDb()
    .prepare(
      `
    SELECT date(created_at, 'unixepoch') AS day,
           COUNT(*) AS checkpoints,
           ROUND(AVG(mastery_score), 2) AS avg_mastery,
           SUM(CASE WHEN passed_checkpoint = 1 THEN 1 ELSE 0 END) AS passed
    FROM zhi_video_sessions
    WHERE user_id = ? AND created_at >= ?
    GROUP BY day
    ORDER BY day ASC
  `,
    )
    .all(uid, since) as Array<{ day: string; checkpoints: number; avg_mastery: number | null; passed: number }>;

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: Array<{ date: string; checkpoints: number; avgMastery: number | null; passed: number }> = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    out.push({
      date: key,
      checkpoints: row?.checkpoints ?? 0,
      avgMastery: row?.avg_mastery != null ? Number(row.avg_mastery) : null,
      passed: row?.passed ?? 0,
    });
  }
  return out;
}

export function countPassedChaptersForCourse(userId: string, courseId: string): number {
  initializeZhiVideoSessionSchema();
  const row = getLearningDb()
    .prepare(
      `
    SELECT COUNT(DISTINCT chapter_title) AS n
    FROM zhi_video_sessions
    WHERE user_id = ? AND course_id = ? AND passed_checkpoint = 1
  `,
    )
    .get(userId.trim(), courseId) as { n: number } | undefined;
  return row?.n ?? 0;
}
