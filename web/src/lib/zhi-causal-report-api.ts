import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';
import type { DailyReviewDto } from './zhi-daily-review-api';

export type CausalReportResultDto = {
  zhiOpening: string;
  zhiTip: string;
  zhiCoachNote: string;
  chatText: string;
  weakSubjects: string[];
  dailyReviewReady: boolean;
  review: DailyReviewDto | null;
  languageCoachLine?: string;
  openLanguageCoach?: boolean;
  openVideoLearn?: boolean;
};

export async function submitCausalReport(
  userId: string,
  input: {
    completed: string;
    stuck: string;
    deliverable: string;
    subject?: string;
  },
): Promise<CausalReportResultDto> {
  const res = await authFetch('/api/v3.5/zhi/causal-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...input }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '因果汇报失败');
  }
  return unwrapEnvelope<CausalReportResultDto>(json);
}
