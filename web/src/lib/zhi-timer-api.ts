import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type ActiveSessionDto = {
  id: string;
  startTime: string;
  elapsedSeconds: number;
  subject: string | null;
  sessionType: string;
  energyLevel: string;
};

export type SessionSummaryDto = {
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  todaySessions: number;
  streakDays: number;
  avgEnergy: string;
};

export type WeeklyReportDto = {
  weekDays: Array<{ date: string; totalSeconds: number; sessions: number }>;
  totalSeconds: number;
  avgDailySeconds: number;
  topSubject: string;
  completionRate: number;
};

export async function startSession(input: {
  userId: string;
  subject?: string;
}): Promise<ActiveSessionDto> {
  const res = await authFetch('/api/v3.5/zhi/timer/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '开始学习时段失败');
  return unwrapEnvelope<ActiveSessionDto>(json);
}

export async function endSession(
  userId: string,
  sessionId: string,
  input?: { mood?: string },
): Promise<{ durationSeconds: number }> {
  const res = await authFetch('/api/v3.5/zhi/timer/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, sessionId, ...input }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '结束学习时段失败');
  return unwrapEnvelope<{ durationSeconds: number }>(json);
}

export async function fetchActiveSession(userId: string): Promise<ActiveSessionDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/timer/active/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<ActiveSessionDto | null>(json);
}

export async function fetchSessionSummary(userId: string): Promise<SessionSummaryDto> {
  const res = await authFetch(`/api/v3.5/zhi/timer/summary/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '获取时段统计失败');
  return unwrapEnvelope<SessionSummaryDto>(json);
}

export async function fetchWeeklyReport(userId: string): Promise<WeeklyReportDto> {
  const res = await authFetch(`/api/v3.5/zhi/timer/weekly-report/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '获取周报失败');
  return unwrapEnvelope<WeeklyReportDto>(json);
}
