import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';
import type { DailyReviewDto } from './zhi-daily-review-api';
import { fetchDailyReview } from './zhi-daily-review-api';
import {
  emitAssessmentReady,
  emitDirectoryWorkspaceRefresh,
  emitWuxianEventUntyped,
  WUXIAN_EVENTS,
  type AssessmentReadyDetail,
} from './wuxian-events';

export type LearningEvidenceKind = 'vision' | 'chat' | 'archive' | 'voice' | 'video';

type EvidenceResponse = {
  review?: DailyReviewDto | null;
  activeExam?: AssessmentReadyDetail | null;
};

/** 试卷/教材/归档后：落库建档 + 强制日内计划修正 + 有学必考主动验收卷 */
export async function followUpAfterLearningEvidence(
  userId: string,
  input: {
    kind: LearningEvidenceKind;
    label?: string;
    excerpt?: string;
    forceDailyReview?: boolean;
  },
): Promise<{ review: DailyReviewDto | null; activeExam: AssessmentReadyDetail | null }> {
  const evidenceRes = await authFetch('/api/v3.5/zhi/baseline/evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      kind: input.kind,
      label: input.label,
      excerpt: input.excerpt,
    }),
  });
  const evidenceJson = await evidenceRes.json().catch(() => null);
  let activeExam: AssessmentReadyDetail | null = null;
  if (evidenceRes.ok) {
    const data = unwrapEnvelope<EvidenceResponse>(evidenceJson);
    if (data.activeExam?.paperId) {
      activeExam = data.activeExam;
      emitAssessmentReady(activeExam);
    }
  }

  if (input.forceDailyReview === false) {
    return { review: null, activeExam };
  }

  const res = await authFetch('/api/v3.5/zhi/daily-review/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const json = await res.json().catch(() => null);
  if (res.ok) {
    const data = unwrapEnvelope<{ review: DailyReviewDto | null }>(json);
    if (data.review) {
      emitWuxianEventUntyped(WUXIAN_EVENTS.dailyReview, data.review);
      emitDirectoryWorkspaceRefresh();
    }
    return { review: data.review ?? null, activeExam };
  }

  const fallback = await fetchDailyReview(userId, { force: true });
  return { review: fallback?.review ?? null, activeExam };
}
