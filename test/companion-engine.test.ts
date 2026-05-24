/**
 * WUXIAN · 亲密陪伴引擎测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ensureCompanionSchema } from '../server/companion/companion-schema';
import { ZhiCompanionEngine } from '../server/companion/ZhiCompanionEngine';
import { getLearningDb } from '../server/wuxian-learning-db';

describe('ZhiCompanionEngine', () => {
  let db: Database.Database;

  beforeEach(() => {
    getLearningDb();
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        duration_days INTEGER NOT NULL,
        remaining_days INTEGER NOT NULL,
        drive_force TEXT NOT NULL,
        total_energy REAL NOT NULL,
        current_slope REAL NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        persona_type TEXT NOT NULL
      )
    `);
    ensureCompanionSchema(db);
    db.prepare(`INSERT INTO goals (id, title, duration_days, remaining_days, drive_force, total_energy, current_slope, persona_type)
      VALUES ('goal-1', '托福突破', 90, 60, 'CMU', 100, 5.0, 'ZHI')`).run();
    (ZhiCompanionEngine as any).db = db;
  });

  afterEach(() => {
    db.close();
    (ZhiCompanionEngine as any).db = null;
  });

  it('生成每日战报并写入 DB', () => {
    ZhiCompanionEngine.generateDailyReport({
      goalId: 'goal-1',
      studentId: 'student-1',
      knowledgePoints: ['独立主格', '虚拟语气'],
      slopeChange: -0.5,
      dreamSchoolDistance: 42,
      zhiComment: '今天够硬。',
      effectiveMinutes: 240,
      escapeCount: 1,
    });

    const report = ZhiCompanionEngine.getLatestReport('student-1');
    expect(report).not.toBeNull();
    expect(Number(report!.effective_minutes)).toBe(240);
    expect(Number(report!.slope_change)).toBe(-0.5);
    expect(Number(report!.school_distance)).toBe(42);
  });

  it('家长鼓励注入 Warp 并降低斜率', () => {
    const result = ZhiCompanionEngine.injectParentEncouragement({
      goalId: 'goal-1',
      studentId: 'student-1',
      message: '今晚加鸡腿',
      fuelBonus: 5,
      cheerStyle: 'HEART',
    });

    const goal = db.prepare('SELECT current_slope FROM goals WHERE id = ?').get('goal-1') as { current_slope: number };
    expect(goal.current_slope).toBeLessThan(5);
    expect(result.fuelRemaining).toBe(goal.current_slope);

    const cheerLog = db.prepare('SELECT * FROM parent_cheer_log WHERE goal_id = ?').all('goal-1');
    expect(cheerLog).toHaveLength(1);
  });

  it('战报历史查询（同日覆盖保留最新）', () => {
    ZhiCompanionEngine.generateDailyReport({ ...dailyPayload, effectiveMinutes: 100 });
    ZhiCompanionEngine.generateDailyReport({ ...dailyPayload, effectiveMinutes: 220 });

    const history = ZhiCompanionEngine.getReportsHistory('student-1', 3);
    expect(history).toHaveLength(1);
    expect(Number(history[0].effective_minutes)).toBe(220);
  });

  it('WeChat 卡片组装格式正确', () => {
    ZhiCompanionEngine.generateDailyReport(dailyPayload);
    const card = ZhiCompanionEngine.composeWeChatCard('student-1');
    expect(card).not.toBeNull();
    expect(card!.title).toBe('三维时间折叠战报');
    expect(card!.foldSummary).toContain(`${dailyPayload.effectiveMinutes} 分钟`);
    expect(card!.cheerActions).toHaveLength(3);
    expect(card!.goalId).toBe('goal-1');
    expect(card!.cheerActions[0].label).toContain('老父亲');
  });

  it('月度复盘聚合计算正确', () => {
    for (let i = 0; i < 10; i++) {
      ZhiCompanionEngine.generateDailyReport({ ...dailyPayload, effectiveMinutes: 200 });
    }
    // 注入一次鼓励
    ZhiCompanionEngine.injectParentEncouragement({
      goalId: 'goal-1', studentId: 'student-1',
      message: '加油', fuelBonus: 5, cheerStyle: 'FIRE',
    });

    const recap = ZhiCompanionEngine.getMacroRecap('student-1', 30);
    expect(Number(recap.total_days)).toBe(1);
    expect(Number(recap.total_minutes)).toBe(200);
    expect(Number(recap.total_cheers)).toBe(1);
    expect(Number(recap.total_fuel)).toBe(5);
  });
});

const dailyPayload = {
  goalId: 'goal-1',
  studentId: 'student-1',
  knowledgePoints: ['独立主格'],
  slopeChange: -0.3,
  dreamSchoolDistance: 40,
  zhiComment: '继续加油',
  effectiveMinutes: 200,
  escapeCount: 0,
};
