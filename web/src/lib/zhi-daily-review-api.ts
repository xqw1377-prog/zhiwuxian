import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type DailyReviewDto = {
  reviewDate: string;
  dreamPct: number;
  dreamDelta: number;
  subjectDeltas: Array<{ id: string; name: string; deltaPct: number; progressPct: number }>;
  retrospective: string[];
  planCorrections: Array<{
    subjectId: string;
    subjectName: string;
    action: string;
    priority: 'P0' | 'P1';
    dueBy: string;
  }>;
  revisedMission: string;
  chatText: string;
  headline: string;
  applied: boolean;
};

export async function fetchDailyReview(
  userId: string,
  opts?: { force?: boolean },
): Promise<{ ready: boolean; review: DailyReviewDto | null } | null> {
  const q = opts?.force ? '?force=1' : '';
  const res = await authFetch(
    `/api/v3.5/zhi/daily-review/${encodeURIComponent(userId)}${q}`,
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<{ ready: boolean; review: DailyReviewDto | null }>(json);
}
