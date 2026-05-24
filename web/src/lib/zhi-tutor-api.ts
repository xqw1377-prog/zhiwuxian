import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type LessonDto = {
  id: string;
  knowledgePoint: string;
  subject: string;
  prerequisiteCheck: string;
  coreTeaching: string;
  analogy: string;
  commonMistakes: string;
  checkpointQuestion: string;
  checkpointOptions: string[];
  checkpointAnswer: string;
  estimatedMinutes: number;
  sourceType: string;
  sourceId: string;
  checkpointPassed: number;
  createdAt: string;
};

export async function teachKnowledgePoint(input: {
  userId: string;
  knowledgePoint: string;
  subject?: string;
  context?: string;
  sourceType?: string;
  sourceId?: string;
}): Promise<LessonDto> {
  const res = await authFetch('/api/v3.5/zhi/tutor/teach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '讲授失败');
  return unwrapEnvelope<LessonDto>(json);
}

export async function fetchLesson(userId: string, lessonId: string): Promise<LessonDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/tutor/lesson/${encodeURIComponent(userId)}/${encodeURIComponent(lessonId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<LessonDto>(json);
}

export async function fetchLessonHistory(
  userId: string,
  subject?: string,
  limit?: number,
): Promise<LessonDto[]> {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const res = await authFetch(`/api/v3.5/zhi/tutor/history/${encodeURIComponent(userId)}${qs ? `?${qs}` : ''}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return [];
  const d = unwrapEnvelope<{ items: LessonDto[] }>(json);
  return d?.items ?? [];
}

export type ChapterLessonDto = {
  id: string;
  catalogId: string;
  chapterIndex: number;
  chapterTitle: string;
  knowledgePoints: string[];
  teaching: string;
  examples: string;
  summary: string;
  checkpointQuestion: string;
  checkpointOptions: string[];
  checkpointAnswer: string;
  estimatedMinutes: number;
  createdAt: string;
};

export type TextbookProgressDto = {
  catalogId: string;
  title: string;
  totalChapters: number;
  chapters: Array<{
    index: number;
    title: string;
    knowledgePoints: string[];
    status: string;
    checkpointPassed: boolean;
    lessonId: string | null;
  }>;
};

export async function teachChapter(
  userId: string,
  catalogId: string,
  chapterIndex: number,
): Promise<ChapterLessonDto> {
  const res = await authFetch('/api/v3.5/zhi/tutor/chapter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, catalogId, chapterIndex }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '章节讲授失败');
  return unwrapEnvelope<ChapterLessonDto>(json);
}

export async function completeChapterCheckpoint(
  userId: string,
  catalogId: string,
  chapterIndex: number,
  passed: boolean,
): Promise<void> {
  await authFetch('/api/v3.5/zhi/tutor/chapter/checkpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, catalogId, chapterIndex, passed }),
  });
}

export async function fetchTextbookProgress(
  userId: string,
  catalogId: string,
): Promise<TextbookProgressDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/tutor/textbook-progress/${encodeURIComponent(userId)}/${encodeURIComponent(catalogId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<TextbookProgressDto>(json);
}

export type CheckpointResult = {
  passed: boolean;
  correctAnswer: string;
  sourceType: string;
  sourceId: string;
};

export async function submitLessonCheckpoint(
  userId: string,
  lessonId: string,
  answer: string,
): Promise<CheckpointResult> {
  const res = await authFetch(`/api/v3.5/zhi/tutor/lesson/${encodeURIComponent(lessonId)}/checkpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, answer }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '提交验收失败');
  return unwrapEnvelope<CheckpointResult>(json);
}
