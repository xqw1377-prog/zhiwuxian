/**
 * ZHI · 语言陪练档案（水平带、弱项、陪练师记忆）
 */

import { getLearningDb } from '../../server/wuxian-learning-db';

export type LanguageLevelBand = 'A2' | 'B1' | 'B2' | 'B3' | 'C1';

export type LanguageProfileRow = {
  user_id: string;
  level_band: string;
  speaking_est: number;
  writing_est: number;
  focus_skill: string;
  weak_tags_json: string;
  streak_days: number;
  total_sessions: number;
  shadow_pass_streak: number;
  tutor_memory: string | null;
  last_drill: string | null;
  updated_at: number;
};

export function initializeZhiLanguageProfileSchema(): void {
  getLearningDb().exec(`
    CREATE TABLE IF NOT EXISTS zhi_language_profiles (
      user_id TEXT PRIMARY KEY,
      level_band TEXT NOT NULL DEFAULT 'B1',
      speaking_est REAL NOT NULL DEFAULT 18,
      writing_est REAL NOT NULL DEFAULT 18,
      focus_skill TEXT NOT NULL DEFAULT 'logic',
      weak_tags_json TEXT NOT NULL DEFAULT '[]',
      streak_days INTEGER NOT NULL DEFAULT 0,
      total_sessions INTEGER NOT NULL DEFAULT 0,
      shadow_pass_streak INTEGER NOT NULL DEFAULT 0,
      tutor_memory TEXT,
      last_drill TEXT,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
}

export function getLanguageProfile(userId: string): LanguageProfileRow | null {
  initializeZhiLanguageProfileSchema();
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_language_profiles WHERE user_id = ?`)
    .get(userId.trim()) as LanguageProfileRow | undefined;
  return row ?? null;
}

export function upsertLanguageProfile(
  userId: string,
  patch: Partial<{
    levelBand: LanguageLevelBand;
    speakingEst: number;
    writingEst: number;
    focusSkill: string;
    weakTags: string[];
    streakDays: number;
    totalSessions: number;
    shadowPassStreak: number;
    tutorMemory: string;
    lastDrill: string;
  }>,
): LanguageProfileRow {
  initializeZhiLanguageProfileSchema();
  const uid = userId.trim();
  const prev = getLanguageProfile(uid);
  const level_band = patch.levelBand ?? prev?.level_band ?? 'B1';
  const speaking_est = patch.speakingEst ?? prev?.speaking_est ?? 18;
  const writing_est = patch.writingEst ?? prev?.writing_est ?? 18;
  const focus_skill = patch.focusSkill ?? prev?.focus_skill ?? 'logic';
  const weak_tags_json = JSON.stringify(patch.weakTags ?? JSON.parse(prev?.weak_tags_json ?? '[]'));
  const streak_days = patch.streakDays ?? prev?.streak_days ?? 0;
  const total_sessions = patch.totalSessions ?? prev?.total_sessions ?? 0;
  const shadow_pass_streak = patch.shadowPassStreak ?? prev?.shadow_pass_streak ?? 0;
  const tutor_memory = (patch.tutorMemory ?? prev?.tutor_memory ?? '').slice(0, 400) || null;
  const last_drill = (patch.lastDrill ?? prev?.last_drill ?? '').slice(0, 300) || null;

  getLearningDb()
    .prepare(
      `
    INSERT INTO zhi_language_profiles (
      user_id, level_band, speaking_est, writing_est, focus_skill, weak_tags_json,
      streak_days, total_sessions, shadow_pass_streak, tutor_memory, last_drill, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(user_id) DO UPDATE SET
      level_band = excluded.level_band,
      speaking_est = excluded.speaking_est,
      writing_est = excluded.writing_est,
      focus_skill = excluded.focus_skill,
      weak_tags_json = excluded.weak_tags_json,
      streak_days = excluded.streak_days,
      total_sessions = excluded.total_sessions,
      shadow_pass_streak = excluded.shadow_pass_streak,
      tutor_memory = excluded.tutor_memory,
      last_drill = excluded.last_drill,
      updated_at = excluded.updated_at
  `,
    )
    .run(
      uid,
      level_band,
      speaking_est,
      writing_est,
      focus_skill,
      weak_tags_json,
      streak_days,
      total_sessions,
      shadow_pass_streak,
      tutor_memory,
      last_drill,
    );

  return getLanguageProfile(uid)!;
}
