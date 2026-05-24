/**
 * WUXIAN · 三人称亲密陪伴中台引擎
 *
 * 每日深夜自动熔炼"三维时间折叠战报"，推送到家长微信端。
 * 家长点击鼓励按钮 → 孩子客户端满屏特效 + Warp 燃料注入。
 */

import Database from 'better-sqlite3';
import { getCoreDb } from '../wuxian-core-db';
import { ensureCompanionSchema } from './companion-schema';
import { pushParentCheerToStudent } from '../../src/services/parent-cheer-sse';
import { topUpWarp } from '../../src/services/billing-hub';
import { pushDailyReportToWeChat, pushParentCheerToWeChat } from './wechat-gateway';

export interface DailyReportPayload {
  goalId: string;
  studentId: string;
  knowledgePoints: string[];
  slopeChange: number;
  dreamSchoolDistance: number;
  zhiComment: string;
  effectiveMinutes?: number;
  escapeCount?: number;
  sessionBreakdown?: { reading: number; listening: number; speaking: number; writing: number };
}

export interface ParentCheerRequest {
  goalId: string;
  studentId: string;
  message: string;
  fuelBonus?: number;
  cheerStyle?: 'FIRE' | 'HEART' | 'SHIELD';
}

export class ZhiCompanionEngine {
  private static db: Database.Database;

  private static getDb(): Database.Database {
    if (!ZhiCompanionEngine.db) {
      ZhiCompanionEngine.db = getCoreDb();
      ensureCompanionSchema(ZhiCompanionEngine.db);
    }
    return ZhiCompanionEngine.db;
  }

  /**
   * 每日深夜自动熔炼"亲密陪伴战报"
   */
  static generateDailyReport(payload: DailyReportPayload): void {
    const db = ZhiCompanionEngine.getDb();
    const dateStr = new Date().toISOString().slice(0, 10);
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`DELETE FROM student_companion_reports WHERE student_id = ? AND report_date = ?`).run(
      payload.studentId,
      dateStr,
    );

