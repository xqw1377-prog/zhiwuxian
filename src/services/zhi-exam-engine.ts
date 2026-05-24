/**
 * ZHI · 模考引擎
 * 自动组卷：错题 + 知识缺口 → LLM 分批生成 → 分页作答 → 批改 → 弱项分析
 */

import { getLearningDb } from '../../server/wuxian-learning-db';
import { resolveUserLlm } from './deepseek-client';
import { gatewayJsonCompletion } from './llm-gateway';
import { WARP_COST } from './billing-hub';

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

function examRow(row: Record<string, unknown>): ExamDto {
  let weakAreas: string[] = [];
  try { weakAreas = JSON.parse(String(row.weak_areas_json ?? '[]')); } catch { weakAreas = []; }
  return {
    id: String(row.id ?? ''),
    userId: String(row.user_id ?? ''),
    title: String(row.title ?? ''),
    subject: row.subject ? String(row.subject) : null,
    questionCount: Number(row.question_count ?? 0),
    answeredCount: Number(row.answered_count ?? Number(row.correct_count ?? 0)),
    correctCount: Number(row.correct_count ?? 0),
    scorePct: Number(row.score_pct ?? 0),
    status: String(row.status ?? 'generated'),
    sourceSummary: String(row.source_summary ?? ''),
    weakAreas,
    recommendations: row.recommendations ? String(row.recommendations) : null,
    timeLimitMinutes: Number(row.time_limit_minutes ?? 0),
    generatedAt: String(row.generated_at ?? ''),
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function questionRow(row: Record<string, unknown>): ExamQuestionDto {
  let opts: string[] = [];
  try { opts = JSON.parse(String(row.options_json ?? '[]')); } catch { opts = []; }
  return {
    id: String(row.id ?? ''),
    examId: String(row.exam_id ?? ''),
    questionIndex: Number(row.question_index ?? 0),
    questionText: String(row.question_text ?? ''),
    options: opts,
    correctAnswer: String(row.correct_answer ?? ''),
    sourceType: row.source_type ? String(row.source_type) : null,
    sourceId: row.source_id ? String(row.source_id) : null,
    userAnswer: row.user_answer ? String(row.user_answer) : null,
    isCorrect: Number(row.is_correct ?? 0) === 1,
    isAnswered: Number(row.is_answered ?? 0) === 1,
  };
}

const BATCH_SIZE = 10;

async function llmGenerateBatch(
  userId: string,
  subject: string | undefined,
  batchIndex: number,
  batchCount: number,
  questionsSoFar: number,
  targetCount: number,
  mistakes: Record<string, unknown>[],
  blanks: Record<string, unknown>[],
  previousQuestions: string[],
): Promise<{ title?: string; subject?: string; questions: Record<string, unknown>[] }> {
  const llm = resolveUserLlm(userId);
  const batchNum = batchIndex + 1;
  const isFirst = batchIndex === 0;
  const thisBatchSize = Math.min(BATCH_SIZE, targetCount - questionsSoFar);

  const systemPrompt = [
    '你是一个出题专家。根据提供的错题和知识缺口，生成标准模考试题。',
    `生成 ${thisBatchSize} 道高质量选择题，每道题必须：`,
    '- 题干清晰，选项互斥（4个选项）',
    '- 正确答案明确',
    '- 标注题目来源',
    isFirst ? '' : '- 避免与已出题目重复的知识点',
    '返回 JSON，不要多余文本：',
    `{${isFirst ? '\n  "title": "试卷标题",\n  "subject": "学科",' : ''}`,
    '  "questions": [',
    '    {',
    '      "questionText": "题干",',
    '      "options": ["A","B","C","D"],',
    '      "correctAnswer": "正确选项",',
    '      "sourceType": "mistake_bank | knowledge_gap | general",',
    '      "sourceHint": "改编自..."',
    '    }',
    '  ]',
    '}',
  ].filter(Boolean).join('\n');

  const userPrompt = [
    subject ? `学科：${subject}` : '学科：综合',
    `批次：第${batchNum}/${batchCount}批，本批出${thisBatchSize}题`,
    '',
    '=== 用户错题 ===',
    JSON.stringify(mistakes.slice(0, 30).map(m => ({
      q: m.question_text,
      a: m.correct_answer,
      kp: m.knowledge_node,
    })), null, 2),
    '',
    '=== 知识缺口 ===',
    JSON.stringify(blanks.slice(0, 20).map(b => ({
      kp: b.node_title,
      mastery: b.current_mastery,
    })), null, 2),
    '',
    previousQuestions.length > 0
      ? `=== 已出题目（请避免重复）===\n${previousQuestions.join('\n')}`
      : '',
    llm?.usesPrivateKey ? '' : '注意：Warp 余额有限，请控制输出在 1500 tokens 以内。',
  ].filter(Boolean).join('\n');

  const gw = await gatewayJsonCompletion<Record<string, unknown>>(userId, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], {
    traceId: `exam_large_${userId}_batch_${batchNum}`,
    flatWarp: { cost: WARP_COST.CHAT_COMPLETION, reason: 'EXAM_GENERATE_LARGE' as any },
    maxTokens: 2000,
    temperature: 0.7,
  });

  const d = gw.data ?? {};
  return {
    title: String(d.title ?? ''),
    subject: String(d.subject ?? ''),
    questions: Array.isArray(d.questions) ? d.questions : [],
  };
}

export async function generateLargeExam(
  userId: string,
  subject?: string,
  questionCount?: number,
): Promise<ExamDetailDto> {
  const db = getLearningDb();
  const targetCount = Math.max(10, Math.min(100, questionCount ?? 50));
  const batchCount = Math.ceil(targetCount / BATCH_SIZE);

  // collect source material
  const mistakes = db.prepare(`
    SELECT question_text, correct_answer, subject, knowledge_node, mistake_type
    FROM zhi_mistake_bank
    WHERE user_id = ? AND mastery_status IN ('needs_review','retry_due')
    ${subject ? 'AND subject = ?' : ''}
    ORDER BY created_at DESC LIMIT 50
  `).all(...(subject ? [userId, subject] : [userId])) as Record<string, unknown>[];

  const blanks = db.prepare(`
    SELECT subject, node_title, current_mastery
    FROM zhi_planned_knowledge
    WHERE user_id = ? AND status = 'pending' AND current_mastery < 0.5
    ${subject ? 'AND subject = ?' : ''}
    ORDER BY current_mastery ASC LIMIT 30
  `).all(...(subject ? [userId, subject] : [userId])) as Record<string, unknown>[];

  const hasMaterial = mistakes.length > 0 || blanks.length > 0;
  const sourceSummary = hasMaterial
    ? `${mistakes.length}道错题 + ${blanks.length}个知识缺口`
    : '无特定来源，生成通用摸底卷';

  // generate in batches
  let allQuestions: Record<string, unknown>[] = [];
  let examTitle = '';
  let examSubject = '';
  const previousTitles: string[] = [];

  for (let i = 0; i < batchCount; i++) {
    const result = await llmGenerateBatch(
      userId, subject, i, batchCount,
      allQuestions.length, targetCount,
      mistakes, blanks, previousTitles,
    );
    if (i === 0) { examTitle = result.title || examTitle; examSubject = result.subject || examSubject; }
    for (const q of result.questions) {
      const text = String(q.questionText ?? '').slice(0, 60);
      previousTitles.push(text);
    }
    allQuestions = allQuestions.concat(result.questions);
    if (allQuestions.length >= targetCount) break;
  }

  // trim to target
  allQuestions = allQuestions.slice(0, targetCount);

  const examId = crypto.randomUUID();
  const timeLimit = Math.max(10, Math.ceil(allQuestions.length * 1.2));

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO zhi_exams (id, user_id, title, subject, question_count, status, source_summary, time_limit_minutes, generated_at)
      VALUES (?, ?, ?, ?, ?, 'generated', ?, ?, datetime('now'))
    `).run(examId, userId, examTitle || `模考·${subject ?? '综合'}`, examSubject || subject || '',
      allQuestions.length, sourceSummary, timeLimit);

    const insert = db.prepare(`
      INSERT INTO zhi_exam_questions (id, exam_id, question_index, question_text, options_json, correct_answer, source_type, source_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    allQuestions.forEach((q: unknown, i: number) => {
      const question = q as Record<string, unknown>;
      const opts = Array.isArray(question.options) ? question.options.map(String) : [];
      insert.run(
        crypto.randomUUID(), examId, i + 1,
        String(question.questionText ?? ''),
        JSON.stringify(opts),
        String(question.correctAnswer ?? opts[0] ?? ''),
        String(question.sourceType ?? 'general'),
        String(question.sourceHint ?? ''),
      );
    });
  });
  tx();

  return getExamDetail(examId)!;
}

