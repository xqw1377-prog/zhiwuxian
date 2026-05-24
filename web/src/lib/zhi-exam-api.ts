import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type ExamQuestionDto = {
  id: string;
  examId: string;
  questionIndex: number;
  questionText: string;
  options: string[];
  correctAnswer: string;
  sourceType: string | null;
  sourceId: string | null;
  userAnswer: string | null;
  isCorrect: boolean;
  isAnswered: boolean;
};

export type ExamDto = {
  id: string;
  userId: string;
  title: string;
  subject: string | null;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  scorePct: number;
  status: string;
  sourceSummary: string;
  weakAreas: string[];
  recommendations: string | null;
  timeLimitMinutes: number;
  generatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type ExamDetailDto = ExamDto & {
  questions: ExamQuestionDto[];
};

export type ExamHistoryDto = {
  items: ExamDto[];
  totalExams: number;
  avgScore: number;
  bySubject: Array<{ subject: string; count: number; avgScore: number }>;
};

export type ExamProgressDto = {
  examId: string;
  answeredCount: number;
  totalCount: number;
  timeLimitMinutes: number;
  startedAt: string | null;
  timeElapsedSeconds: number;
  timeRemainingSeconds: number | null;
};

export type PaginatedQuestionsDto = {
  questions: ExamQuestionDto[];
  page: number;
  totalPages: number;
  total: number;
};

export async function generateExam(
  userId: string,
  subject?: string,
  count?: number,
): Promise<ExamDetailDto> {
  const res = await authFetch('/api/v3.5/zhi/exam/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, subject, count }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '生成试卷失败');
  return unwrapEnvelope<ExamDetailDto>(json);
}

export async function generateLargeExam(
  userId: string,
  subject?: string,
  count?: number,
): Promise<ExamDetailDto> {
  const res = await authFetch('/api/v3.5/zhi/exam/generate-large', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, subject, count }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '生成大规模模考失败');
  return unwrapEnvelope<ExamDetailDto>(json);
}

export async function fetchExamQuestionsPaginated(
  examId: string,
  page: number,
  pageSize?: number,
): Promise<PaginatedQuestionsDto> {
  const params = new URLSearchParams({ page: String(page) });
  if (pageSize) params.set('pageSize', String(pageSize));
  const res = await authFetch(`/api/v3.5/zhi/exam/${encodeURIComponent(examId)}/questions?${params}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return { questions: [], page: 1, totalPages: 1, total: 0 };
  return unwrapEnvelope<PaginatedQuestionsDto>(json);
}

export async function fetchExamProgress(examId: string): Promise<ExamProgressDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/exam/${encodeURIComponent(examId)}/progress`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<ExamProgressDto>(json);
}

export async function fetchExamDetail(examId: string): Promise<ExamDetailDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/exam/${encodeURIComponent(examId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<ExamDetailDto>(json);
}

export async function startExam(examId: string): Promise<void> {
  await authFetch(`/api/v3.5/zhi/exam/${encodeURIComponent(examId)}/start`, { method: 'POST' });
}

export async function answerExamQuestion(
  examId: string,
  questionId: string,
  answer: string,
): Promise<void> {
  const res = await authFetch(`/api/v3.5/zhi/exam/${encodeURIComponent(examId)}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, answer }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error((json as any)?.message ?? '提交答案失败');
  }
}

export async function answerQuestionBatch(
  examId: string,
  answers: Array<{ questionId: string; answer: string }>,
): Promise<{ submitted: number }> {
  const res = await authFetch(`/api/v3.5/zhi/exam/${encodeURIComponent(examId)}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { submitted: 0 };
  return unwrapEnvelope<{ submitted: number }>(json);
}

export async function gradeExam(examId: string): Promise<ExamDetailDto> {
  const res = await authFetch(`/api/v3.5/zhi/exam/${encodeURIComponent(examId)}/grade`, { method: 'POST' });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.message ?? '批改失败');
  return unwrapEnvelope<ExamDetailDto>(json);
}

export async function fetchExamHistory(
  userId: string,
  subject?: string,
  limit?: number,
): Promise<ExamHistoryDto> {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const res = await authFetch(`/api/v3.5/zhi/exam/history/${encodeURIComponent(userId)}${qs ? `?${qs}` : ''}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return { items: [], totalExams: 0, avgScore: 0, bySubject: [] };
  return unwrapEnvelope<ExamHistoryDto>(json);
}
