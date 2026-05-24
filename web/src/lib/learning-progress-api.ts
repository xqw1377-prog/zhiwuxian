import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';
import type { SchoolPathway } from './school-pathway';

export type SubjectTrackDto = {
  id: string;
  name: string;
  current: number;
  target: number;
  unit: string;
  displayCurrent: string;
  displayTarget: string;
  progressPct: number;
  deltaPct: number;
  trend: 'up' | 'down' | 'flat';
  chaptersDone?: number;
  chaptersTotal?: number;
};

export type TextbookTrackDto = {
  catalogId: string;
  directoryId: string;
  title: string;
  publisher: string;
  subject: string;
  progressChapter: number;
  totalChapters: number;
  progressPct: number;
  currentChapterTitle: string;
  knowledgePoints: string[];
  gapNote: string;
};

export type DreamMomentumDto = {
  languageCurve7d: Array<{
    date: string;
    score: number | null;
    sessions: number;
    shadowPasses: number;
  }>;
  videoCurve7d: Array<{ date: string; checkpoints: number; avgMastery: number | null; passed: number }>;
  weekLanguageSessions: number;
  weekVideoCheckpoints: number;
  speakingWeekDelta: number | null;
  momentumHint: string;
};

export type LearningProgressDashboardDto = {
  pathway: SchoolPathway;
  pathwayLabel: string;
  dream: {
    certaintyPct: number;
    challengeIndex: number;
    daysRemaining: number;
    milestonePct: number;
    delta7d: number;
    targetSchool: string;
    targetApplyAt: string;
    activePhase: string | null;
  };
  momentum: DreamMomentumDto;
  subjects: SubjectTrackDto[];
  textbooks: TextbookTrackDto[];
  directories: Array<{
    directoryId: string;
    title: string;
    currentPct: number;
    targetPct: number;
    type: string;
  }>;
  abilities: Array<{ id: string; label: string; value: number; delta: number }>;
  outcomes: Array<{ id: string; title: string; source: string; at: number; tag?: string }>;
  updatedAt: number;
};

export async function fetchLearningProgressDashboard(
  userId: string,
): Promise<LearningProgressDashboardDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/progress-dashboard/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<LearningProgressDashboardDto>(json);
}
