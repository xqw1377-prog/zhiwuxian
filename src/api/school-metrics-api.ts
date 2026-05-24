/**
 * WUXIAN 3.0 · 逆向因果链大盘 API
 */

import { SchoolMetricsCompiler } from '../services/metrics-compiler';
import { WuxianMentorEngine } from '../services/mentor-engine';
import { DestinyExecutionEngine } from '../services/destiny-engine';
import {
  getSchoolMatrixView,
  getMentorPlanView,
  setActiveSchoolPhase,
  type SchoolMatrixView,
  type MentorPlanView,
} from '../db/school-matrix';

export function fetchSchoolMatrix(userId: string): SchoolMatrixView | null {
  return getSchoolMatrixView(userId);
}

export function fetchMentorPlan(userId: string): MentorPlanView | null {
  return getMentorPlanView(userId);
}

export async function compileSchoolMetrics(input: {
  userId: string;
  targetSchool: string;
  currentBaseline: Record<string, unknown>;
  daysToDeadline?: number;
}): Promise<SchoolMatrixView> {
  return SchoolMetricsCompiler.compileGoalAndPlan(input);
}

export async function consultMentorArchitect(input: {
  userId: string;
  targetSchool: string;
  currentBaseline: Record<string, unknown>;
  daysToDeadline?: number;
}): Promise<MentorPlanView> {
  return WuxianMentorEngine.consultAndArchitect(input);
}

export async function registerDestinyHardWork(input: {
  userId: string;
  hoursInvested?: number;
  solvedNodeCount?: number;
  resolvedConcept?: string;
}) {
  return DestinyExecutionEngine.registerHardWork(
    input.userId,
    Number(input.hoursInvested ?? 0),
    Number(input.solvedNodeCount ?? 0),
    { resolvedConcept: input.resolvedConcept },
  );
}

export function bindDesktopActivePhase(userId: string, phase?: string): { activePhase: string | null } {
  const mentor = getMentorPlanView(userId);
  if (mentor) {
    const next =
      phase?.trim() || mentor.dynamicMilestones[0]?.codeName || mentor.activePhase;
    if (next) setActiveSchoolPhase(userId, next);
    return { activePhase: next ?? null };
  }
  const view = getSchoolMatrixView(userId);
  if (!view) return { activePhase: null };
  const next = phase?.trim() || view.timelineMilestones[0]?.phase || view.activePhase;
  if (next) setActiveSchoolPhase(userId, next);
  return { activePhase: next ?? null };
}
