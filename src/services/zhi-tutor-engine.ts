import { getLearningDb } from '../../server/wuxian-learning-db';
import { resolveUserLlm } from './deepseek-client';
import { gatewayJsonCompletion } from './llm-gateway';
import { WARP_COST } from './billing-hub';

export type LessonDto = {
  id: string;
  knowledgePoint: string;
  subject: string;
  prerequisiteCheck: string;
  coreTeaching: string;
  analogy: string;
  commonMistakes: string;
  checkpointQuestion: string;
  checkpointOptions: string[];
  checkpointAnswer: string;
  estimatedMinutes: number;
  sourceType: string;
  sourceId: string;
  checkpointPassed: number; // 0=unanswered, 1=correct, -1=wrong
  createdAt: string;
};

export type ChapterLessonDto = {
  id: string;
  catalogId: string;
  chapterIndex: number;
  chapterTitle: string;
  knowledgePoints: string[];
  teaching: string;
  examples: string;
  summary: string;
  checkpointQuestion: string;
  checkpointOptions: string[];
  checkpointAnswer: string;
  estimatedMinutes: number;
  createdAt: string;
};

export type TextbookProgressDto = {
  catalogId: string;
  title: string;
  totalChapters: number;
  chapters: Array<{
    index: number;
    title: string;
    knowledgePoints: string[];
    status: string;
    checkpointPassed: boolean;
    lessonId: string | null;
  }>;
};

export type TeachRequest = {
  userId: string;
  knowledgePoint: string;
  subject?: string;
  context?: string;
  sourceType?: string;
  sourceId?: string;
};

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function teachKnowledgePoint(req: TeachRequest): Promise<LessonDto> {
  const { userId, knowledgePoint, subject, context, sourceType, sourceId } = req;
  const llm = resolveUserLlm(userId);

  const systemPrompt = [
    '你是一个顶级学科导师，擅长从零开始讲透知识点。',
    '根据知识点名称和上下文，生成结构化教案。',
    '返回 JSON，不要多余文本：',
    '{',
    '  "prerequisiteCheck": "前置知识检查（50字内）",',
    '  "coreTeaching": "核心讲授：从直觉理解到严谨推导（200-500字）",',
    '  "analogy": "类比或生活举例（50字）",',
    '  "commonMistakes": "常见错误预警（50字）",',
    '  "checkpointQuestion": "随堂验收题题干",',
    '  "checkpointOptions": ["选项A","选项B","选项C","选项D"],',
    '  "checkpointAnswer": "正确选项（必须与 options 中某项完全一致）",',
    '  "estimatedMinutes": 8',
    '}',
  ].join('\n');

  const userPrompt = [
    `知识点：${knowledgePoint}`,
    subject ? `学科：${subject}` : '',
    context ? `上下文：${context}` : '',
    llm?.usesPrivateKey ? '' : '注意：Warp 余额有限，请控制在 400 tokens 以内。',
  ].filter(Boolean).join('\n');

  const gw = await gatewayJsonCompletion<Record<string, unknown>>(userId, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], {
    traceId: `tutor_${userId}_${knowledgePoint.slice(0, 20)}`,
    flatWarp: { cost: WARP_COST.CHAT_COMPLETION, reason: 'TUTOR_TEACH' as any },
    maxTokens: 800,
    temperature: 0.7,
  });

  const d = gw.data ?? {};
  const lesson = {
    prerequisiteCheck: String(d.prerequisiteCheck ?? ''),
    coreTeaching: String(d.coreTeaching ?? ''),
    analogy: String(d.analogy ?? ''),
    commonMistakes: String(d.commonMistakes ?? ''),
    checkpointQuestion: String(d.checkpointQuestion ?? ''),
    checkpointOptions: (Array.isArray(d.checkpointOptions) ? d.checkpointOptions : []).map(String),
    checkpointAnswer: String(d.checkpointAnswer ?? ''),
    estimatedMinutes: Math.max(3, Math.min(30, Number(d.estimatedMinutes) || 10)),
  };

  const db = getLearningDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO zhi_tutor_lessons (id, user_id, knowledge_point, subject, prerequisite_check, core_teaching, analogy, common_mistakes, checkpoint_question, checkpoint_answer, checkpoint_options, estimated_minutes, source_type, source_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, knowledgePoint, subject ?? '',
    lesson.prerequisiteCheck, lesson.coreTeaching, lesson.analogy, lesson.commonMistakes,
    lesson.checkpointQuestion, lesson.checkpointAnswer,
    JSON.stringify(lesson.checkpointOptions), lesson.estimatedMinutes,
    sourceType ?? '', sourceId ?? '',
  );

  return {
    id,
    knowledgePoint,
    subject: subject ?? '',
    ...lesson,
    sourceType: sourceType ?? '',
    sourceId: sourceId ?? '',
    checkpointPassed: 0,
    createdAt: new Date().toISOString(),
  };
}

