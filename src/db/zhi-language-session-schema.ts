/**
 * ZHI · 语言陪练会话记录（标化进度可回溯）
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';

export type LanguageSessionRow = {
  id: string;
  user_id: string;
  exam_track: string;
  intake_type: string;
  task_prompt: string;
  estimated_score: string;
  score_numeric: number | null;
  ielts_equivalent: string | null;
  fatal_flaws_json: string;
  passed_shadow: number;
  created_at: number;
};

export function initializeZhiLanguageSessionSchema(): void {
  getLearningDb().exec(`
    CREATE TABLE IF NOT EXISTS zhi_language_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      exam_track TEXT NOT NULL,
      intake_type TEXT NOT NULL,
      task_prompt TEXT,
      estimated_score TEXT,
      score_numeric REAL,
      ielts_equivalent TEXT,
      fatal_flaws_json TEXT,
      passed_shadow INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_lang_user ON zhi_language_sessions(user_id, created_at DESC);
  `);
}

export function saveLanguageSession(input: {
  userId: string;
  examTrack: string;
  intakeType: string;
  taskPrompt: string;
  estimatedScore: string;
  scoreNumeric: number | null;
  ieltsEquivalent: string | null;
  fatalFlaws: string[];
  passedShadow?: boolean;
}): LanguageSessionRow {
  initializeZhiLanguageSessionSchema();
  const id = randomUUID();
  getLearningDb()
    .prepare(
      `
    INSERT INTO zhi_language_sessions (
      id, user_id, exam_track, intake_type, task_prompt,
      estimated_score, score_numeric, ielts_equivalent, fatal_flaws_json, passed_shadow
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      id,
      input.userId.trim(),
      input.examTrack,
      input.intakeType,
      input.taskPrompt.slice(0, 500),
      input.estimatedScore.slice(0, 80),
      input.scoreNumeric,
      input.ieltsEquivalent?.slice(0, 20) ?? null,
      JSON.stringify(input.fatalFlaws.slice(0, 6)),
      input.passedShadow ? 1 : 0,
    );
  return getLanguageSession(id)!;
}

export function getLanguageSession(id: string): LanguageSessionRow | null {
  initializeZhiLanguageSessionSchema();
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_language_sessions WHERE id = ?`)
    .get(id) as LanguageSessionRow | undefined;
  return row ?? null;
}

export function listRecentLanguageSessions(userId: string, limit = 8): LanguageSessionRow[] {
  initializeZhiLanguageSessionSchema();
  return getLearningDb()
    .prepare(
      `SELECT * FROM zhi_language_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId.trim(), limit) as LanguageSessionRow[];
}

export type SpeakingCurveDayRow = {
  day: string;
  avg_score: number | null;
  sessions: number;
  shadow_passes: number;
};

/** 近 N 日口语估分（按日聚合，无练习日为 null） */
export function listSpeakingCurveDays(userId: string, days = 7): Array<{
  date: string;
  score: number | null;
  sessions: number;
  shadowPasses: number;
}> {
  initializeZhiLanguageSessionSchema();
  const uid = userId.trim();
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const rows = getLearningDb()
    .prepare(
      `
    SELECT date(created_at, 'unixepoch') AS day,
           ROUND(AVG(score_numeric), 1) AS avg_score,
           COUNT(*) AS sessions,
           SUM(CASE WHEN passed_shadow = 1 THEN 1 ELSE 0 END) AS shadow_passes
    FROM zhi_language_sessions
    WHERE user_id = ? AND intake_type = 'SPEAKING' AND created_at >= ?
    GROUP BY day
    ORDER BY day ASC
  `,
    )
    .all(uid, since) as SpeakingCurveDayRow[];

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: Array<{ date: string; score: number | null; sessions: number; shadowPasses: number }> = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    out.push({
      date: key,
      score: row?.avg_score != null ? Number(row.avg_score) : null,
      sessions: row?.sessions ?? 0,
      shadowPasses: row?.shadow_passes ?? 0,
    });
  }
  return out;
}
