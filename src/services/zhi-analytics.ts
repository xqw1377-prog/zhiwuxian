/**
 * ZHI · 学习分析引擎
 * 汇集错题银行 / 学习计时 / 评估 / 规划数据，生成多维趋势
 */

import { getLearningDb } from '../../server/wuxian-learning-db';

import { getMistakeBank } from './zhi-mistake-bank';
import { getSessionSummary } from './zhi-learning-timer';

export type LearnerDashboardDto = {
  today: {
    studyMinutes: number;
    slotsDone: number;
    slotsTotal: number;
    assessmentsDone: number;
    mistakesReviewed: number;
  };
  week: {
    studyMinutes: number;
    avgDailyMinutes: number;
    completionRate: number;
    streakDays: number;
    topSubject: string;
    trend: Array<{ date: string; minutes: number }>;
  };
  mistakes: {
    total: number;
    needsReview: number;
    mastered: number;
    bySubject: Array<{ subject: string; count: number }>;
    byType: Array<{ type: string; count: number }>;
  };
  achievements: {
    unlocked: number;
    total: number;
    recent: string[];
  };
  abilityRadar: Array<{ subject: string; score: number }>;
  coachLine: string;
};

export function buildLearnerDashboard(userId: string): LearnerDashboardDto {
  const uid = userId.trim();
  const db = getLearningDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // Today stats
  const todayMinutes = Math.round(((db.prepare(
    `SELECT COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`
  ).get(uid, today) as { s: number }).s) / 60);

  const todaySlots = db.prepare(
    `SELECT SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done, COUNT(*) as total FROM zhi_planned_slots WHERE user_id = ? AND plan_date = ?`
  ).get(uid, today) as { done: number; total: number };

  const todayAssessments = (db.prepare(
    `SELECT COUNT(*) as c FROM zhi_assessment_schedule WHERE user_id = ? AND date(completed_at) = ? AND status = 'completed'`
  ).get(uid, today) as { c: number }).c;

  const todayMistakesReviewed = (db.prepare(
    `SELECT COUNT(*) as c FROM zhi_mistake_bank WHERE user_id = ? AND date(last_reviewed_at) = ?`
  ).get(uid, today) as { c: number }).c;

  // Week stats
  const weekMinutes = Math.round(((db.prepare(
    `SELECT COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) >= ? AND status = 'completed'`
  ).get(uid, weekAgo) as { s: number }).s) / 60);

  const weekSlots = db.prepare(
    `SELECT SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done, COUNT(*) as total FROM zhi_planned_slots WHERE user_id = ? AND plan_date >= ? AND plan_date <= ?`
  ).get(uid, weekAgo, today) as { done: number; total: number };

  const streakDays = (db.prepare(
    `SELECT streak_day FROM zhi_study_stats WHERE user_id = ? AND stat_date = ?`
  ).get(uid, today) as { streak_day: number } | undefined)?.streak_day ?? 0;

  const topSubject = (db.prepare(
    `SELECT subject, COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) >= ? AND status = 'completed' AND subject IS NOT NULL GROUP BY subject ORDER BY s DESC LIMIT 1`
  ).get(uid, weekAgo) as { subject: string } | undefined)?.subject ?? '无';

  // Weekly trend
  const trend: Array<{ date: string; minutes: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const m = Math.round(((db.prepare(
      `SELECT COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`
    ).get(uid, d) as { s: number }).s) / 60);
    trend.push({ date: d, minutes: m });
  }

  // Mistake stats
  const mistakeHub = getMistakeBank(uid, { limit: 0 });

  // Achievement stats
  const achievements = db.prepare(
    `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'unlocked' THEN 1 ELSE 0 END) as unlocked FROM zhi_achievements WHERE user_id = ?`
  ).get(uid) as { total: number; unlocked: number };

  const recentAchievements = (db.prepare(
    `SELECT title FROM zhi_achievements WHERE user_id = ? AND status = 'unlocked' ORDER BY unlocked_at DESC LIMIT 3`
  ).all(uid) as Array<{ title: string }>).map(r => r.title);

  // Ability radar from assessment data
  const recentAssessments = db.prepare(
    `SELECT DISTINCT subject_name, score_summary FROM zhi_assessment_papers WHERE user_id = ? AND score_summary IS NOT NULL ORDER BY created_at DESC LIMIT 20`
  ).all(uid) as Array<{ subject_name: string; score_summary: string }>;

  const subjectScores: Record<string, number[]> = {};
  for (const a of recentAssessments) {
    const match = a.score_summary?.match(/(\d+)/);
    if (match) {
      const score = parseInt(match[1]);
      if (!subjectScores[a.subject_name]) subjectScores[a.subject_name] = [];
      subjectScores[a.subject_name].push(score);
    }
  }

  const abilityRadar = Object.entries(subjectScores).map(([subject, scores]) => ({
    subject,
    score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }));

  // Coach line
  const coachLine = buildCoachLine(streakDays, mistakeHub.needsReview, weekSlots);

  return {
    today: {
      studyMinutes: todayMinutes,
      slotsDone: todaySlots.done,
      slotsTotal: todaySlots.total,
      assessmentsDone: todayAssessments,
      mistakesReviewed: todayMistakesReviewed,
    },
    week: {
      studyMinutes: weekMinutes,
      avgDailyMinutes: Math.round(weekMinutes / 7),
      completionRate: weekSlots.total > 0 ? Math.round(weekSlots.done / weekSlots.total * 100) : 0,
      streakDays,
      topSubject,
      trend,
    },
    mistakes: {
      total: mistakeHub.total,
      needsReview: mistakeHub.needsReview,
      mastered: mistakeHub.mastered,
      bySubject: mistakeHub.bySubject,
      byType: mistakeHub.byType,
    },
    achievements: {
      unlocked: achievements.unlocked,
      total: achievements.total,
      recent: recentAchievements,
    },
    abilityRadar,
    coachLine,
  };
}

function buildCoachLine(streakDays: number, needsReview: number, weekSlots: { done: number; total: number }): string {
  if (streakDays >= 30) return '🔥 连续学习一个月！你的坚持已经超越 90% 的人。';
  if (streakDays >= 14) return '💪 两周连击！保持这个节奏，梦校就在眼前。';
  if (streakDays >= 7) return '🔥 连续学习一周！习惯正在养成。';
  if (needsReview > 10) return `📚 你有 ${needsReview} 道错题等待复习，每解决一道就离梦校近一步。`;
  if (weekSlots.total > 0 && weekSlots.done / weekSlots.total < 0.5) return '⚡ 本周完成率偏低，需要调整计划强度吗？';
  if (weekSlots.total === 0) return '🚀 万里长征第一步，先设定一个今天能完成的微目标。';
  return '🌱 持续积累，质变在即。';
}
