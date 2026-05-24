import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

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

export async function fetchLearnerDashboard(userId: string): Promise<LearnerDashboardDto> {
  const res = await authFetch(`/api/v3.5/zhi/learner-dashboard/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '获取仪表盘失败');
  return unwrapEnvelope<LearnerDashboardDto>(json);
}
