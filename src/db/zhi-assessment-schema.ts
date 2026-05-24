/**
 * ZHI · 学习评估（分科试卷 / 每日知识点）
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';

export type AssessmentPaperType =
  | 'subject_unit'
  | 'daily_kp'
  | 'mock_section'
  | 'adaptive_chat'
  | 'adaptive_exam'
  | 'chat_active'
  | 'post_learning_active';

export type AssessmentPaperStatus = 'ready' | 'in_progress' | 'submitted' | 'reckoned';

export type AssessmentQuestionType =
  | 'choice'
  | 'short'
  | 'speaking_hint'
  | 'fill_blank'
  | 'active_qa';

/** 主动式：ZHI 发问验收；被动式：学生自述（尽量少用） */
export type AssessmentMode = 'active' | 'passive';

export type AssessmentQuestion = {
  id: string;
  prompt: string;
  type: AssessmentQuestionType;
  options?: string[];
  knowledgePoint?: string;
  /** active_qa：学生答完后 ZHI 可追问的一句（展示用） */
  coachFollowUp?: string;
};

export type AssessmentPaperPayload = {
  mode: AssessmentMode;
  source?: string;
  learningContext?: string;
  activeIntro?: string;
  questions: AssessmentQuestion[];
};

export type AssessmentPaperRow = {
  id: string;
  user_id: string;
  subject_id: string;
  subject_name: string;
  paper_type: string;
  exam_align: string | null;
  title: string;
  questions_json: string;
  status: string;
  score_summary: string | null;
  efficiency_label: string | null;
  created_at: number;
  submitted_at: number | null;
};

export type AssessmentAttemptRow = {
  id: string;
  paper_id: string;
  user_id: string;
  answers_json: string;
  score_pct: number | null;
  mastery_score: number | null;
  eval_json: string | null;
  created_at: number;
};

export function initializeZhiAssessmentSchema(): void {
  getLearningDb().exec(`
    CREATE TABLE IF NOT EXISTS zhi_assessment_papers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      paper_type TEXT NOT NULL DEFAULT 'subject_unit',
      exam_align TEXT,
      title TEXT NOT NULL,
      questions_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'ready',
      score_summary TEXT,
      efficiency_label TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      submitted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_assessment_papers_user ON zhi_assessment_papers(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS zhi_assessment_attempts (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '{}',
      score_pct REAL,
      mastery_score REAL,
      eval_json TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_assessment_attempts_user ON zhi_assessment_attempts(user_id, created_at DESC);
  `);
}

export function serializePaperPayload(payload: AssessmentPaperPayload, limit = 8): string {
  return JSON.stringify({
    mode: payload.mode,
    source: payload.source ?? '',
    learningContext: payload.learningContext?.slice(0, 800) ?? '',
    activeIntro: payload.activeIntro?.slice(0, 300) ?? '',
    questions: payload.questions.slice(0, Math.max(1, Math.min(80, Math.floor(limit)))),
  });
}

export function parsePaperPayload(row: AssessmentPaperRow): AssessmentPaperPayload {
  try {
    const raw = JSON.parse(row.questions_json) as unknown;
    if (Array.isArray(raw)) {
      return { mode: 'passive', questions: raw as AssessmentQuestion[] };
    }
    const obj = raw as AssessmentPaperPayload;
    if (obj && Array.isArray(obj.questions)) {
      return {
        mode: obj.mode === 'active' ? 'active' : 'passive',
        source: obj.source,
        learningContext: obj.learningContext,
        activeIntro: obj.activeIntro,
        questions: obj.questions,
      };
    }
  } catch {
    /* fall through */
  }
  return { mode: 'passive', questions: [] };
}

export function saveAssessmentPaper(input: {
  userId: string;
  subjectId: string;
  subjectName: string;
  paperType: AssessmentPaperType;
  examAlign?: string;
  title: string;
  questions: AssessmentQuestion[];
  mode?: AssessmentMode;
  source?: string;
  learningContext?: string;
  activeIntro?: string;
}): AssessmentPaperRow {
  initializeZhiAssessmentSchema();
  const id = randomUUID();
  getLearningDb()
    .prepare(
      `INSERT INTO zhi_assessment_papers
        (id, user_id, subject_id, subject_name, paper_type, exam_align, title, questions_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready')`,
    )
    .run(
      id,
      input.userId.trim(),
      input.subjectId,
      input.subjectName,
      input.paperType,
      input.examAlign ?? null,
      input.title.slice(0, 200),
      serializePaperPayload(
        {
          mode: input.mode ?? 'passive',
          source: input.source,
          learningContext: input.learningContext,
          activeIntro: input.activeIntro,
          questions: input.questions,
        },
        input.paperType === 'adaptive_exam' ? 30 : 8,
      ),
    );
  return getAssessmentPaper(id)!;
}

export function getAssessmentPaper(id: string): AssessmentPaperRow | null {
  initializeZhiAssessmentSchema();
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_assessment_papers WHERE id = ?`)
    .get(id) as AssessmentPaperRow | undefined;
  return row ?? null;
}

export function listAssessmentPapers(userId: string, limit = 12): AssessmentPaperRow[] {
  initializeZhiAssessmentSchema();
  return getLearningDb()
    .prepare(
      `SELECT * FROM zhi_assessment_papers WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId.trim(), limit) as AssessmentPaperRow[];
}

export function updateAssessmentPaperResult(
  id: string,
  input: { status: AssessmentPaperStatus; scoreSummary: string; efficiencyLabel: string },
): void {
  initializeZhiAssessmentSchema();
  getLearningDb()
    .prepare(
      `UPDATE zhi_assessment_papers
       SET status = ?, score_summary = ?, efficiency_label = ?, submitted_at = strftime('%s', 'now')
       WHERE id = ?`,
    )
    .run(input.status, input.scoreSummary.slice(0, 120), input.efficiencyLabel.slice(0, 80), id);
}

export function saveAssessmentAttempt(input: {
  paperId: string;
  userId: string;
  answers: Record<string, string>;
  scorePct: number;
  masteryScore: number;
  evalBody: Record<string, unknown>;
}): AssessmentAttemptRow {
  initializeZhiAssessmentSchema();
  const id = randomUUID();
  getLearningDb()
    .prepare(
      `INSERT INTO zhi_assessment_attempts
        (id, paper_id, user_id, answers_json, score_pct, mastery_score, eval_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.paperId,
      input.userId.trim(),
      JSON.stringify(input.answers),
      input.scorePct,
      input.masteryScore,
      JSON.stringify(input.evalBody),
    );
  return getLearningDb()
    .prepare(`SELECT * FROM zhi_assessment_attempts WHERE id = ?`)
    .get(id) as AssessmentAttemptRow;
}

export function parsePaperQuestions(row: AssessmentPaperRow): AssessmentQuestion[] {
  return parsePaperPayload(row).questions;
}

export function countPendingActivePapers(userId: string): number {
  initializeZhiAssessmentSchema();
  const row = getLearningDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM zhi_assessment_papers
       WHERE user_id = ? AND status = 'ready'
         AND paper_type IN ('post_learning_active', 'chat_active')`,
    )
    .get(userId.trim()) as { c: number };
  return Number(row?.c ?? 0);
}