export async function teachChapter(
  userId: string,
  catalogId: string,
  chapterIndex: number,
): Promise<ChapterLessonDto> {
  const db = getLearningDb();

  const catalog = db.prepare(`SELECT * FROM zhi_textbook_catalog WHERE id = ?`).get(catalogId) as Record<string, unknown> | undefined;
  if (!catalog) throw new Error('教材目录不存在');

  let chapters: Array<{ index: number; title: string; knowledgePoints: string[] }> = [];
  try { chapters = JSON.parse(String(catalog.outline_json ?? '[]')); } catch { chapters = []; }
  const chapter = chapters.find((c) => c.index === chapterIndex);
  if (!chapter) throw new Error(`第 ${chapterIndex} 章不存在`);

  const kpList = chapter.knowledgePoints.length > 0
    ? chapter.knowledgePoints.join('、')
    : chapter.title;

  const llm = resolveUserLlm(userId);
  const userPrompt = [
    `教材：${String(catalog.title ?? '')}`,
    `出版社：${String(catalog.publisher ?? '')}`,
    `学科：${String(catalog.subject ?? '')}`,
    `章节：第${chapterIndex}章 ${chapter.title}`,
    `知识点：${kpList}`,
    llm?.usesPrivateKey ? '' : '注意：Warp 余额有限，请控制在 600 tokens 以内。',
  ].filter(Boolean).join('\n');

  const systemPrompt = [
    '你是一个顶级教材讲师，按照教材章节结构讲授。',
    '返回 JSON，不要多余文本：',
    '{',
    '  "teaching": "本章核心讲授：从直觉到理解，覆盖所有知识点（400-800字）",',
    '  "examples": "典型例题与解析（100-200字）",',
    '  "summary": "本章总结与记忆口诀（50字）",',
    '  "checkpointQuestion": "本章验收题题干",',
    '  "checkpointOptions": ["选项A","选项B","选项C","选项D"],',
    '  "checkpointAnswer": "正确选项（必须与 options 中某项完全一致）",',
    '  "estimatedMinutes": 15',
    '}',
  ].join('\n');

  const gw = await gatewayJsonCompletion<Record<string, unknown>>(userId, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], {
    traceId: `tutor_chapter_${userId}_${chapterIndex}`,
    flatWarp: { cost: WARP_COST.CHAT_COMPLETION, reason: 'TUTOR_CHAPTER' as any },
    maxTokens: 1200,
    temperature: 0.7,
  });

  const d = gw.data ?? {};
  const lessonId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO zhi_tutor_lessons (id, user_id, knowledge_point, subject, core_teaching, checkpoint_question, checkpoint_answer, checkpoint_options, estimated_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    lessonId, userId, `第${chapterIndex}章 ${chapter.title}`, String(catalog.subject ?? ''),
    String(d.teaching ?? ''), String(d.checkpointQuestion ?? ''),
    String(d.checkpointAnswer ?? ''),
    JSON.stringify((Array.isArray(d.checkpointOptions) ? d.checkpointOptions : []).map(String)),
    Math.max(5, Math.min(45, Number(d.estimatedMinutes) || 15)),
  );

  const progressId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO zhi_textbook_progress (id, user_id, catalog_id, chapter_index, status, lesson_id, started_at)
    VALUES (?, ?, ?, ?, 'in_progress', ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET status = 'in_progress', lesson_id = excluded.lesson_id, started_at = datetime('now')
  `).run(progressId, userId, catalogId, chapterIndex, lessonId);

  return {
    id: lessonId,
    catalogId,
    chapterIndex,
    chapterTitle: chapter.title,
    knowledgePoints: chapter.knowledgePoints,
    teaching: String(d.teaching ?? ''),
    examples: String(d.examples ?? ''),
    summary: String(d.summary ?? ''),
    checkpointQuestion: String(d.checkpointQuestion ?? ''),
    checkpointOptions: (Array.isArray(d.checkpointOptions) ? d.checkpointOptions : []).map(String),
    checkpointAnswer: String(d.checkpointAnswer ?? ''),
    estimatedMinutes: Math.max(5, Math.min(45, Number(d.estimatedMinutes) || 15)),
    createdAt: new Date().toISOString(),
  };
}

export function completeChapterCheckpoint(
  userId: string,
  catalogId: string,
  chapterIndex: number,
  passed: boolean,
): void {
  const db = getLearningDb();
  const progressId = `${userId}_${catalogId}_${chapterIndex}`;
  db.prepare(`
    INSERT INTO zhi_textbook_progress (id, user_id, catalog_id, chapter_index, status, checkpoint_passed, completed_at)
    VALUES (?, ?, ?, ?, 'completed', ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET status = 'completed', checkpoint_passed = excluded.checkpoint_passed, completed_at = datetime('now')
  `).run(progressId, userId, catalogId, chapterIndex, passed ? 1 : 0);
}

export function getTextbookProgress(userId: string, catalogId: string): TextbookProgressDto | null {
  const db = getLearningDb();
  const catalog = db.prepare(`SELECT * FROM zhi_textbook_catalog WHERE id = ?`).get(catalogId) as Record<string, unknown> | undefined;
  if (!catalog) return null;

  let chapters: Array<{ index: number; title: string; knowledgePoints: string[] }> = [];
  try { chapters = JSON.parse(String(catalog.outline_json ?? '[]')); } catch { chapters = []; }

  const progressRows = db.prepare(`
    SELECT * FROM zhi_textbook_progress WHERE user_id = ? AND catalog_id = ? ORDER BY chapter_index ASC
  `).all(userId, catalogId) as Record<string, unknown>[];

  const progressMap = new Map<number, Record<string, unknown>>();
  for (const row of progressRows) {
    progressMap.set(Number(row.chapter_index), row);
  }

  return {
    catalogId,
    title: String(catalog.title ?? ''),
    totalChapters: chapters.length,
    chapters: chapters.map((ch) => {
      const p = progressMap.get(ch.index);
      return {
        index: ch.index,
        title: ch.title,
        knowledgePoints: ch.knowledgePoints,
        status: p ? String(p.status ?? 'pending') : 'pending',
        checkpointPassed: p ? Number(p.checkpoint_passed ?? 0) === 1 : false,
        lessonId: p ? String(p.lesson_id ?? '') : null,
      };
    }),
  };
}

/**
 * 提交随堂验收答案 → 更新掌握度闭环
 */
export function submitLessonCheckpoint(
  userId: string,
  lessonId: string,
  userAnswer: string,
): { passed: boolean; correctAnswer: string; sourceType: string; sourceId: string } {
  const db = getLearningDb();
  const row = db.prepare(`
    SELECT * FROM zhi_tutor_lessons WHERE id = ? AND user_id = ?
  `).get(lessonId, userId) as Record<string, unknown> | undefined;
  if (!row) throw new Error('讲授记录不存在');

  const correctAnswer = String(row.checkpoint_answer ?? '');
  const passed = userAnswer.trim() === correctAnswer.trim();
  const sourceType = String(row.source_type ?? '');
  const sourceId = String(row.source_id ?? '');

  // 1. Persist checkpoint result on the lesson
  db.prepare(`
    UPDATE zhi_tutor_lessons SET checkpoint_passed = ?, checkpoint_answered_at = datetime('now') WHERE id = ?
  `).run(passed ? 1 : -1, lessonId);

  // 2. Map result back to source
  if (sourceType === 'mistake_bank' && sourceId) {
    const mistake = db.prepare(`SELECT * FROM zhi_mistake_bank WHERE id = ? AND user_id = ?`).get(sourceId, userId) as Record<string, unknown> | undefined;
    if (mistake) {
      const reviewCount = Number(mistake.review_count ?? 0) + 1;
      const correctCount = Number(mistake.correct_count ?? 0) + (passed ? 1 : 0);
      let status: string;
      let days: number;
      if (correctCount >= 3) { status = 'mastered'; days = 30; }
      else if (passed) { status = 'needs_practice'; days = reviewCount <= 2 ? 1 : reviewCount <= 4 ? 3 : 7; }
      else { status = 'needs_review'; days = 1; }
      const nextReview = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      db.prepare(`
        UPDATE zhi_mistake_bank SET review_count = ?, correct_count = ?, mastery_status = ?,
          last_reviewed_at = datetime('now'), next_review_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(reviewCount, correctCount, status, nextReview, sourceId);
    }
  }

  if (sourceType === 'planned_knowledge' && sourceId) {
    const node = db.prepare(`SELECT * FROM zhi_planned_knowledge WHERE id = ? AND user_id = ?`).get(sourceId, userId) as Record<string, unknown> | undefined;
    if (node) {
      const currentMastery = Math.max(0, Math.min(1, Number(node.current_mastery ?? 0) + (passed ? 0.3 : -0.1)));
      const newStatus = currentMastery >= 0.8 ? 'completed' : 'available';
      db.prepare(`
        UPDATE zhi_planned_knowledge SET current_mastery = ?, status = ?, completed_at = CASE WHEN ? >= 0.8 THEN datetime('now') ELSE NULL END, updated_at = datetime('now')
        WHERE id = ?
      `).run(currentMastery, newStatus, currentMastery, sourceId);
    }
  }

  // 3. If passed, create study stat entry for the day
  if (passed) {
    const today = todayStr();
    const existing = db.prepare(`SELECT id FROM zhi_study_stats WHERE user_id = ? AND stat_date = ?`).get(userId, today) as Record<string, unknown> | undefined;
    if (existing) {
      db.prepare(`UPDATE zhi_study_stats SET knowledge_mastered = knowledge_mastered + 1 WHERE id = ?`).run(existing.id);
    } else {
      db.prepare(`
        INSERT INTO zhi_study_stats (id, user_id, stat_date, knowledge_mastered) VALUES (?, ?, ?, 1)
      `).run(crypto.randomUUID(), userId, today);
    }
  }

  return { passed, correctAnswer, sourceType, sourceId };
}

