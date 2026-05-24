import { authFetch, jsonAuthHeaders } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type DirectoryWorkspaceGoalDto = {
  id: string;
  title: string;
  goalType: string;
  remainingDays: number;
  durationDays: number;
  totalEnergy: number;
  remainingEnergy: number;
  currentSlope: number;
  status: string;
  deviationRisk: number;
  todayTasks: Array<{
    id: string;
    content: string;
    status: string;
    energyCost: number;
    failReason: string | null;
  }>;
};

export type DirectoryWorkspaceDto = {
  directoryId: string;
  linkedToDirectory: boolean;
  goals: DirectoryWorkspaceGoalDto[];
  stats: { todoToday: number; doneToday: number; failedToday: number };
  suggestTemplateId?: string;
  suggestTitle?: string;
};

export async function fetchDirectoryWorkspace(
  userId: string,
  directoryId: string,
): Promise<DirectoryWorkspaceDto | null> {
  const res = await authFetch(
    `/api/v3.5/zhi/directory-workspace/${encodeURIComponent(userId)}/${encodeURIComponent(directoryId)}`,
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<DirectoryWorkspaceDto>(json);
}

export async function createDirectoryGoal(input: {
  userId: string;
  directoryId: string;
  title: string;
  days?: number;
  templateId?: string;
}): Promise<DirectoryGoalCreateDto | null> {
  const res = await authFetch('/api/v3.5/zhi/directory-workspace/goal', {
    method: 'POST',
    headers: jsonAuthHeaders(),
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  const data = unwrapEnvelope<{
    goalId?: string;
    sessionId?: string;
    companionSpeech?: string;
    persona?: { greeting?: string };
    todayTasks?: Array<{ id: string; desc: string }>;
  }>(json);
  return {
    goalId: data.goalId ?? data.sessionId ?? '',
    companionSpeech: data.companionSpeech ?? data.persona?.greeting,
    todayTasks: data.todayTasks,
  };
}

export type TaskRerouteDto = {
  companionSpeech: string;
  actionTaken: string;
  showBubble: boolean;
  nextTasks: Array<{ id: string; desc: string; time?: number }>;
  deviationRisk?: number;
};

export type TaskUpdateResult = {
  ok: boolean;
  reroute?: TaskRerouteDto;
};

export type DirectoryGoalCreateDto = {
  goalId: string;
  companionSpeech?: string;
  todayTasks?: Array<{ id: string; desc: string }>;
};

export async function updateTaskStatus(input: {
  goalId: string;
  taskId: string;
  status: 'DONE' | 'FAILED';
  reason?: string;
}): Promise<TaskUpdateResult> {
  const res = await authFetch('/api/v1/task/update', {
    method: 'POST',
    headers: jsonAuthHeaders(),
    body: JSON.stringify({
      goalId: input.goalId,
      taskId: input.taskId,
      status: input.status,
      reason: input.reason,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false };
  const data = unwrapEnvelope<{
    companionSpeech?: string;
    message?: string;
    actionTaken?: string;
    showBubble?: boolean;
    nextTasks?: Array<{ id: string; desc: string; time?: number }>;
    deviationRisk?: number;
  }>(json);
  return {
    ok: true,
    reroute: {
      companionSpeech: data.companionSpeech ?? data.message ?? '',
      actionTaken: data.actionTaken ?? '',
      showBubble: data.showBubble ?? true,
      nextTasks: data.nextTasks ?? [],
      deviationRisk: data.deviationRisk,
    },
  };
}

export { emitDirectoryWorkspaceRefresh } from './wuxian-events';
