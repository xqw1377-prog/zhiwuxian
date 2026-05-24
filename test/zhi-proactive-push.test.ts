import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const testDataRoot = mkdtempSync(join(tmpdir(), 'wuxian-proactive-push-'));
process.env.WUXIAN_DATA_DIR = testDataRoot;
process.env.VITEST = 'true';

import { getLearningDb, resetLearningDbForTests } from '../server/wuxian-learning-db';
import {
  getProactivePush,
  isStreakWarning,
  last7CalendarDates,
} from '../src/services/zhi-proactive-push';

const userId = 'test-proactive-push-user';

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

describe('zhi-proactive-push', () => {
  beforeEach(() => {
    resetLearningDbForTests();
    const db = getLearningDb();
    db.prepare(`DELETE FROM zhi_mistake_bank WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM zhi_planned_slots WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM zhi_exams WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM zhi_study_stats WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM zhi_achievements WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM zhi_textbook_progress WHERE user_id = ?`).run(userId);
  });

  afterAll(() => {
    try {
      rmSync(testDataRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('last7CalendarDates 返回 7 天', () => {
    expect(last7CalendarDates()).toHaveLength(7);
  });

  it('isStreakWarning：7 天均无记录', () => {
    const db = getLearningDb();
    expect(isStreakWarning(userId, db)).toBe(true);
  });

  it('isStreakWarning：某日 ≥5 分钟则不告警', () => {
    const db = getLearningDb();
    const today = todayStr();
    db.prepare(
      `INSERT INTO zhi_study_stats (id, user_id, stat_date, total_seconds) VALUES (?, ?, ?, ?)`,
    ).run(`ss-${today}`, userId, today, 600);
    expect(isStreakWarning(userId, db)).toBe(false);
  });

  it('review_due：≥5 题为 high', () => {
    const db = getLearningDb();
    const today = todayStr();
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO zhi_mistake_bank (id, user_id, subject, question_text, mastery_status, next_review_at)
         VALUES (?, ?, '数学', ?, 'needs_review', ?)`,
      ).run(`m-${i}`, userId, `题${i}`, today);
    }
    const push = getProactivePush(userId);
    const item = push.items.find((x) => x.type === 'review_due');
    expect(item?.priority).toBe('high');
    expect(item?.action?.toolTab).toBe('mistake');
  });

  it('review_due：<5 题为 medium', () => {
    const db = getLearningDb();
    const today = todayStr();
    db.prepare(
      `INSERT INTO zhi_mistake_bank (id, user_id, subject, question_text, mastery_status, next_review_at)
       VALUES ('m1', ?, '数学', '题1', 'needs_review', ?)`,
    ).run(userId, today);
    const item = getProactivePush(userId).items.find((x) => x.type === 'review_due');
    expect(item?.priority).toBe('medium');
  });

  it('plan_pending', () => {
    const db = getLearningDb();
    const today = todayStr();
    db.prepare(
      `INSERT INTO zhi_planned_slots (id, user_id, plan_date, subject, status)
       VALUES ('slot-1', ?, ?, '数学', 'planned')`,
    ).run(userId, today);
    const item = getProactivePush(userId).items.find((x) => x.type === 'plan_pending');
    expect(item?.priority).toBe('medium');
    expect(item?.action?.toolTab).toBe('plan');
  });

  it('exam_retake', () => {
    const db = getLearningDb();
    db.prepare(
      `INSERT INTO zhi_exams (id, user_id, title, status) VALUES ('ex-1', ?, '重考·模考', 'generated')`,
    ).run(userId);
    const item = getProactivePush(userId).items.find((x) => x.type === 'exam_retake');
    expect(item?.priority).toBe('high');
    expect(item?.action?.toolTab).toBe('exam');
  });

  it('streak_warning', () => {
    const item = getProactivePush(userId).items.find((x) => x.type === 'streak_warning');
    expect(item?.priority).toBe('medium');
    expect(item?.action?.toolTab).toBe('plan');
  });

  it('achievement_near', () => {
    const db = getLearningDb();
    db.prepare(
      `INSERT INTO zhi_achievements (id, user_id, code, title, progress_current, progress_target, status)
       VALUES ('a1', ?, 'code1', '七日连胜', 7, 10, 'locked')`,
    ).run(userId);
    const item = getProactivePush(userId).items.find((x) => x.type === 'achievement_near');
    expect(item?.priority).toBe('low');
  });

  it('chapter_stuck', () => {
    const db = getLearningDb();
    db.prepare(
      `INSERT INTO zhi_textbook_progress (id, user_id, catalog_id, chapter_index, status, started_at)
       VALUES ('tp-1', ?, 'cat-1', 3, 'in_progress', datetime('now', '-4 days'))`,
    ).run(userId);
    const item = getProactivePush(userId).items.find((x) => x.type === 'chapter_stuck');
    expect(item?.priority).toBe('low');
    expect(item?.action?.toolTab).toBe('textbook');
  });

  it('按优先级排序 high 在前', () => {
    const db = getLearningDb();
    const today = todayStr();
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO zhi_mistake_bank (id, user_id, subject, question_text, mastery_status, next_review_at)
         VALUES (?, ?, '数学', ?, 'needs_review', ?)`,
      ).run(`m2-${i}`, userId, `题${i}`, today);
    }
    db.prepare(
      `INSERT INTO zhi_exams (id, user_id, title, status) VALUES ('ex-2', ?, '重考·二模', 'generated')`,
    ).run(userId);
    const push = getProactivePush(userId);
    const types = push.items.map((i) => i.type);
    expect(types.indexOf('review_due')).toBeLessThan(types.indexOf('exam_retake'));
  });
});
