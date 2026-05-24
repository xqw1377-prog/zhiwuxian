/**
 * ZHI · 成就系统
 * 自动检测并解锁成就徽章
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';

export type AchievementDto = {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
  progressCurrent: number;
  progressTarget: number;
  status: string;
  category: string;
};

export const ACHIEVEMENT_DEFS = [
  { code: 'first_assessment', title: '初次评估', description: '完成第一次学习评估', icon: '📝', category: 'milestone', target: 1 },
  { code: 'week_streak_1', title: '坚持一周', description: '连续学习 7 天', icon: '🔥', category: 'streak', target: 7 },
  { code: 'week_streak_2', title: '坚持两周', description: '连续学习 14 天', icon: '🔥', category: 'streak', target: 14 },
  { code: 'month_streak', title: '月度全勤', description: '连续学习 30 天', icon: '💪', category: 'streak', target: 30 },
  { code: 'mistakes_10', title: '纠错战士', description: '累积复习 10 道错题', icon: '✏️', category: 'mistake', target: 10 },
  { code: 'mistakes_50', title: '纠错大师', description: '累积复习 50 道错题', icon: '✏️', category: 'mistake', target: 50 },
  { code: 'assessments_10', title: '考霸入门', description: '完成 10 次评估', icon: '🎯', category: 'assessment', target: 10 },
  { code: 'assessments_50', title: '考霸进阶', description: '完成 50 次评估', icon: '🎯', category: 'assessment', target: 50 },
  { code: 'hours_10', title: '十小时战士', description: '累计学习 10 小时', icon: '⏰', category: 'time', target: 36000 },
  { code: 'hours_50', title: '五十小时达人', description: '累计学习 50 小时', icon: '⏰', category: 'time', target: 180000 },
  { code: 'hours_100', title: '百时英雄', description: '累计学习 100 小时', icon: '🏆', category: 'time', target: 360000 },
  { code: 'master_5', title: '知识猎手', description: '掌握 5 个知识点', icon: '🧠', category: 'mastery', target: 5 },
  { code: 'master_20', title: '知识达人', description: '掌握 20 个知识点', icon: '🧠', category: 'mastery', target: 20 },
  { code: 'mistake_master_10', title: '错题终结者', description: '将 10 道错题改到掌握', icon: '✅', category: 'mistake', target: 10 },
  { code: 'first_goal', title: '目标启航', description: '设定第一个梦校目标', icon: '🚀', category: 'milestone', target: 1 },
];

export function ensureAchievements(userId: string): void {
  const db = getLearningDb();
  const uid = userId.trim();

  const existing = new Set(
    (db.prepare(`SELECT code FROM zhi_achievements WHERE user_id = ?`).all(uid) as Array<{ code: string }>).map(r => r.code),
  );

  const insert = db.prepare(`
    INSERT OR IGNORE INTO zhi_achievements (id, user_id, code, title, description, icon, progress_current, progress_target, status, category, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'locked', ?, datetime('now'))
  `);

  for (const def of ACHIEVEMENT_DEFS) {
    if (!existing.has(def.code)) {
      insert.run(randomUUID().replace(/-/g, '').slice(0, 16), uid, def.code, def.title, def.description, def.icon, def.target, def.category);
    }
  }
}

export function getAllAchievements(userId: string): AchievementDto[] {
  ensureAchievements(userId);
  const db = getLearningDb();
  return (db.prepare(`SELECT * FROM zhi_achievements WHERE user_id = ? ORDER BY
    CASE status WHEN 'unlocked' THEN 0 ELSE 1 END,
    category,
    created_at ASC
  `).all(userId.trim()) as Array<Record<string, unknown>>).map(mapAchievement);
}

export function getUnlockedAchievements(userId: string): AchievementDto[] {
  const db = getLearningDb();
  return (db.prepare(`SELECT * FROM zhi_achievements WHERE user_id = ? AND status = 'unlocked' ORDER BY unlocked_at DESC`).all(userId.trim()) as Array<Record<string, unknown>>).map(mapAchievement);
}

export function checkAndUnlock(userId: string, category: string, progressValue: number): AchievementDto[] {
  const uid = userId.trim();
  const db = getLearningDb();

  const newlyUnlocked: AchievementDto[] = [];
  const candidates = db.prepare(
    `SELECT * FROM zhi_achievements WHERE user_id = ? AND category = ? AND status = 'locked'`
  ).all(uid, category) as Array<Record<string, unknown>>;

  for (const ach of candidates) {
    const target = ach.progress_target as number;
    if (progressValue >= target) {
      db.prepare(`UPDATE zhi_achievements SET status = 'unlocked', unlocked_at = datetime('now'), progress_current = ? WHERE id = ?`)
        .run(Math.min(progressValue, target), ach.id);
      newlyUnlocked.push(mapAchievement({ ...ach, status: 'unlocked', unlocked_at: new Date().toISOString() }));
    } else {
      db.prepare(`UPDATE zhi_achievements SET progress_current = ? WHERE id = ?`)
        .run(progressValue, ach.id);
    }
  }

  return newlyUnlocked;
}

export function updateProgress(userId: string, code: string, progress: number): void {
  const db = getLearningDb();
  const uid = userId.trim();

  const ach = db.prepare(`SELECT * FROM zhi_achievements WHERE user_id = ? AND code = ?`).get(uid, code) as Record<string, unknown> | undefined;
  if (!ach) return;

  if (ach.status === 'unlocked') return;

  const target = ach.progress_target as number;
  if (progress >= target) {
    db.prepare(`UPDATE zhi_achievements SET status = 'unlocked', unlocked_at = datetime('now'), progress_current = ? WHERE id = ?`)
      .run(target, ach.id);
  } else {
    db.prepare(`UPDATE zhi_achievements SET progress_current = ? WHERE id = ?`)
      .run(progress, ach.id);
  }
}

function mapAchievement(row: Record<string, unknown>): AchievementDto {
  return {
    id: row.id as string,
    code: row.code as string,
    title: row.title as string,
    description: (row.description as string) ?? '',
    icon: (row.icon as string) ?? '🏆',
    unlockedAt: row.unlocked_at as string | null,
    progressCurrent: (row.progress_current as number) ?? 0,
    progressTarget: (row.progress_target as number) ?? 1,
    status: (row.status as string) ?? 'locked',
    category: (row.category as string) ?? 'general',
  };
}
