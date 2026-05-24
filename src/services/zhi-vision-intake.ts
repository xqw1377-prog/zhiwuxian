/**
 * ZHI · 摄影拦截学业建档：拍图结构化 + 教材书名/出版社自动展开目录与知识点
 */

import { fuelOpenAiMessages } from './llm-fuel-gateway';
import { resolveUserLlm } from './deepseek-client';
import { resolveQwenVision } from './qwen-client';
import {
  getTextbookById,
  listTextbooksForUser,
  parseTextbookOutline,
  upsertTextbookCatalog,
  type TextbookChapterOutline,
} from '../db/zhi-textbook-catalog-schema';
import { applyStructuredBaseline } from './zhi-baseline-intake';
import { upsertTextbookDirectory } from './zhi-textbook-directory';
import { getOrCreateDailyReview } from './zhi-daily-review-engine';
import { recordEvolutionMilestone } from './zhi-evolution-ledger';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { matchSchoolIntel } from './school-anchor-brief';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export type VisionCaptureKind = 'exam_paper' | 'textbook_page' | 'score_sheet' | 'notes' | 'other';

export type VisionIntakeResult = {
  kind: VisionCaptureKind;
  subject: string;
  scoreOrProgress: string;
  topics: string[];
  weakPoints: string[];
  challenge: string;
  summary: string;
  baselineScores: Record<string, string>;
  chatText: string;
};

export type TextbookResolveResult = {
  catalogId: string;
  title: string;
  publisher: string;
  subject: string;
  edition: string;
  totalChapters: number;
  chapters: TextbookChapterOutline[];
  progressChapter: number;
  progressPct: number;
  completedKnowledge: string[];
  upcomingKnowledge: string[];
  gapNote: string;
  baselineKey: string;
  baselineValue: string;
  chatText: string;
};

function parseJsonFromLlm(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fence ? fence[1] : trimmed).trim();
  return JSON.parse(raw);
}

function llmJson<T>(raw: string, fallback: T): T {
  try {
    return parseJsonFromLlm(raw) as T;
  } catch {
    return fallback;
  }
}

function inferSubject(text: string): string {
  const t = text;
  if (/数学|几何|函数|导数|积分|矩阵|向量|概率|统计/.test(t)) return '数学';
  if (/物理|力学|电磁|电路|光学|热学/.test(t)) return '物理';
  if (/化学|氧化|还原|电解|有机|无机|元素/.test(t)) return '化学';
  if (/英语|阅读|写作|听力|口语|托福|雅思|SAT|GRE/.test(t)) return '英语';
  if (/语文|作文|阅读理解|古诗|文言文/.test(t)) return '语文';
  if (/计算机|编程|算法|数据结构|代码|LeetCode|Python|Java|C\+\+/.test(t)) return '计算机';
  return '综合';
}

function templateVisionIntake(ocrText: string, userHint: string): VisionIntakeResult {
  const text = `${ocrText}\n${userHint}`.trim();
  const subject = inferSubject(text);
  const scoreMatch = text.match(/(\d{1,3})\s*分/);
  const pctMatch = text.match(/(\d{1,3})\s*%/);
  const chapterMatch = text.match(/第\s*(\d{1,3})\s*章/);
  const scoreOrProgress =
    scoreMatch?.[1] ? `${scoreMatch[1]}分` : pctMatch?.[1] ? `${pctMatch[1]}%` : chapterMatch?.[1] ? `第${chapterMatch[1]}章` : '—';

  const kind: VisionCaptureKind =
    /成绩单|总分|排名/.test(text) ? 'score_sheet'
      : /选择题|填空题|解答题|试卷|错题|真题/.test(text) ? 'exam_paper'
        : /教材|课本|目录|章节|第\s*\d+\s*章/.test(text) ? 'textbook_page'
          : /笔记|摘录|手写/.test(text) ? 'notes'
            : 'other';

  const weakPoints = /薄弱|错题|不会|卡住|听不懂/.test(text)
    ? [userHint.trim() || '待补充薄弱点'].filter(Boolean).slice(0, 1)
    : [];

  const challenge = userHint.trim() || (weakPoints[0] ?? '待补充当前最大挑战');
  const summary = '模板模式：已基于你的文字提示完成建档预览。配置 DeepSeek Key 后可启用读图与深度拓扑拦截。';
  const baselineScores: Record<string, string> = {};
  if (scoreOrProgress !== '—') baselineScores[subject] = scoreOrProgress;

  const kindLabel =
    kind === 'exam_paper'
      ? '试卷'
      : kind === 'textbook_page'
        ? '教材页'
        : kind === 'score_sheet'
          ? '成绩单'
          : kind === 'notes'
            ? '笔记'
            : '学习材料';

  const chatText = [
    `【摄影拦截 · ${kindLabel}】${subject}`,
    scoreOrProgress !== '—' ? `现状：${scoreOrProgress}` : '',
    challenge ? `挑战：${challenge}` : '',
    summary,
    '确认后将更新学业建档并触发今日计划修正。',
  ].filter(Boolean).join('\n');

  return {
    kind,
    subject,
    scoreOrProgress,
    topics: [],
    weakPoints,
    challenge,
    summary,
    baselineScores,
    chatText,
  };
}