/** Original small-exam generator (kept for quick mode) */
export async function generateExam(
  userId: string,
  subject?: string,
  questionCount?: number,
): Promise<ExamDetailDto> {
  const db = getLearningDb();
  const count = Math.max(3, Math.min(20, questionCount ?? 5));

  const mistakes = db.prepare(`
    SELECT question_text, correct_answer, subject, knowledge_node, mistake_type
    FROM zhi_mistake_bank WHERE user_id = ? AND mastery_status IN ('needs_review','retry_due')
    ${subject ? 'AND subject = ?' : ''}
    ORDER BY created_at DESC LIMIT 30
  `).all(...(subject ? [userId, subject] : [userId])) as Record<string, unknown>[];

  const blanks = db.prepare(`
    SELECT subject, node_title, current_mastery
    FROM zhi_planned_knowledge WHERE user_id = ? AND status = 'pending' AND current_mastery < 0.5
    ${subject ? 'AND subject = ?' : ''}
    ORDER BY current_mastery ASC LIMIT 20
  `).all(...(subject ? [userId, subject] : [userId])) as Record<string, unknown>[];

  const hasMaterial = mistakes.length > 0 || blanks.length > 0;
  const sourceSummary = hasMaterial
    ? `${mistakes.length}道错题 + ${blanks.length}个知识缺口`
    : '无特定来源，生成通用摸底卷';

  const llm = resolveUserLlm(userId);
  const systemPrompt = [
    '你是一个出题专家。根据提供的错题和知识缺口，生成一份标准模考试卷。',
    `严格生成 ${count} 道高质量选择题，每道题必须：`,
    '- 题干清晰，选项互斥',
    '- 正确答案明确',
    '- 标注题目来源',
    '返回 JSON，不要多余文本：',
    '{ "title": "试卷标题", "subject": "学科", "questions": [{ "questionText": "题干", "options": ["A","B","C","D"], "correctAnswer": "正确选项", "sourceType": "mistake_bank|knowledge_gap|general", "sourceHint": "改编自..." }] }',
  ].join('\n');

  const userPrompt = [
    subject ? `学科：${subject}` : '学科：综合',
    `要求题目数：${count}`,
    '',
    '=== 用户错题 ===',
    JSON.stringify(mistakes.map(m => ({ q: m.question_text, a: m.correct_answer, kp: m.knowledge_node })), null, 2),
    '',
    '=== 知识缺口 ===',
    JSON.stringify(blanks.map(b => ({ kp: b.node_title, mastery: b.current_mastery })), null, 2),
    '',
    hasMaterial ? '请基于以上材料改编题目' : '请根据学科常识生成摸底题',
    llm?.usesPrivateKey ? '' : '注意：Warp 余额有限，请控制输出在 1500 tokens 以内。',
  ].filter(Boolean).join('\n');

  const gw = await gatewayJsonCompletion<Record<string, unknown>>(userId, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], {
    traceId: `exam_quick_${userId}_${subject ?? 'all'}`,
    flatWarp: { cost: WARP_COST.CHAT_COMPLETION, reason: 'EXAM_GENERATE' as any },
    maxTokens: 2000,
    temperature: 0.7,
  });

  const d = gw.data ?? {};
  const rawQuestions = Array.isArray(d.questions) ? d.questions : [];
  const examId = crypto.randomUUID();
  const timeLimit = rawQuestions.length * 1.5;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO zhi_exams (id, user_id, title, subject, question_count, status, source_summary, time_limit_minutes, generated_at)
      VALUES (?, ?, ?, ?, ?, 'generated', ?, ?, datetime('now'))
    `).run(examId, userId, String(d.title ?? '模考'), String(d.subject ?? subject ?? ''),
      rawQuestions.length, sourceSummary, Math.max(5, Math.ceil(timeLimit)));

    const insert = db.prepare(`
      INSERT INTO zhi_exam_questions (id, exam_id, question_index, question_text, options_json, correct_answer, source_type, source_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    rawQuestions.forEach((q: unknown, i: number) => {
      const question = q as Record<string, unknown>;
      const opts = Array.isArray(question.options) ? question.options.map(String) : [];
      insert.run(crypto.randomUUID(), examId, i + 1,
        String(question.questionText ?? ''), JSON.stringify(opts),
        String(question.correctAnswer ?? opts[0] ?? ''),
        String(question.sourceType ?? 'general'), String(question.sourceHint ?? ''));
    });
  });
  tx();

  return getExamDetail(examId)!;
}

