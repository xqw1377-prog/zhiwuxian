import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';
import type { AnchorBriefDto } from '../components/chat/ZhiAnchorCountdown';
import type { SchoolPathway } from './school-pathway';

export async function fetchAnchorBrief(userId: string): Promise<AnchorBriefDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/anchor-brief/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  const data = unwrapEnvelope<{
    ready: boolean;
    daysRemaining?: number;
    challengeIndex?: number;
    requiredMetrics?: Record<string, unknown>;
    dynamicMilestones?: AnchorBriefDto['dynamicMilestones'];
    pathway?: SchoolPathway;
    pathwayLabel?: string;
  }>(json);
  if (!data.ready) return null;
  return {
    daysRemaining: data.daysRemaining ?? 0,
    challengeIndex: data.challengeIndex ?? 0,
    requiredMetrics: data.requiredMetrics ?? {},
    dynamicMilestones: data.dynamicMilestones ?? [],
    pathway: data.pathway,
    pathwayLabel: data.pathwayLabel,
  };
}
