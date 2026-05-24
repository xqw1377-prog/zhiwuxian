import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type PathKnowledgeUnitDto = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  masteryTargetPct: number;
  currentPct: number;
  dueDate: string;
  status: 'locked' | 'in_progress' | 'mastered' | 'failed' | 'assessment_due';
  source: string;
  requiresAssessment: boolean;
};

export type PathPhaseDto = {
  id: string;
  phase: string;
  deadline: string;
  goalSummary: string;
  exitCriteria: string;
  knowledgeUnits: PathKnowledgeUnitDto[];
  milestoneStatus: 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED';
};

export type PathTodayFocusDto = {
  subjectId: string;
  title: string;
  dueDate: string;
  reason: string;
};

export type LearningPathDto = {
  version: number;
  targetSchool: string;
  targetApplyAt: string;
  pathway: string;
  pathwayLabel: string;
  daysRemaining: number;
  challengeIndex: number;
  phases: PathPhaseDto[];
  activePhaseId: string | null;
  nextAssessmentDue: string | null;
  summaryLine: string;
  updatedAt: number;
  masteryPct?: number;
  todayFocus?: PathTodayFocusDto | null;
  criticalDates?: Array<{ date: string; label: string; phaseCode?: string }>;
  weeklyCheckpoints?: Array<{ weekStart: string; deliverable: string }>;
  error?: string;
  weaknessLedger?: Array<{
    id: string;
    title: string;
    subjectId: string;
    subjectName: string;
    severity: number;
    sources: string[];
    evidence: string;
    actionDue?: string;
  }>;
  pushHeadline?: string;
  pushActions?: Array<{
    id: string;
    label: string;
    reason: string;
    subjectId?: string;
    kind: string;
  }>;
  dataCompletenessPct?: number;
  missingSignals?: string[];
};

export async function fetchLearningPath(userId: string): Promise<LearningPathDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/learning-path/${encodeURIComponent(userId)}`);
  if (!res.ok) return null;
  const json = await res.json();
  const data = unwrapEnvelope<LearningPathDto>(json);
  if (data.error || !data.phases?.length) return null;
  return data;
}

export async function rebuildLearningPath(userId: string): Promise<LearningPathDto> {
  const res = await authFetch('/api/v3.5/zhi/learning-path/rebuild', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const json = await res.json();
  return unwrapEnvelope<LearningPathDto>(json);
}
