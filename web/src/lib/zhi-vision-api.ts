import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';
import { fileToDataUrl } from './chat-upload';
import type { DailyReviewDto } from './zhi-daily-review-api';

export type VisionIntakeDto = {
  kind: string;
  subject: string;
  scoreOrProgress: string;
  topics: string[];
  weakPoints: string[];
  challenge: string;
  summary: string;
  baselineScores: Record<string, string>;
  chatText: string;
};

export type TextbookResolveDto = {
  catalogId: string;
  title: string;
  publisher: string;
  subject: string;
  edition: string;
  totalChapters: number;
  chapters: Array<{ index: number; title: string; knowledgePoints: string[] }>;
  progressChapter: number;
  progressPct: number;
  completedKnowledge: string[];
  upcomingKnowledge: string[];
  gapNote: string;
  baselineKey: string;
  baselineValue: string;
  chatText: string;
};

export async function analyzeVisionImage(
  userId: string,
  file: File,
  userHint?: string,
): Promise<VisionIntakeDto> {
  const dataUrl = await fileToDataUrl(file);
  const res = await authFetch('/api/v3.5/zhi/vision/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, screenshotData: dataUrl, userHint }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '影像解析失败');
  }
  return unwrapEnvelope<VisionIntakeDto>(json);
}

export async function resolveTextbook(
  userId: string,
  input: {
    title: string;
    publisher: string;
    subject?: string;
    progressChapter?: number;
    progressNote?: string;
  },
): Promise<TextbookResolveDto> {
  const res = await authFetch('/api/v3.5/zhi/vision/resolve-textbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...input }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '教材解析失败');
  }
  return unwrapEnvelope<TextbookResolveDto>(json);
}

export type VisionSolveDto = {
  problemText: string;
  subject: string;
  knowledgePoint: string;
  knowledgePointTags: string[];
  solution: string;
  answer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  chatText: string;
};

export async function solveVisionProblem(
  userId: string,
  file: File,
  userHint?: string,
): Promise<VisionSolveDto> {
  const dataUrl = await fileToDataUrl(file);
  const res = await authFetch('/api/v3.5/zhi/vision/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, screenshotData: dataUrl, userHint }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '解题失败');
  }
  return unwrapEnvelope<VisionSolveDto>(json);
}

export async function confirmVisionIntake(
  userId: string,
  input: {
    baselineScores?: Record<string, string>;
    weakSubjects?: string[];
    challenge?: string;
    textbookCatalogId?: string;
  },
): Promise<{
  baselineKeys: string[];
  dailyReviewReady: boolean;
  review: DailyReviewDto | null;
  directoryId?: string | null;
}> {
  const res = await authFetch('/api/v3.5/zhi/vision/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...input }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '建档确认失败');
  }
  return unwrapEnvelope(json);
}
