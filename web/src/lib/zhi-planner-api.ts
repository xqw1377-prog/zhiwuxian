import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type PlanDto = {
  id: string;
  status: string;
  dataCompletenessPct: number;
  missingFields: string[];
  planSummary: string | null;
  phases: Array<{
    id: string;
    phaseName: string;
    startDate: string;
    endDate: string;
    focusArea: string;
    milestoneStatus: string;
  }>;
  weeklySlots: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    subject: string;
    taskDescription: string;
    status: string;
  }>;
  assessmentSchedule: Array<{
    id: string;
    subjectId: string;
    scheduledDate: string;
    status: string;
  }>;
};

export type TodayPlanDto = {
  date: string;
  slots: Array<{
    id: string;
    startTime: string;
    endTime: string;
    subject: string;
    taskDescription: string;
    status: string;
    actualMinutes: number | null;
  }>;
  completed: number;
  total: number;
  coachLine: string;
};

export type DataGapsDto = {
  missingFields: string[];
  completenessPct: number;
  priority: string;
};

export type DataRequestDto = {
  requestId: string | null;
  questions: Array<{ field: string; question: string }>;
  gaps: string[];
  priority: string;
  createdAt: string;
  message: string;
};

export type PatrolResultDto = {
  issues: Array<{ type: string; severity: string; message: string }>;
  recommendations: string[];
  actionRequired: boolean;
};

export async function fetchPlan(userId: string): Promise<PlanDto> {
  const res = await authFetch(`/api/v3.5/zhi/plan/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '获取规划失败');
  return unwrapEnvelope<PlanDto>(json);
}

export async function fetchTodayPlan(userId: string): Promise<TodayPlanDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/plan/today/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<TodayPlanDto | null>(json);
}

export async function fetchDataGaps(userId: string): Promise<DataGapsDto> {
  const res = await authFetch(`/api/v3.5/zhi/plan/gaps/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '获取数据缺口失败');
  return unwrapEnvelope<DataGapsDto>(json);
}

export async function generatePlan(userId: string): Promise<PlanDto> {
  const res = await authFetch('/api/v3.5/zhi/plan/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '生成规划失败');
  return unwrapEnvelope<PlanDto>(json);
}

export async function completeSlot(
  userId: string,
  slotId: string,
  actualMinutes?: number,
): Promise<{ ok: boolean }> {
  const res = await authFetch('/api/v3.5/zhi/plan/complete-slot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, slotId, actualMinutes }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '完成时段失败');
  return unwrapEnvelope<{ ok: boolean }>(json);
}

export async function patrolPlan(userId: string): Promise<PatrolResultDto> {
  const res = await authFetch(`/api/v3.5/zhi/plan/patrol/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '巡检失败');
  return unwrapEnvelope<PatrolResultDto>(json);
}

export async function submitUserData(
  userId: string,
  data: Record<string, string>,
): Promise<{ ok: boolean }> {
  const res = await authFetch('/api/v3.5/zhi/plan/submit-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...data }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '提交数据失败');
  return unwrapEnvelope<{ ok: boolean }>(json);
}
