/**
 * ZHI · 学习计时器 + 情绪追踪 + 周报
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';

type SessionRow = {
  id: string;
  user_id: string;
  subject: string | null;
  knowledge_node_id: string | null;
  start_time: string;
  end_time: string | null;
  duration_seconds: number;
  session_type: string;
  status: string;
  energy_level: string;
  mood: string | null;
  notes: string | null;
  slot_id: string | null;
};

export type ActiveSessionDto = {
  id: string;
  startTime: string;
  elapsedSeconds: number;
  subject: string | null;
  sessionType: string;
  energyLevel: string;
};

export type SessionSummary = {
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  todaySessions: number;
  streakDays: number;
  avgEnergy: string;
};

export function startSession(input: {
  userId: string;
  subject?: string;
  knowledgeNodeId?: string;
  sessionType?: string;
  energyLevel?: string;
  slotId?: string;
}): ActiveSessionDto {
  const db = getLearningDb();
  const id = randomUUID().replace(/-/g, '').slice(0, 16);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO zhi_learning_sessions (id, user_id, subject, knowledge_node_id, start_time, session_type, energy_level, slot_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', datetime('now'))
  `).run(
    id, input.userId.trim(),
    input.subject ?? null, input.knowledgeNodeId ?? null,
    now, input.sessionType ?? 'study',
    input.energyLevel ?? 'medium', input.slotId ?? null,
  );

  return { id, startTime: now, elapsedSeconds: 0, subject: input.subject ?? null, sessionType: input.sessionType ?? 'study', energyLevel: input.energyLevel ?? 'medium' };
}

export function endSession(userId: string, sessionId: string, input?: { mood?: string; notes?: string }): { durationSeconds: number } {
  const db = getLearningDb();
  const row = db.prepare(`SELECT * FROM zhi_learning_sessions WHERE id = ? AND user_id = ?`).get(sessionId, userId.trim()) as SessionRow | undefined;
  if (!row) throw new Error('会话不存在');

  const start = new Date(row.start_time).getTime();
  const duration = Math.round((Date.now() - start) / 1000);
  const endStr = new Date().toISOString();

  const updates: string[] = ["status = 'completed'", 'end_time = ?', 'duration_seconds = ?'];
  const params: unknown[] = [endStr, duration];

  if (input?.mood) { updates.push('mood = ?'); params.push(input.mood); }
  if (input?.notes) { updates.push('notes = ?'); params.push(input.notes); }

  params.push(sessionId, userId.trim());
  db.prepare(`UPDATE zhi_learning_sessions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);

  return { durationSeconds: duration };
}

export function getActiveSession(userId: string): ActiveSessionDto | null {
  const db = getLearningDb();
  const row = db.prepare(
    `SELECT * FROM zhi_learning_sessions WHERE user_id = ? AND status = 'in_progress' ORDER BY start_time DESC LIMIT 1`
  ).get(userId.trim()) as SessionRow | undefined;

  if (!row) return null;

  const elapsed = Math.round((Date.now() - new Date(row.start_time).getTime()) / 1000);
  return {
    id: row.id, startTime: row.start_time, elapsedSeconds: elapsed,
    subject: row.subject, sessionType: row.session_type, energyLevel: row.energy_level,
  };
}

export function getSessionSummary(userId: string): SessionSummary {
  const uid = userId.trim();
  const db = getLearningDb();

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const todaySec = (db.prepare(
    `SELECT COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`
  ).get(uid, today) as { s: number }).s;

  const weekSec = (db.prepare(
    `SELECT COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) >= ? AND status = 'completed'`
  ).get(uid, weekAgo) as { s: number }).s;

  const monthSec = (db.prepare(
    `SELECT COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) >= ? AND status = 'completed'`
  ).get(uid, monthAgo) as { s: number }).s;

  const todaySessions = (db.prepare(
    `SELECT COUNT(*) as c FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`
  ).get(uid, today) as { c: number }).c;

  const streakDays = (db.prepare(
    `SELECT streak_day FROM zhi_study_stats WHERE user_id = ? AND stat_date = ?`
  ).get(uid, today) as { streak_day: number } | undefined)?.streak_day ?? 0;

  const avgEnergyRow = db.prepare(
    `SELECT energy_level FROM zhi_learning_sessions WHERE user_id = ? AND status = 'completed' ORDER BY start_time DESC LIMIT 5`
  ).all(uid) as Array<{ energy_level: string }>;

  const energyCounts: Record<string, number> = {};
  for (const r of avgEnergyRow) { energyCounts[r.energy_level] = (energyCounts[r.energy_level] ?? 0) + 1; }
  const avgEnergy = Object.entries(energyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'medium';

  return {
    todaySeconds: todaySec, weekSeconds: weekSec, monthSeconds: monthSec,
    todaySessions, streakDays, avgEnergy,
  };
}

export function getWeeklyReport(userId: string): {
  weekDays: Array<{ date: string; totalSeconds: number; sessions: number }>;
  totalSeconds: number;
  avgDailySeconds: number;
  topSubject: string;
  completionRate: number;
} {
  const uid = userId.trim();
  const db = getLearningDb();

  const weekDays: Array<{ date: string; totalSeconds: number; sessions: number }> = [];
  let totalSeconds = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const sec = (db.prepare(
      `SELECT COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`
    ).get(uid, d) as { s: number }).s;
    const count = (db.prepare(
      `SELECT COUNT(*) as c FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) = ? AND status = 'completed'`
    ).get(uid, d) as { c: number }).c;
    weekDays.push({ date: d, totalSeconds: sec, sessions: count });
    totalSeconds += sec;
  }

  const topSubject = (db.prepare(
    `SELECT subject, COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions WHERE user_id = ? AND date(start_time) >= ? AND status = 'completed' AND subject IS NOT NULL GROUP BY subject ORDER BY s DESC LIMIT 1`
  ).get(uid, new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)) as { subject: string } | undefined)?.subject ?? '无';

  const completionRate = (db.prepare(
    `SELECT SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done, COUNT(*) as total FROM zhi_planned_slots WHERE user_id = ? AND plan_date >= ? AND plan_date <= ?`
  ).get(uid, new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)) as { done: number; total: number });

  return {
    weekDays, totalSeconds,
    avgDailySeconds: Math.round(totalSeconds / 7),
    topSubject,
    completionRate: completionRate.total > 0 ? Math.round(completionRate.done / completionRate.total * 100) : 0,
  };
}
