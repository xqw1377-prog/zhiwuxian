import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';
import type { DailyReviewDto } from './zhi-daily-review-api';
import type { SchoolPathway } from './school-pathway';

export type ProactiveBriefDto = {
  protocolEstablished: boolean;
  sessionCount: number;
  activeMode: string;
  activeModeLabel: string;
  protocolDirectory: Array<{ id: string; label: string; trigger: string; zhiRole: string }>;
  headline: string;
  sections: Array<{ title: string; body: string }>;
  chatText: string;
  zhiTip: string;
  zhiCoachNote?: string;
  activatedTool?: string;
  weakSubjects?: string[];
  weakestSubject?: { name: string; progressPct: number } | null;
  challengeIndex?: number;
  daysRemaining?: number;
  dynamicMilestones?: Array<{
    codeName: string;
    deadline: string;
    mission: string;
    status?: string;
  }>;
  dailyReview?: DailyReviewDto | null;
  requiredMetrics?: Record<string, unknown>;
  pathway?: SchoolPathway;
  pathwayLabel?: string;
  lastProactiveAt?: number | null;
  assessmentPaperId?: string;
  assessmentSubjectId?: string;
};

export type ProactiveScene = 'session_open' | 'anchor_wake' | 'return_visit' | 'daily_review';

export async function fetchProactiveBrief(
  userId: string,
  scene: ProactiveScene,
  opts?: { focusDirectoryId?: string | null },
): Promise<ProactiveBriefDto | null> {
  const res = await authFetch('/api/v3.5/zhi/proactive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      scene,
      focusDirectoryId: opts?.focusDirectoryId ?? undefined,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<ProactiveBriefDto>(json);
}
