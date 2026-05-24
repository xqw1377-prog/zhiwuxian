import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type AssessmentSubjectDto = {
  id: string;
  name: string;
  progressPct: number;
  lastScore: string | null;
  efficiency: 'high' | 'mid' | 'low' | 'unknown';
};

export type AssessmentQuestionDto = {
  id: string;
  prompt: string;
  type: 'choice' | 'short' | 'speaking_hint' | 'fill_blank' | 'active_qa';
  options?: string[];
  knowledgePoint?: string;
  coachFollowUp?: string;
};

export type AssessmentPaperDto = {
  id: string;
  subjectId: string;
  subjectName: string;
  paperType: string;
  examAlign: string | null;
  title: string;
  questions: AssessmentQuestionDto[];
  status: string;
  assessmentMode?: 'active' | 'passive';
  activeIntro?: string;
  source?: string;
};

export type AssessmentHubDto = {
  subjects: AssessmentSubjectDto[];
  pendingActiveExams?: number;
  pendingExamPaperId?: string | null;
  recentPapers: Array<{
    id: string;
    title: string;
    subjectName: string;
    paperType: string;
    scoreSummary: string | null;
    efficiencyLabel: string | null;
    at: number;
  }>;
  dailyKpDone: number;
  dailyKpTotal: number;
  coachLine: string;
};

export type AssessmentEvalDto = {
  paperId: string;
  scorePct: number;
  masteryScore: number;
  efficiency: 'high' | 'mid' | 'low';
  efficiencyLabel: string;
  strengths: string[];
  gaps: string[];
  coachFeedback: string;
  nextAction: string;
  baselineKey: string;
  learningPathSummary?: string;
};

export async function fetchAssessmentHub(userId: string): Promise<AssessmentHubDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/assessment/hub/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<AssessmentHubDto>(json);
}

export async function fetchAssessmentPaperById(
  userId: string,
  paperId: string,
): Promise<AssessmentPaperDto | null> {
  const res = await authFetch(
    `/api/v3.5/zhi/assessment/paper/${encodeURIComponent(paperId)}?userId=${encodeURIComponent(userId)}`,
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<AssessmentPaperDto>(json);
}

export async function generateAssessmentPaper(
  userId: string,
  input: { subjectId?: string; daily?: boolean; adaptive?: boolean; userHint?: string },
): Promise<AssessmentPaperDto> {
  const res = await authFetch('/api/v3.5/zhi/assessment/paper/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      subjectId: input.subjectId,
      daily: input.daily,
      adaptive: input.adaptive,
      userHint: input.userHint,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '出卷失败');
  }
  return unwrapEnvelope<AssessmentPaperDto>(json);
}

export async function submitAssessmentPaperApi(input: {
  userId: string;
  paperId: string;
  answers: Record<string, string>;
}): Promise<AssessmentEvalDto> {
  const res = await authFetch('/api/v3.5/zhi/assessment/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '提交失败');
  }
  return unwrapEnvelope<AssessmentEvalDto>(json);
}
