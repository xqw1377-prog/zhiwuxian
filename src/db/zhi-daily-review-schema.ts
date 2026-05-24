/**
 * ZHI · 每日学习复盘与计划修正记录
 */

import { getLearningDb } from '../../server/wuxian-learning-db';

export type DailyReviewRow = {
  user_id: string;
  review_date: string;
  dream_pct: number;
  dream_delta: number;
  subject_deltas_json: string;
  retrospective_json: string;
  plan_corrections_json: string;
  revised_mission: string;
  chat_text: string;
  applied_at: number;
  created_at: number;
};

export type PlanCorrectionDto = {
  subjectId: string;
  subjectName: string;
  action: string;
  priority: 'P0' | 'P1';
  dueBy: string;
};

export function initializeZhiDailyReviewSchema(): void {
  getLearningDb().exec(`
    CREATE TABLE IF NOT EXISTS zhi_daily_reviews (
      user_id TEXT NOT NULL,
      review_date TEXT NOT NULL,
      dream_pct REAL NOT NULL,
      dream_delta REAL NOT NULL,
      subject_deltas_json TEXT NOT NULL,
      retrospective_json TEXT NOT NULL,
      plan_corrections_json TEXT NOT NULL,
      revised_mission TEXT NOT NULL,
      chat_text TEXT NOT NULL,
      applied_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, review_date)
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_daily_review_date ON zhi_daily_reviews(review_date);
  `);
}

export function reviewDateKey(d = new Date()): string {
  const cn = new Date(d.getTime() + 8 * 3600000);
  return cn.toISOString().slice(0, 10);
}

export function getDailyReview(userId: string, date = reviewDateKey()): DailyReviewRow | null {
  initializeZhiDailyReviewSchema();
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_daily_reviews WHERE user_id = ? AND review_date = ?`)
    .get(userId.trim(), date) as DailyReviewRow | undefined;
  return row ?? null;
}

export function saveDailyReview(input: {
  userId: string;
  reviewDate: string;
  dreamPct: number;
  dreamDelta: number;
  subjectDeltas: Array<{ id: string; name: string; deltaPct: number; progressPct: number }>;
  retrospective: string[];
  planCorrections: PlanCorrectionDto[];
  revisedMission: string;
  chatText: string;
}): DailyReviewRow {
  initializeZhiDailyReviewSchema();
  const now = Math.floor(Date.now() / 1000);
  getLearningDb()
    .prepare(
      `INSERT INTO zhi_daily_reviews (
        user_id, review_date, dream_pct, dream_delta,
        subject_deltas_json, retrospective_json, plan_corrections_json,
        revised_mission, chat_text, applied_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, review_date) DO UPDATE SET
        dream_pct = excluded.dream_pct,
        dream_delta = excluded.dream_delta,
        subject_deltas_json = excluded.subject_deltas_json,
        retrospective_json = excluded.retrospective_json,
        plan_corrections_json = excluded.plan_corrections_json,
        revised_mission = excluded.revised_mission,
        chat_text = excluded.chat_text,
        applied_at = excluded.applied_at,
        created_at = excluded.created_at`,
    )
    .run(
      input.userId.trim(),
      input.reviewDate,
      input.dreamPct,
      input.dreamDelta,
      JSON.stringify(input.subjectDeltas),
      JSON.stringify(input.retrospective),
      JSON.stringify(input.planCorrections),
      input.revisedMission,
      input.chatText,
      now,
      now,
    );
  return getDailyReview(input.userId, input.reviewDate)!;
}

export function listAnchorUserIds(): string[] {
  initializeZhiDailyReviewSchema();
  const rows = getLearningDb()
    .prepare(`SELECT user_id FROM zhi_school_anchor`)
    .all() as { user_id: string }[];
  return rows.map((r) => r.user_id);
}
