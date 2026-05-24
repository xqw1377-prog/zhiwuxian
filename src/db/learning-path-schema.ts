/**
 * ZHI · 梦校学习路径（阶段 × 时间点 × 知识点 × 验收）
 */

import { getLearningDb } from '../../server/wuxian-learning-db';

export type PathUnitStatus = 'locked' | 'in_progress' | 'mastered' | 'failed' | 'assessment_due';

export type PathKnowledgeUnit = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  masteryTargetPct: number;
  currentPct: number;
  dueDate: string;
  status: PathUnitStatus;
  source: 'textbook' | 'assessment' | 'gap' | 'syllabus';
  requiresAssessment: boolean;
};

export type PathPhase = {
  id: string;
  phase: string;
  deadline: string;
  goalSummary: string;
  exitCriteria: string;
  knowledgeUnits: PathKnowledgeUnit[];
  milestoneStatus: 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED';
};

export type PathTodayFocus = {
  subjectId: string;
  title: string;
  dueDate: string;
  reason: string;
};

export type PathCriticalDate = {
  date: string;
  label: string;
  phaseCode?: string;
};

export type PathWeeklyCheckpoint = {
  weekStart: string;
  deliverable: string;
};

export type PathWeaknessLedgerItem = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  severity: number;
  sources: string[];
  evidence: string;
  actionDue?: string;
};

export type PathPushAction = {
  id: string;
  label: string;
  reason: string;
  subjectId?: string;
  kind: string;
};

export type LearningPathDocument = {
  version: number;
  targetSchool: string;
  targetApplyAt: string;
  pathway: string;
  pathwayLabel: string;
  daysRemaining: number;
  challengeIndex: number;
  phases: PathPhase[];
  activePhaseId: string | null;
  nextAssessmentDue: string | null;
  summaryLine: string;
  updatedAt: number;
  /** v3+ */
  masteryPct?: number;
  todayFocus?: PathTodayFocus | null;
  criticalDates?: PathCriticalDate[];
  weeklyCheckpoints?: PathWeeklyCheckpoint[];
  provinceOrRegion?: string | null;
  gradeBand?: string;
  curriculumTrack?: string;
  /** v4 · 短板驱动 */
  weaknessLedger?: PathWeaknessLedgerItem[];
  pushHeadline?: string;
  pushActions?: PathPushAction[];
  dataCompletenessPct?: number;
  missingSignals?: string[];
};

export function initializeLearningPathSchema(): void {
  getLearningDb().exec(`
    CREATE TABLE IF NOT EXISTS zhi_learning_path (
      user_id TEXT PRIMARY KEY,
      path_json TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
}

export function getLearningPathDocument(userId: string): LearningPathDocument | null {
  initializeLearningPathSchema();
  const row = getLearningDb()
    .prepare(`SELECT path_json FROM zhi_learning_path WHERE user_id = ?`)
    .get(userId.trim()) as { path_json: string } | undefined;
  if (!row?.path_json?.trim()) return null;
  try {
    return JSON.parse(row.path_json) as LearningPathDocument;
  } catch {
    return null;
  }
}

export function upsertLearningPathDocument(userId: string, doc: LearningPathDocument): void {
  initializeLearningPathSchema();
  const uid = userId.trim();
  doc.updatedAt = Math.floor(Date.now() / 1000);
  getLearningDb()
    .prepare(
      `INSERT INTO zhi_learning_path (user_id, path_json, version, updated_at)
       VALUES (?, ?, ?, strftime('%s', 'now'))
       ON CONFLICT(user_id) DO UPDATE SET
         path_json = excluded.path_json,
         version = excluded.version,
         updated_at = excluded.updated_at`,
    )
    .run(uid, JSON.stringify(doc), doc.version);
}