    db.prepare(`
      INSERT INTO student_companion_reports (
        goal_id, student_id, report_date, knowledge_json,
        slope_change, school_distance, zhi_comment,
        effective_minutes, escape_count,
        reading_sessions, listening_sessions, speaking_sessions, writing_sessions,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.goalId,
      payload.studentId,
      dateStr,
      JSON.stringify(payload.knowledgePoints),
      payload.slopeChange,
      payload.dreamSchoolDistance,
      payload.zhiComment,
      payload.effectiveMinutes ?? 0,
      payload.escapeCount ?? 0,
      payload.sessionBreakdown?.reading ?? 0,
      payload.sessionBreakdown?.listening ?? 0,
      payload.sessionBreakdown?.speaking ?? 0,
      payload.sessionBreakdown?.writing ?? 0,
      now,
    );

    console.log(`[陪伴中台] 学生 ${payload.studentId} 今日战报已生成`);

    // 异步推送微信
    ZhiCompanionEngine.pushToWeChatGateway(payload, dateStr);
  }

  /**
   * 家长点击"加油鼓励" → 注入 Warp 燃料 + 推送特效到学生端
   */
  static injectParentEncouragement(req: ParentCheerRequest): {
    fuelRemaining: number;
    warpPointsRemaining: number;
    studentNotified: boolean;
  } {
    const db = ZhiCompanionEngine.getDb();
    const bonus = req.fuelBonus ?? 5;
    const style = req.cheerStyle ?? 'FIRE';

    const slopeAfter = db.transaction(() => {
      db.prepare(`
        INSERT INTO parent_cheer_log (goal_id, student_id, parent_type, message, fuel_bonus, cheer_style, created_at)
        VALUES (?, ?, 'WECHAT', ?, ?, ?, strftime('%s', 'now'))
      `).run(req.goalId, req.studentId, req.message, bonus, style);

      db.prepare(`
        INSERT INTO student_messages (goal_id, student_id, sender, content, created_at)
        VALUES (?, ?, 'PARENT', ?, strftime('%s', 'now'))
      `).run(req.goalId, req.studentId, req.message);

      db.prepare(`
        UPDATE goals SET current_slope = MAX(ROUND(current_slope - ?, 2), 1)
        WHERE id = ?
      `).run(bonus * 0.1, req.goalId);

      const goal = db.prepare('SELECT current_slope FROM goals WHERE id = ?').get(req.goalId) as { current_slope: number } | undefined;
      return goal?.current_slope ?? 1;
    })();

    const warpPointsRemaining = topUpWarp(req.studentId, bonus, 'PARENT_CHEER');

    const notified = pushParentCheerToStudent(req.studentId, {
      message: req.message,
      fuelBonus: bonus,
      cheerStyle: style,
    });

    void pushParentCheerToWeChat(req.studentId, req.message, bonus);

    console.log(`[亲密陪伴] "${req.message}" → ${req.studentId} +${bonus} Warp, 斜率 ${slopeAfter}`);
    return { fuelRemaining: slopeAfter, warpPointsRemaining, studentNotified: notified };
  }

  /**
   * 获取学生最新战报（家长端首页）
   */
  static getLatestReport(studentId: string): Record<string, unknown> | null {
    const db = ZhiCompanionEngine.getDb();
    const row = db.prepare(`
      SELECT r.*, g.title, g.current_slope
      FROM student_companion_reports r
      LEFT JOIN goals g ON r.goal_id = g.id
      WHERE r.student_id = ?
      ORDER BY r.created_at DESC LIMIT 1
    `).get(studentId) as Record<string, unknown> | undefined;
    return row ?? null;
  }

  /**
   * 获取学生战报历史（按周）
   */
  static getReportsHistory(studentId: string, limit = 14): Record<string, unknown>[] {
    const db = ZhiCompanionEngine.getDb();
    return db.prepare(`
      SELECT * FROM student_companion_reports
      WHERE student_id = ?
      ORDER BY report_date DESC LIMIT ?
    `).all(studentId, limit) as Record<string, unknown>[];
  }

  /**
   * 每月/每年复盘聚合
   */
  static getMacroRecap(studentId: string, days: number): Record<string, unknown> {
    const db = ZhiCompanionEngine.getDb();
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

    const reports = db.prepare(`
      SELECT COUNT(*) as total_days,
             SUM(effective_minutes) as total_minutes,
             SUM(escape_count) as total_escapes,
             SUM(reading_sessions + listening_sessions + speaking_sessions + writing_sessions) as total_sessions,
             AVG(slope_change) as avg_slope_change,
             MIN(school_distance) as nearest_distance
      FROM student_companion_reports
      WHERE student_id = ? AND created_at >= ?
    `).get(studentId, cutoff) as Record<string, unknown>;

    const cheers = db.prepare(`
      SELECT COUNT(*) as total_cheers, SUM(fuel_bonus) as total_fuel
      FROM parent_cheer_log
      WHERE student_id = ? AND created_at >= ?
    `).get(studentId, cutoff) as Record<string, unknown>;

    let reroutes: { reroute_count: number } = { reroute_count: 0 };
    try {
      reroutes = db.prepare(`
        SELECT COUNT(*) as reroute_count
        FROM reroute_logs r
        JOIN goals g ON r.goal_id = g.id
        WHERE g.user_id = ? AND r.timestamp >= datetime(?, 'unixepoch')
      `).get(studentId, cutoff) as { reroute_count: number };
    } catch {
      reroutes = { reroute_count: 0 };
    }

    return {
      periodDays: days,
      ...reports,
      ...cheers,
      ...reroutes,
    };
  }

  /**
   * 组装家长微信端战报卡片数据
   */
  static composeWeChatCard(studentId: string): Record<string, unknown> | null {
    const latest = ZhiCompanionEngine.getLatestReport(studentId);
    if (!latest) return null;

    const knowledge: string[] = JSON.parse(String(latest.knowledge_json || '[]'));
    const minutes = Number(latest.effective_minutes ?? 0);
    const escapes = Number(latest.escape_count ?? 0);
    const distance = Number(latest.school_distance ?? 0);
    const speaking = Number(latest.speaking_sessions ?? 0);
    const reading = Number(latest.reading_sessions ?? 0);
    const goalId = String(latest.goal_id ?? '');

    const battleParts: string[] = [];
    if (speaking > 0) battleParts.push(`口语 TPO 刷题 ${speaking} 组`);
    if (reading > 0) battleParts.push(`阅读精析 ${reading} 组`);
    if (knowledge.length > 0) {
      battleParts.push(`错题/知识点精析 ${knowledge.length} 个`);
      const top = knowledge[0];
      if (top && !top.includes('掌握度')) {
        battleParts.push(`「${top}」掌握度上升`);
      }
    }
    const battleSummary =
      battleParts.length > 0
        ? battleParts.join('，')
        : '今日已折叠有效学习片段，等待下一次可验证战果入库';

    return {
      title: '三维时间折叠战报',
      goalId,
      studentId,
      date: latest.report_date,
      foldSummary: `折叠时间：今日有效认知心流 ${minutes} 分钟，对抗逃避 ${escapes} 次`,
      battleSummary: `物理战果：${battleSummary}`,
      knowledgePoints: knowledge.slice(0, 5),
      dreamSchoolPull: `梦校引力：今日努力让时间斜率下降 ${Math.abs(Number(latest.slope_change ?? 0)).toFixed(1)}，你离梦校的距离又拉近了 ${distance.toFixed(1)} 公里`,
      zhiComment: String(latest.zhi_comment || ''),
      slope: Number(latest.current_slope ?? 0),
      cheerActions: [
        { label: '🔥 注入50度老父亲重力场', style: 'FIRE', fuel: 5 },
        { label: '❤️ 今晚加鸡腿', style: 'HEART', fuel: 5 },
        { label: '☕ 放手去干，爸妈托底', style: 'SHIELD', fuel: 5 },
      ],
    };
  }

  private static pushToWeChatGateway(_payload: DailyReportPayload, _dateStr: string): void {
    return;
  }

}
