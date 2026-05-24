import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';
import type { DailyReviewDto } from './zhi-daily-review-api';

export type LanguageCurvePoint = {
  date: string;
  score: number | null;
  sessions: number;
  shadowPasses: number;
};

export type LanguageTutorProgressDto = {
  curve7d: LanguageCurvePoint[];
  speakingEst: number;
  levelBand: string;
  streakDays: number;
  weekDelta: number | null;
  focusSkill: string;
  lastDrill: string | null;
  totalSessions: number;
  todayCoachLine: string;
};

export type LanguageMissionDto = {
  examTrack: 'TOEFL' | 'IELTS';
  intakeType: 'SPEAKING' | 'WRITING';
  taskPrompt: string;
  targetToefl: number;
  currentToefl: number;
  gapToefl: number;
  headline: string;
  zhiBrief: string;
  source: string;
  levelBand: string;
  speakingEst: number;
  focusSkill: string;
  weakTags: string[];
  tutorIntro: string;
  prepGuide: string;
  prepSeconds: number;
  speakSeconds: number;
  microDrill: string;
  sessionGoal: string;
  writingTaskPrompt: string;
  writingPrepGuide: string;
};

export type LanguageEvalDto = {
  success: boolean;
  msg?: string;
  estimatedScore: string;
  ieltsEquivalent: string;
  fatalFlaws: string[];
  whatWorked?: string[];
  priorityFix?: string;
  microDrill?: string;
  focusSkill?: string;
  weakTags?: string[];
  zhiChallenge: string;
  zhiReckoning: string;
  scoreNumeric?: number | null;
  currentToefl?: number;
  toeflTarget?: number;
  gapToefl?: number;
  progressPct?: number;
  levelBand?: string;
  speakingEst?: number;
  streakDays?: number;
};

export async function fetchLanguageMission(userId: string): Promise<{
  mission: LanguageMissionDto;
  progress: LanguageTutorProgressDto;
  recent: Array<{ estimatedScore: string; scoreNumeric: number | null; passedShadow: boolean }>;
} | null> {
  const res = await authFetch(`/api/v3.5/zhi/language/mission/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope(json);
}

export async function submitLanguageEval(
  userId: string,
  input: {
    type: 'SPEAKING' | 'WRITING';
    examTrack: 'TOEFL' | 'IELTS';
    taskPrompt: string;
    userContent: string;
  },
): Promise<LanguageEvalDto> {
  const res = await authFetch('/api/v3.5/zhi/language-eval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...input }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '语言陪练失败');
  }
  return unwrapEnvelope<LanguageEvalDto>(json);
}

export async function submitLanguageShadow(
  userId: string,
  input: { type: 'SPEAKING' | 'WRITING'; attempt: string; zhiChallenge: string },
): Promise<{ passed: boolean; zhiReckoning: string; review?: DailyReviewDto | null }> {
  const res = await authFetch('/api/v3.5/zhi/language-shadow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...input }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error('影子验证失败');
  return unwrapEnvelope(json);
}
