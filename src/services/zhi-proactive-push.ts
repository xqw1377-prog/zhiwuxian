/**
 * ZHI · 主动学习推送引擎
 * 定期检查各数据源，推送用户需要关注的学习提醒
 */

import { getLearningDb } from '../../server/wuxian-learning-db';

export type PushItem = {
  type: 'review_due' | 'plan_pending' | 'exam_retake' | 'streak_warning' | 'achievement_near' | 'chapter_stuck';
  title: string;
  body: string;
  priority: 'high' | 'medium' | 'low';
  action: { label: string; toolTab?: string } | null;
};

export type ProactivePushDto = {
  items: PushItem[];
  total: number;
  highPriority: number;
};

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDateEnCa(d);
}

function formatDateEnCa(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** 近 7 个自然日（含今天），Asia/Shanghai */
export function last7CalendarDates(): string[] {
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(formatDateEnCa(d));
  }
  return dates;
}

const STREAK_MIN_SECONDS_PER_DAY = 300;

/** 连续 7 天均无记录，或每日学习时长均 < 5 分钟 */
export function isStreakWarning(uid: string, db: ReturnType<typeof getLearningDb>): boolean {
  const dates = last7CalendarDates();
  const placeholders = dates.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT stat_date, total_seconds FROM zhi_study_stats
       WHERE user_id = ? AND stat_date IN (${placeholders})`,
    )
    .all(uid, ...dates) as Array<{ stat_date: string; total_seconds: number }>;
  const secondsByDate = new Map(rows.map((r) => [r.stat_date, Number(r.total_seconds)]));
  return dates.every((d) => (secondsByDate.get(d) ?? 0) < STREAK_MIN_SECONDS_PER_DAY);
}

export function getProactivePush(userId: string): ProactivePushDto {
  const uid = userId.trim();
  const db = getLearningDb();
  const today = todayStr();
  const items: PushItem[] = [];

  // 1. Due SM-2 reviews
  const dueReviews = db.prepare(`
    SELECT COUNT(*) as cnt FROM zhi_mistake_bank
    WHERE user_id = ? AND next_review_at <= ? AND mastery_status IN ('needs_review', 'needs_practice')
  `).get(uid, today) as { cnt: number };

  if (dueReviews.cnt > 0) {
    items.push({
      type: 'review_due',
      title: '错题到期复习',
      body: `${dueReviews.cnt} 道错题需要今天复习（间隔重复到期）`,
      priority: dueReviews.cnt >= 5 ? 'high' : 'medium',
      action: { label: '去复习', toolTab: 'mistake' },
    });
  }

  // 2. Today's unfinished planned slots
  const pendingSlots = db.prepare(`
    SELECT COUNT(*) as cnt FROM zhi_planned_slots
    WHERE user_id = ? AND plan_date = ? AND status = 'planned'
  `).get(uid, today) as { cnt: number };

  if (pendingSlots.cnt > 0) {
    // get subject details
    const subjects = db.prepare(`
      SELECT DISTINCT subject FROM zhi_planned_slots
      WHERE user_id = ? AND plan_date = ? AND status = 'planned' AND subject IS NOT NULL AND subject != ''
    `).all(uid, today) as Array<{ subject: string }>;

    const subjectStr = subjects.map(s => s.subject).join('、');
    items.push({
      type: 'plan_pending',
      title: '今日计划待完成',
      body: subjectStr
        ? `今天还有 ${pendingSlots.cnt} 个学习时段未完成（${subjectStr}）`
        : `今天还有 ${pendingSlots.cnt} 个学习时段未完成`,
      priority: 'medium',
      action: { label: '查看计划', toolTab: 'plan' },
    });
  }

  // 3. Pending exam retakes
  const retakes = db.prepare(`
    SELECT COUNT(*) as cnt FROM zhi_exams
    WHERE user_id = ? AND status = 'generated' AND title LIKE '%重考%'
  `).get(uid) as { cnt: number };

  if (retakes.cnt > 0) {
    items.push({
      type: 'exam_retake',
      title: '模考重考待完成',
      body: `你有 ${retakes.cnt} 份待完成的重考试卷，上次未达标需要重考`,
      priority: 'high',
      action: { label: '去重考', toolTab: 'exam' },
    });
  }

  // 4. Streak warning — 近 7 个自然日每日均 <5min（无记录按 0 分钟计）
  if (isStreakWarning(uid, db)) {
    const weekRows = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM zhi_study_stats
         WHERE user_id = ? AND stat_date >= ?`,
      )
      .get(uid, daysAgoStr(6)) as { cnt: number };
    items.push({
      type: 'streak_warning',
      title: '学习连续性问题',
      body:
        weekRows.cnt === 0
          ? '过去一周没有学习记录，建议今天开始保持连续学习'
          : '过去 7 天每日学习均不足 5 分钟，建议今日投入至少 30 分钟',
      priority: 'medium',
      action: { label: '开始学习', toolTab: 'plan' },
    });
  }

  // 5. Achievement nearly unlocked
  const nearAchievements = db.prepare(`
    SELECT code, title, progress_current, progress_target FROM zhi_achievements
    WHERE user_id = ? AND status = 'locked'
      AND CAST(progress_current AS REAL) / CAST(progress_target AS REAL) >= 0.7
    ORDER BY (CAST(progress_current AS REAL) / CAST(progress_target AS REAL)) DESC
    LIMIT 3
  `).all(uid) as Array<{ code: string; title: string; progress_current: number; progress_target: number }>;

  for (const ach of nearAchievements) {
    const pct = Math.round((Number(ach.progress_current) / Number(ach.progress_target)) * 100);
    items.push({
      type: 'achievement_near',
      title: `成就即将解锁：${String(ach.title)}`,
      body: `进度 ${pct}%（${ach.progress_current}/${ach.progress_target}），再努力一下即可获得`,
      priority: 'low',
      action: null,
    });
  }

  // 6. Stuck textbook chapters (in_progress > 3 days)
  const stuckChapters = db.prepare(`
    SELECT tp.chapter_index, tp.catalog_id, tp.started_at
    FROM zhi_textbook_progress tp
    WHERE tp.user_id = ? AND tp.status = 'in_progress'
      AND tp.started_at < datetime('now', '-3 days')
    LIMIT 3
  `).all(uid) as Array<{ chapter_index: number; catalog_id: string; started_at: string }>;

  if (stuckChapters.length > 0) {
    items.push({
      type: 'chapter_stuck',
      title: '教材章节学习中断',
      body: `你有 ${stuckChapters.length} 章教材学习超过 3 天未完成，建议继续`,
      priority: 'low',
      action: { label: '继续学习', toolTab: 'textbook' },
    });
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    items,
    total: items.length,
    highPriority: items.filter(i => i.priority === 'high').length,
  };
}
