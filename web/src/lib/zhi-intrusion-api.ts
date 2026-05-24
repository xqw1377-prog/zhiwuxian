import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type ZhiIntrusionDto = {
  zhiOpening?: string;
  zhiTip?: string;
  zhiCoachNote?: string;
  activatedTool?: 'METRICS_INPUT' | 'VISION_INTERCEPT' | 'NONE' | string;
  challengeIndex?: number;
  targetSchool?: string;
  warpPointsRemaining?: number;
  warpDeducted?: number;
  /** Omni / Electron 兼容字段 */
  success?: boolean;
  shouldTrigger?: boolean;
  mentorText?: string;
  activeTool?: 'NONE' | 'VISION_INTERCEPT' | 'METRICS_INPUT' | 'PATH_RECONFIG' | string;
  remainingWarp?: number;
  chargedWarp?: number;
  stage?: string;
};

export function zhiIntrusionMentorText(d: ZhiIntrusionDto): string {
  if (d.mentorText?.trim()) return d.mentorText.trim();
  return [d.zhiOpening, d.zhiTip, d.zhiCoachNote].filter(Boolean).join('\n\n').trim();
}

export async function postZhiIntrusion(input: {
  userId: string;
  userFeedback?: string;
  force?: boolean;
  focusDirectoryId?: string | null;
}): Promise<ZhiIntrusionDto> {
  const res = await authFetch('/api/v3.5/zhi/intrusion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      userFeedback: input.userFeedback ?? '',
      userText: input.userFeedback ?? '',
      force: Boolean(input.force),
      focusDirectoryId: input.focusDirectoryId ?? undefined,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { error?: string; message?: string };
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return unwrapEnvelope<ZhiIntrusionDto>(json);
}
