/**
 * ZHI · 错题银行服务
 * 错题录入 / 分类 / 复习 / 重做 / 趋势分析
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { todayStr } from '../../server/wuxian-core-db';

type MistakeEntry = {
  id: string;
  userId: string;
  subject: string;
  knowledgeNode: string | null;
  source: string;
  sourceId: string | null;
  questionText: string;
  userAnswer: string | null;
  correctAnswer: string | null;
  mistakeType: string;
  difficulty: string;
  masteryStatus: string;
  reviewCount: number;
  correctCount: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  tags: string[];
  createdAt: string;
};

export type MistakeBankDto = {
  items: MistakeEntry[];
  total: number;
  bySubject: Array<{ subject: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  needsReview: number;
  mastered: number;
};

export type MistakeRecordInput = {
  userId: string;
  subject: string;
  knowledgeNode?: string;
  source: string;
  sourceId?: string;
  questionText: string;
  userAnswer?: string;
  correctAnswer?: string;
  mistakeType?: string;
  difficulty?: string;
  tags?: string[];
};

export function recordMistake(input: MistakeRecordInput): { id: string } {
  const db = getLearningDb();
  const id = randomUUID().replace(/-/g, '').slice(0, 16);
  const now = new Date().toISOString();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO zhi_mistake_bank (id, user_id, subject, knowledge_node, source, source_id, question_text, user_answer, correct_answer, mistake_type, difficulty, mastery_status, next_review_at, tags_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_review', ?, ?, datetime('now'), datetime('now'))
  `).run(
    id, input.userId.trim(), input.subject, input.knowledgeNode ?? null,
    input.source, input.sourceId ?? null, input.questionText,
    input.userAnswer ?? null, input.correctAnswer ?? null,
    input.mistakeType ?? 'unknown', input.difficulty ?? 'medium',
    tomorrow, JSON.stringify(input.tags ?? []),
  );

  return { id };
}

export function recordMistakeBatch(inputs: MistakeRecordInput[]): { count: number } {
  for (const inp of inputs) recordMistake(inp);
  return { count: inputs.length };
}

export function getMistakeBank(
  userId: string,
  filters?: { subject?: string; status?: string; source?: string; limit?: number },
): MistakeBankDto {
  const uid = userId.trim();
  const db = getLearningDb();

  let where = 'WHERE user_id = ?';
  const params: unknown[] = [uid];

  if (filters?.subject) { where += ' AND subject = ?'; params.push(filters.subject); }
  if (filters?.status) { where += ' AND mastery_status = ?'; params.push(filters.status); }
  if (filters?.source) { where += ' AND source = ?'; params.push(filters.source); }

  const limit = Math.min(200, filters?.limit ?? 50);

  const items = db.prepare(
    `SELECT * FROM zhi_mistake_bank ${where} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, limit) as Array<Record<string, unknown>>;

  const allUser = db.prepare(
    `SELECT COUNT(*) as total FROM zhi_mistake_bank WHERE user_id = ?`
  ).get(uid) as { total: number };

  const bySubject = db.prepare(
    `SELECT subject, COUNT(*) as count FROM zhi_mistake_bank WHERE user_id = ? GROUP BY subject ORDER BY count DESC`
  ).all(uid) as Array<{ subject: string; count: number }>;

  const byType = db.prepare(
    `SELECT mistake_type as type, COUNT(*) as count FROM zhi_mistake_bank WHERE user_id = ? GROUP BY mistake_type ORDER BY count DESC`
  ).all(uid) as Array<{ type: string; count: number }>;

  const needsReview = (db.prepare(
    `SELECT COUNT(*) as count FROM zhi_mistake_bank WHERE user_id = ? AND mastery_status IN ('needs_review','needs_practice')`
  ).get(uid) as { count: number }).count;

  const mastered = (db.prepare(
    `SELECT COUNT(*) as count FROM zhi_mistake_bank WHERE user_id = ? AND mastery_status = 'mastered'`
  ).get(uid) as { count: number }).count;

  return {
    items: items.map(mapMistake),
    total: allUser.total,
    bySubject,
    byType,
    needsReview,
    mastered,
  };
}

export function getMistakesForRetry(userId: string, subject?: string, count = 10): MistakeEntry[] {
  const uid = userId.trim();
  const db = getLearningDb();
  const today = todayStr();

  let where = "user_id = ? AND mastery_status IN ('needs_review','needs_practice') AND (next_review_at IS NULL OR next_review_at <= ?)";
  const params: unknown[] = [uid, today];

  if (subject) { where += ' AND subject = ?'; params.push(subject); }

  const rows = db.prepare(
    `SELECT * FROM zhi_mistake_bank WHERE ${where} ORDER BY review_count ASC, created_at DESC LIMIT ?`
  ).all(...params, count) as Array<Record<string, unknown>>;

  return rows.map(mapMistake);
}

export function reviewMistake(
  userId: string,
  mistakeId: string,
  correct: boolean,
): { status: string; nextReviewAt: string } {
  const uid = userId.trim();
  const db = getLearningDb();

  const row = db.prepare(`SELECT * FROM zhi_mistake_bank WHERE id = ? AND user_id = ?`).get(mistakeId, uid) as Record<string, unknown> | undefined;
  if (!row) throw new Error('错题不存在');

  const reviewCount = (row.review_count as number) + 1;
  const correctCount = (row.correct_count as number) + (correct ? 1 : 0);

  let status = row.mastery_status as string;
  let days = 1;

  if (correctCount >= 3) {
    status = 'mastered';
    days = 30;
  } else if (correct) {
    status = 'needs_practice';
    days = reviewCount <= 2 ? 1 : reviewCount <= 4 ? 3 : 7;
  } else {
    status = 'needs_review';
    days = 1;
  }

  const nextReview = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  db.prepare(`
    UPDATE zhi_mistake_bank SET review_count = ?, correct_count = ?, mastery_status = ?, last_reviewed_at = datetime('now'), next_review_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(reviewCount, correctCount, status, nextReview, mistakeId);

  return { status, nextReviewAt: nextReview };
}

export function getMistakeTrend(userId: string): Array<{ date: string; newCount: number; reviewedCount: number }> {
  const db = getLearningDb();
  const trend: Array<{ date: string; newCount: number; reviewedCount: number }> = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const newCount = (db.prepare(
      `SELECT COUNT(*) as c FROM zhi_mistake_bank WHERE user_id = ? AND date(created_at) = ?`
    ).get(userId, d) as { c: number }).c;
    const reviewedCount = (db.prepare(
      `SELECT COUNT(*) as c FROM zhi_mistake_bank WHERE user_id = ? AND date(last_reviewed_at) = ?`
    ).get(userId, d) as { c: number }).c;
    trend.push({ date: d, newCount, reviewedCount });
  }

  return trend;
}

function mapMistake(row: Record<string, unknown>): MistakeEntry {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    subject: row.subject as string,
    knowledgeNode: row.knowledge_node as string | null,
    source: row.source as string,
    sourceId: row.source_id as string | null,
    questionText: row.question_text as string,
    userAnswer: row.user_answer as string | null,
    correctAnswer: row.correct_answer as string | null,
    mistakeType: row.mistake_type as string,
    difficulty: row.difficulty as string,
    masteryStatus: row.mastery_status as string,
    reviewCount: (row.review_count as number) ?? 0,
    correctCount: (row.correct_count as number) ?? 0,
    lastReviewedAt: row.last_reviewed_at as string | null,
    nextReviewAt: row.next_review_at as string | null,
    tags: JSON.parse((row.tags_json as string) ?? '[]'),
    createdAt: row.created_at as string,
  };
}