export function getLesson(userId: string, lessonId: string): LessonDto | null {
  const row = getLearningDb().prepare(`
    SELECT * FROM zhi_tutor_lessons WHERE id = ? AND user_id = ?
  `).get(lessonId, userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToDto(row);
}

export function listLessons(userId: string, subject?: string, limit = 10): LessonDto[] {
  const db = getLearningDb();
  let rows: Record<string, unknown>[];
  if (subject) {
    rows = db.prepare(`
      SELECT * FROM zhi_tutor_lessons WHERE user_id = ? AND subject = ? ORDER BY created_at DESC LIMIT ?
    `).all(userId, subject, limit) as Record<string, unknown>[];
  } else {
    rows = db.prepare(`
      SELECT * FROM zhi_tutor_lessons WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(userId, limit) as Record<string, unknown>[];
  }
  return rows.map(rowToDto);
}

function rowToDto(row: Record<string, unknown>): LessonDto {
  let opts: string[] = [];
  try {
    const parsed = JSON.parse(String(row.checkpoint_options ?? '[]'));
    opts = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { opts = []; }

  return {
    id: String(row.id ?? ''),
    knowledgePoint: String(row.knowledge_point ?? ''),
    subject: String(row.subject ?? ''),
    prerequisiteCheck: String(row.prerequisite_check ?? ''),
    coreTeaching: String(row.core_teaching ?? ''),
    analogy: String(row.analogy ?? ''),
    commonMistakes: String(row.common_mistakes ?? ''),
    checkpointQuestion: String(row.checkpoint_question ?? ''),
    checkpointOptions: opts,
    checkpointAnswer: String(row.checkpoint_answer ?? ''),
    estimatedMinutes: Number(row.estimated_minutes ?? 10),
    sourceType: String(row.source_type ?? ''),
    sourceId: String(row.source_id ?? ''),
    checkpointPassed: Number(row.checkpoint_passed ?? 0),
    createdAt: String(row.created_at ?? ''),
  };
}