async function llmComplete(
  userId: string,
  messages: ChatCompletionMessageParam[],
  maxTokens = 1200,
): Promise<string> {
  const gw = await fuelOpenAiMessages(userId, 'VISION_INTAKE', messages, {
    traceId: `vision_intake_${userId}`,
    policyOverride: { maxTokens },
  });
  if (!gw.chargeOk) throw new Error('Warp 燃料不足，请充值后继续');
  return (gw.data ?? '').trim();
}

export async function analyzeVisionForIntake(input: {
  userId: string;
  screenshotData?: string;
  ocrText?: string;
  userHint?: string;
}): Promise<VisionIntakeResult> {
  const uid = input.userId.trim();
  const ocr = (input.ocrText ?? '').trim();
  const hint = (input.userHint ?? '').trim();
  if (!resolveUserLlm(uid) && !resolveQwenVision(uid)) {
    return templateVisionIntake(ocr, hint);
  }
  const dataUrl =
    input.screenshotData?.trim().startsWith('data:image/')
      ? input.screenshotData.trim()
      : input.screenshotData?.trim()
        ? `data:image/jpeg;base64,${input.screenshotData.replace(/\s+/g, '')}`
        : null;

  const anchor = getSchoolAnchorProfile(uid);
  const dreamHint = anchor?.school
    ? `梦校对标：${anchor.school} · ${anchor.major}，目标入学 ${anchor.targetApplyAt}`
    : '尚未锁定梦校';

  const system = `你是 ZHI 学业建档官。根据试卷/教材页/成绩单 OCR 与截图，输出严格 JSON（不要 markdown 包裹外的文字）：
{
  "kind": "exam_paper|textbook_page|score_sheet|notes|other",
  "subject": "科目名",
  "scoreOrProgress": "分数或学到哪",
  "topics": ["知识点1","知识点2"],
  "weakPoints": ["薄弱点"],
  "challenge": "一句当前最大挑战",
  "summary": "两句复盘",
  "baselineScores": { "科目或指标": "可读数值或进度描述" }
}
${dreamHint}`;

  let userContent: ChatCompletionMessageParam['content'];
  if (dataUrl) {
    userContent = [
      {
        type: 'text',
        text: `OCR/用户说明：\n${ocr || hint || '（无文字，请读图）'}`,
      },
      { type: 'image_url', image_url: { url: dataUrl } },
    ];
  } else {
    if (!ocr && !hint) throw new Error('请上传图片或补充说明');
    userContent = `OCR/用户说明：\n${ocr || hint}`;
  }

  const raw = await llmComplete(uid, [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ]);

  const parsed = llmJson<{
    kind?: string;
    subject?: string;
    scoreOrProgress?: string;
    topics?: string[];
    weakPoints?: string[];
    challenge?: string;
    summary?: string;
    baselineScores?: Record<string, string>;
  }>(raw, {});

  const kind = (['exam_paper', 'textbook_page', 'score_sheet', 'notes', 'other'] as const).includes(
    parsed.kind as VisionCaptureKind,
  )
    ? (parsed.kind as VisionCaptureKind)
    : 'other';

  const subject = String(parsed.subject ?? '综合').trim() || '综合';
  const scoreOrProgress = String(parsed.scoreOrProgress ?? '—').trim();
  const topics = (parsed.topics ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
  const weakPoints = (parsed.weakPoints ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 8);
  const challenge = String(parsed.challenge ?? '').trim() || '待补充当前最大挑战';
  const summary = String(parsed.summary ?? '').trim() || '已读取影像，待你确认后写入建档。';
  const baselineScores: Record<string, string> = {};
  if (parsed.baselineScores && typeof parsed.baselineScores === 'object') {
    for (const [k, v] of Object.entries(parsed.baselineScores)) {
      baselineScores[String(k).trim()] = String(v ?? '').trim();
    }
  }
  if (Object.keys(baselineScores).length === 0 && scoreOrProgress !== '—') {
    baselineScores[subject] = scoreOrProgress;
  }

  const kindLabel =
    kind === 'exam_paper'
      ? '试卷'
      : kind === 'textbook_page'
        ? '教材页'
        : kind === 'score_sheet'
          ? '成绩单'
          : kind === 'notes'
            ? '笔记'
            : '学习材料';

  const chatText = [
    `【摄影拦截 · ${kindLabel}】${subject}`,
    scoreOrProgress !== '—' ? `现状：${scoreOrProgress}` : '',
    topics.length ? `知识点：${topics.join('、')}` : '',
    weakPoints.length ? `薄弱：${weakPoints.join('、')}` : '',
    `挑战：${challenge}`,
    summary,
    '确认后将更新学业建档并触发今日计划修正。',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    kind,
    subject,
    scoreOrProgress,
    topics,
    weakPoints,
    challenge,
    summary,
    baselineScores,
    chatText,
  };
}

export async function resolveTextbookByMeta(input: {
  userId: string;
  title: string;
  publisher: string;
  subject?: string;
  progressChapter?: number;
  progressNote?: string;
}): Promise<TextbookResolveResult> {
  const uid = input.userId.trim();
  const title = input.title.trim();
  const publisher = input.publisher.trim();
  if (!title) throw new Error('请填写书名');
  if (!publisher) throw new Error('请填写出版社');

  const anchor = getSchoolAnchorProfile(uid);
  const intel = anchor?.school
    ? matchSchoolIntel(anchor.school, anchor.major ?? '')
    : null;
  const dreamLine = anchor?.school
    ? `学生梦校：${anchor.school} · ${anchor.major}，${anchor.currentGrade}，入学 ${anchor.targetApplyAt}`
    : '梦校未锁定，按国内高中/国际课程常规路径推断';

  const progressChapter = Math.max(0, Math.floor(input.progressChapter ?? 0));
  const progressNote = (input.progressNote ?? '').trim();

  const system = `你是教材目录与考纲对齐专家。用户只提供书名+出版社（不需要逐页拍照），你要根据该教材的常见版本推断：
1) 完整章节目录（8-24章为宜，课内教材按真实结构）
2) 每章 3-8 个可考核知识点
3) 学生当前进度章号与百分比
4) 相对梦校硬指标的差距提示

输出严格 JSON：
{
  "subject": "科目",
  "edition": "版次/年级册别",
  "chapters": [{"index":1,"title":"章名","knowledgePoints":["知识点"]}],
  "progressChapter": 数字,
  "progressPct": 0-100,
  "completedKnowledge": ["已覆盖知识点"],
  "upcomingKnowledge": ["待学关键知识点"],
  "gapNote": "与梦校差距一句"
}
${dreamLine}
${intel ? `梦校硬指标参考：${JSON.stringify(intel.requiredMetrics)}` : ''}`;

  const userMsg = [
    `书名：${title}`,
    `出版社：${publisher}`,
    input.subject?.trim() ? `科目：${input.subject.trim()}` : '',
    progressChapter > 0 ? `学生自述学到：第 ${progressChapter} 章` : '',
    progressNote ? `补充：${progressNote}` : '',
    '请推断该教材标准目录与知识点（若有多册，选最常见的高中/备考册）。',
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await llmComplete(
    uid,
    [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ],
    2000,
  );

  const parsed = llmJson<{
    subject?: string;
    edition?: string;
    chapters?: TextbookChapterOutline[];
    progressChapter?: number;
    progressPct?: number;
    completedKnowledge?: string[];
    upcomingKnowledge?: string[];
    gapNote?: string;
  }>(raw, { chapters: [] });

  let chapters = (parsed.chapters ?? [])
    .map((ch, i) => ({
      index: Number(ch.index ?? i + 1),
      title: String(ch.title ?? `第${i + 1}章`).trim(),
      knowledgePoints: (ch.knowledgePoints ?? []).map((k) => String(k).trim()).filter(Boolean).slice(0, 10),
    }))
    .filter((c) => c.title);

  if (chapters.length === 0) {
    chapters = [
      { index: 1, title: '绪论与预备知识', knowledgePoints: ['核心概念', '基本运算'] },
      { index: 2, title: '主体章节（待细化）', knowledgePoints: ['请核对具体册别'] },
    ];
  }

  const total = chapters.length;
  const progCh =
    progressChapter > 0
      ? Math.min(progressChapter, total)
      : Math.min(Number(parsed.progressChapter ?? 1), total);
  const progressPct = Math.min(
    100,
    Math.max(
      0,
      Number(parsed.progressPct ?? Math.round((progCh / total) * 100)) || Math.round((progCh / total) * 100),
    ),
  );

  const completed = (parsed.completedKnowledge ?? []).map((s) => String(s).trim()).filter(Boolean);
  const upcoming = (parsed.upcomingKnowledge ?? []).map((s) => String(s).trim()).filter(Boolean);
  const gapNote = String(parsed.gapNote ?? '').trim() || '按章节推进，优先补齐梦校硬指标薄弱项。';
  const subject = String(parsed.subject ?? input.subject ?? '综合').trim();
  const edition = String(parsed.edition ?? '').trim();

  const row = upsertTextbookCatalog({
    userId: uid,
    title,
    publisher,
    subject,
    edition,
    chapters,
    progressChapter: progCh,
    progressPct,
    knowledgeSummary: [completed.slice(0, 6).join('；'), upcoming.slice(0, 6).join('；')].filter(Boolean).join(' | '),
  });

  upsertTextbookDirectory(uid, row.id);

  const baselineKey = `教材·${subject}·${title.slice(0, 20)}`;
  const baselineValue = `第${progCh}/${total}章 · ${progressPct}% · ${publisher}${edition ? ` · ${edition}` : ''}`;

  const currentChapter = chapters.find((c) => c.index === progCh) ?? chapters[progCh - 1];
  const chatText = [
    `【教材指认】${title}（${publisher}）`,
    `${subject}${edition ? ` · ${edition}` : ''} · 共 ${total} 章 · 进度 ${progCh}/${total}（${progressPct}%）`,
    currentChapter ? `当前章：${currentChapter.title}` : '',
    currentChapter?.knowledgePoints.length
      ? `本章知识点：${currentChapter.knowledgePoints.join('、')}`
      : '',
    completed.length ? `已覆盖：${completed.slice(0, 5).join('、')}` : '',
    upcoming.length ? `待攻克：${upcoming.slice(0, 5).join('、')}` : '',
    gapNote,
    '无需逐页拍照；确认后写入建档并修正今日计划。',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    catalogId: row.id,
    title,
    publisher,
    subject,
    edition,
    totalChapters: total,
    chapters,
    progressChapter: progCh,
    progressPct,
    completedKnowledge: completed,
    upcomingKnowledge: upcoming,
    gapNote,
    baselineKey,
    baselineValue,
    chatText,
  };
}

export function listUserTextbooks(userId: string) {
  return listTextbooksForUser(userId).map((row) => ({
    id: row.id,
    title: row.title,
    publisher: row.publisher,
    subject: row.subject,
    progressChapter: row.progress_chapter,
    progressPct: row.progress_pct,
    chapters: parseTextbookOutline(row),
    updatedAt: row.updated_at,
  }));
}

export function confirmVisionIntake(input: {
  userId: string;
  baselineScores?: Record<string, string>;
  weakSubjects?: string[];
  challenge?: string;
  textbookCatalogId?: string;
}): {
  baselineKeys: string[];
  dailyReviewReady: boolean;
  review: ReturnType<typeof getOrCreateDailyReview>;
  directoryId: string | null;
} {
  const uid = input.userId.trim();
  const scores = { ...(input.baselineScores ?? {}) };
  if (input.challenge?.trim()) {
    scores['当前挑战'] = input.challenge.trim().slice(0, 200);
  }

  if (input.textbookCatalogId) {
    const row = getTextbookById(input.textbookCatalogId);
    if (row) {
      const key = `教材·${row.subject ?? '综合'}·${row.title.slice(0, 16)}`;
      scores[key] = `第${row.progress_chapter ?? '?'}/${parseTextbookOutline(row).length}章 · ${row.progress_pct ?? 0}%`;
    }
  }

  const { keys } = applyStructuredBaseline(uid, {
    scores,
    weakSubjects: input.weakSubjects,
  });

  let directoryId: string | null = null;
  if (input.textbookCatalogId) {
    const dir = upsertTextbookDirectory(uid, input.textbookCatalogId);
    directoryId = dir?.id ?? null;
  }

  const review = getOrCreateDailyReview(uid, { force: true });

  recordEvolutionMilestone({
    userId: uid,
    battle: 'AP_KNOWLEDGE_FORGE',
    description: `摄影建档 · ${keys.length} 项 baseline 入账`,
  });

  return { baselineKeys: keys, dailyReviewReady: Boolean(review), review, directoryId };
}
