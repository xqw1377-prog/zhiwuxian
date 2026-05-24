import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type PushItem = {
  type: 'review_due' | 'plan_pending' | 'exam_retake' | 'streak_warning' | 'achievement_near' | 'chapter_stuck';
  title: string;
  body: string;
  priority: 'high' | 'medium' | 'low';
  action: { label: string; toolTab?: string } | null;
};

export type ProactivePushDto = {
  items: PushItem[];
  total: number;
  highPriority: number;
};

export async function fetchProactivePush(userId: string): Promise<ProactivePushDto> {
  const res = await authFetch(`/api/v3.5/zhi/proactive/push/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return { items: [], total: 0, highPriority: 0 };
  return unwrapEnvelope<ProactivePushDto>(json);
}