export function getExam(examId: string): ExamDto | null {
  const row = getLearningDb().prepare(`SELECT * FROM zhi_exams WHERE id = ?`).get(examId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return examRow(row);
}

export function getExamDetail(examId: string): ExamDetailDto | null {
  const exam = getExam(examId);
  if (!exam) return null;
  const rows = getLearningDb().prepare(`
    SELECT * FROM zhi_exam_questions WHERE exam_id = ? ORDER BY question_index ASC
  `).all(examId) as Record<string, unknown>[];
  const answered = rows.filter(r => Number(r.is_answered ?? 0) === 1).length;
  return { ...exam, answeredCount: answered, questions: rows.map(questionRow) };
}

export function getExamQuestionsPaginated(
  examId: string,
  page: number,
  pageSize: number = BATCH_SIZE,
): { questions: ExamQuestionDto[]; page: number; totalPages: number; total: number } {
  const total = Number((getLearningDb().prepare(`
    SELECT COUNT(*) as cnt FROM zhi_exam_questions WHERE exam_id = ?
  `).get(examId) as { cnt: number }).cnt ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * pageSize;
  const rows = getLearningDb().prepare(`
    SELECT * FROM zhi_exam_questions WHERE exam_id = ? ORDER BY question_index ASC LIMIT ? OFFSET ?
  `).all(examId, pageSize, offset) as Record<string, unknown>[];
  return { questions: rows.map(questionRow), page: safePage, totalPages, total };
}

export function getExamProgress(examId: string): ExamProgressDto | null {
  const exam = getExam(examId);
  if (!exam) return null;
  const answeredCount = Number((getLearningDb().prepare(`
    SELECT COUNT(*) as cnt FROM zhi_exam_questions WHERE exam_id = ? AND is_answered = 1
  `).get(examId) as { cnt: number }).cnt ?? 0);
  const timeElapsedSeconds = exam.startedAt
    ? Math.floor((Date.now() - new Date(exam.startedAt).getTime()) / 1000)
    : 0;
  const timeRemainingSeconds = exam.timeLimitMinutes > 0 && exam.startedAt
    ? Math.max(0, exam.timeLimitMinutes * 60 - timeElapsedSeconds)
    : null;
  return {
    examId,
    answeredCount,
    totalCount: exam.questionCount,
    timeLimitMinutes: exam.timeLimitMinutes,
    startedAt: exam.startedAt,
    timeElapsedSeconds,
    timeRemainingSeconds,
  };
}

export function startExam(examId: string): void {
  getLearningDb().prepare(`
    UPDATE zhi_exams SET status = 'in_progress', started_at = datetime('now') WHERE id = ? AND status = 'generated'
  `).run(examId);
}

export function answerQuestion(examId: string, questionId: string, userAnswer: string): void {
  const db = getLearningDb();
  const q = db.prepare(`SELECT * FROM zhi_exam_questions WHERE id = ? AND exam_id = ?`).get(questionId, examId) as Record<string, unknown> | undefined;
  if (!q) throw new Error('题目不存在');
  const correct = String(q.correct_answer ?? '') === userAnswer.trim();
  db.prepare(`
    UPDATE zhi_exam_questions SET user_answer = ?, is_correct = ?, is_answered = 1 WHERE id = ?
  `).run(userAnswer, correct ? 1 : 0, questionId);

  // update answered_count on exam
  const answered = Number((db.prepare(`
    SELECT COUNT(*) as cnt FROM zhi_exam_questions WHERE exam_id = ? AND is_answered = 1
  `).get(examId) as { cnt: number }).cnt ?? 0);
  db.prepare(`UPDATE zhi_exams SET correct_count = (SELECT COUNT(*) FROM zhi_exam_questions WHERE exam_id = ? AND is_correct = 1) WHERE id = ?`).run(examId, examId);
}

export function answerQuestionBatch(examId: string, answers: Array<{ questionId: string; answer: string }>): number {
  let count = 0;
  const db = getLearningDb();
  const tx = db.transaction(() => {
    for (const a of answers) {
      try {
        answerQuestion(examId, a.questionId, a.answer);
        count++;
      } catch { /* skip already-answered */ }
    }
  });
  tx();
  return count;
}

export function gradeExam(examId: string): ExamDetailDto {
  const db = getLearningDb();
  const questions = db.prepare(`
    SELECT * FROM zhi_exam_questions WHERE exam_id = ? ORDER BY question_index ASC
  `).all(examId) as Record<string, unknown>[];
  const total = questions.length;
  const correct = questions.filter(q => Number(q.is_correct ?? 0) === 1).length;
  const scorePct = total > 0 ? Math.round((correct / total) * 100) : 0;

  const wrongBySource = new Map<string, number>();
  for (const q of questions) {
    if (Number(q.is_correct ?? 0) === 0 && Number(q.is_answered ?? 0) === 1) {
      const st = String(q.source_type ?? 'general');
      wrongBySource.set(st, (wrongBySource.get(st) ?? 0) + 1);
    }
  }
  const weakAreas = [...wrongBySource.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  const recommendations = scorePct >= 80
    ? '表现良好，建议关注错题知识点进行针对性巩固'
    : scorePct >= 50
      ? `薄弱环节：${weakAreas.join('、')}。建议复习错题并重做`
      : `基础薄弱区域：${weakAreas.join('、')}。建议系统学习相关知识点后再试`;

  db.prepare(`
    UPDATE zhi_exams SET correct_count = ?, score_pct = ?, status = 'completed',
      weak_areas_json = ?, recommendations = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(correct, scorePct, JSON.stringify(weakAreas), recommendations, examId);

  // auto-schedule retake only for small exams (≤20 questions)
  if (scorePct < 80 && total <= 20) {
    const exam = db.prepare(`SELECT * FROM zhi_exams WHERE id = ?`).get(examId) as Record<string, unknown> | undefined;
    if (exam) {
      const retakeId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO zhi_exams (id, user_id, title, subject, question_count, status, source_summary, generated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, datetime('now'))
      `).run(retakeId, String(exam.user_id ?? ''), `重考·${String(exam.title ?? '模考')}`,
        exam.subject ? String(exam.subject) : null, Number(exam.question_count ?? 0),
        `自动重考（原始分 ${scorePct}%）`);
      const insert = db.prepare(`
        INSERT INTO zhi_exam_questions (id, exam_id, question_index, question_text, options_json, correct_answer, source_type, source_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const shuffled = [...questions].sort(() => Math.random() - 0.5);
      shuffled.forEach((q, i) => {
        insert.run(crypto.randomUUID(), retakeId, i + 1,
          String(q.question_text ?? ''), String(q.options_json ?? '[]'),
          String(q.correct_answer ?? ''), String(q.source_type ?? ''), String(q.source_id ?? ''));
      });
    }
  }

  return getExamDetail(examId)!;
}

export function listExams(userId: string, subject?: string, limit = 10): ExamHistoryDto {
  const db = getLearningDb();
  let rows: Record<string, unknown>[];
  const params: unknown[] = [userId];
  if (subject) {
    params.push(subject);
    rows = db.prepare(`SELECT * FROM zhi_exams WHERE user_id = ? AND subject = ? ORDER BY generated_at DESC LIMIT ?`).all(...params, limit) as Record<string, unknown>[];
  } else {
    rows = db.prepare(`SELECT * FROM zhi_exams WHERE user_id = ? ORDER BY generated_at DESC LIMIT ?`).all(...params, limit) as Record<string, unknown>[];
  }

  const allExams = db.prepare(`SELECT score_pct, subject FROM zhi_exams WHERE user_id = ? AND status = 'completed'`).all(userId) as Record<string, unknown>[];
  const completed = allExams.filter(e => Number(e.score_pct ?? 0) > 0);
  const avgScore = completed.length > 0 ? Math.round(completed.reduce((s, e) => s + Number(e.score_pct ?? 0), 0) / completed.length) : 0;
  const subjectMap = new Map<string, { count: number; totalPct: number }>();
  for (const e of completed) {
    const subj = String(e.subject ?? '未知');
    const cur = subjectMap.get(subj) ?? { count: 0, totalPct: 0 };
    cur.count++; cur.totalPct += Number(e.score_pct ?? 0);
    subjectMap.set(subj, cur);
  }
  return {
    items: rows.map(examRow),
    totalExams: rows.length,
    avgScore,
    bySubject: [...subjectMap.entries()].map(([s, d]) => ({ subject: s, count: d.count, avgScore: Math.round(d.totalPct / d.count) })),
  };
}
