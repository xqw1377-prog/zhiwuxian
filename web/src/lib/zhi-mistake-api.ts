import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type MistakeEntryDto = {
  id: string;
  userId: string;
  subject: string;
  knowledgeNode: string | null;
  source: string;
  sourceId: string | null;
  questionText: string;
  userAnswer: string | null;
  correctAnswer: string | null;
  mistakeType: string;
  difficulty: string;
  masteryStatus: string;
  reviewCount: number;
  correctCount: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  tags: string[];
  createdAt: string;
};

export type MistakeBankDto = {
  items: MistakeEntryDto[];
  total: number;
  bySubject: Array<{ subject: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  needsReview: number;
  mastered: number;
};

export type MistakeTrendDto = Array<{
  date: string;
  newCount: number;
  reviewedCount: number;
}>;

export async function recordMistake(input: {
  userId: string;
  subject: string;
  questionText: string;
  userAnswer?: string;
  correctAnswer?: string;
  mistakeType?: string;
  knowledgeNode?: string;
  source?: string;
}): Promise<{ id: string }> {
  const res = await authFetch('/api/v3.5/zhi/mistake/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '记录错题失败');
  return unwrapEnvelope<{ id: string }>(json);
}

export async function recordMistakeBatch(items: Array<{
  userId: string;
  subject: string;
  questionText: string;
  userAnswer?: string;
  correctAnswer?: string;
  mistakeType?: string;
  knowledgeNode?: string;
  source?: string;
}>): Promise<{ count: number }> {
  const res = await authFetch('/api/v3.5/zhi/mistake/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '批量导入错题失败');
  return unwrapEnvelope<{ count: number }>(json);
}

export async function fetchMistakeBank(
  userId: string,
  filters?: { subject?: string; limit?: number },
): Promise<MistakeBankDto> {
  const params = new URLSearchParams();
  if (filters?.subject) params.set('subject', filters.subject);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const res = await authFetch(`/api/v3.5/zhi/mistake/bank/${encodeURIComponent(userId)}${qs ? `?${qs}` : ''}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '获取错题本失败');
  return unwrapEnvelope<MistakeBankDto>(json);
}

export async function fetchMistakesForRetry(
  userId: string,
  subject?: string,
  count?: number,
): Promise<MistakeEntryDto[]> {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (count) params.set('limit', String(count));
  const qs = params.toString();
  const res = await authFetch(`/api/v3.5/zhi/mistake/retry/${encodeURIComponent(userId)}${qs ? `?${qs}` : ''}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '获取待复习错题失败');
  return unwrapEnvelope<MistakeEntryDto[]>(json);
}

export async function reviewMistake(
  userId: string,
  mistakeId: string,
  correct: boolean,
): Promise<{ status: string; nextReviewAt: string }> {
  const res = await authFetch('/api/v3.5/zhi/mistake/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, mistakeId, correct }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '复习错题失败');
  return unwrapEnvelope<{ status: string; nextReviewAt: string }>(json);
}

export async function fetchMistakeTrend(userId: string): Promise<MistakeTrendDto> {
  const res = await authFetch(`/api/v3.5/zhi/mistake/trend/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '获取错题趋势失败');
  return unwrapEnvelope<MistakeTrendDto>(json);
}
