/**
 * ZHI · 学习评估引擎（分科试卷 / 托福雅思 / 每日知识点）
 */

import { getBaselineStatus, parseBaseline } from '../db/baseline-schema';
import { getMentorPlanView } from '../db/school-matrix';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import {
  countPendingActivePapers,
  getAssessmentPaper,
  listAssessmentPapers,
  parsePaperPayload,
  parsePaperQuestions,
  saveAssessmentAttempt,
  saveAssessmentPaper,
  updateAssessmentPaperResult,
  type AssessmentMode,
  type AssessmentPaperType,
  type AssessmentQuestion,
  type AssessmentQuestionType,
} from '../db/zhi-assessment-schema';
import { listTextbooksForUser, parseTextbookOutline } from '../db/zhi-textbook-catalog-schema';
import { buildLearnerProfile, formatLearnerProfileBlock } from './learner-profile';
import { inferAssessmentSubjectId } from './zhi-chat-intent';
import {
  formatLearningPathChatSummary,
  replanLearningPathAfterAssessment,
} from './learning-path-engine';
import { buildLearningProgressDashboard } from './learning-progress-dashboard';
import { applyStructuredBaseline } from './zhi-baseline-intake';
import { getOrCreateDailyReview, getTodayDailyReview } from './zhi-daily-review-engine';
import { recordEvolutionMilestone } from './zhi-evolution-ledger';
import { WARP_COST } from './billing-hub';
import { resolveUserLlm } from './deepseek-client';
import { gatewayJsonCompletion } from './llm-gateway';
import { buildSandboxedLlmMessages, sanitizeLlmOutput } from '../../server/agents/zhi-tools';
import type { LlmChatMessage, LlmChatMessageParam } from '../../server/llm/llm-provider';

function toLlmChatMessages(params: LlmChatMessageParam[]): LlmChatMessage[] {
  const out: LlmChatMessage[] = [];
  for (const m of params) {
    const role = (m as any)?.role as string;
    const content = (m as any)?.content;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;
    out.push({ role: role as any, content });
  }
  return out;
}

export type AssessmentSubjectDto = {
  id: string;
  name: string;
  progressPct: number;
  lastScore: string | null;
  efficiency: 'high' | 'mid' | 'low' | 'unknown';
};

export type AssessmentHubDto = {
  subjects: AssessmentSubjectDto[];
  recentPapers: Array<{
    id: string;
    title: string;
    subjectName: string;
    paperType: string;
    scoreSummary: string | null;
    efficiencyLabel: string | null;
    at: number;
  }>;
  dailyKpDone: number;
  dailyKpTotal: number;
  pendingActiveExams: number;
  /** 最早一份待考主动卷，便于一键继续 */
  pendingExamPaperId: string | null;
  coachLine: string;
};

export type AssessmentPaperDto = {
  id: string;
  subjectId: string;
  subjectName: string;
  paperType: string;
  examAlign: string | null;
  title: string;
  questions: AssessmentQuestion[];
  status: string;
  assessmentMode: AssessmentMode;
  activeIntro?: string;
  source?: string;
};

export type AssessmentEvalDto = {
  paperId: string;
  scorePct: number;
  masteryScore: number;
  efficiency: 'high' | 'mid' | 'low';
  efficiencyLabel: string;
  strengths: string[];
  gaps: string[];
  coachFeedback: string;
  nextAction: string;
  baselineKey: string;
  learningPathSummary?: string;
};

const SUBJECT_EXAM_ALIGN: Record<string, string> = {
  toefl: 'TOEFL',
  sat: 'SAT',
  ap: 'AP',
  gpa: 'GPA',
  algo: 'USACO',
  essay: 'ESSAY',
};

const GENERATE_SYSTEM = `你是 ZHI 学习评估官。根据【学习者画像】中的课程轨（国内高考省卷 / AP·IB / 托福雅思等）生成短试卷（3-5题），判断真实掌握度。
规则：
- 国际课程/国际部/无高考教材：禁止出中国高考全国卷套题；用 AP/IB/A-Level/标化切片或校内 syllabus 风格。
- 国内高考轨：按就读省份（如湖南）与年级（如高二）出新课标/省情题型，可含学考或专题限时练。
- 每题必须可书面作答（简答或选择）；口语类用 speaking_hint。
严格 JSON：
{
  "title": "试卷标题",
  "questions": [
    {
      "id": "q1",
      "prompt": "题目正文",
      "type": "short|choice|speaking_hint",
      "options": ["A","B","C","D"],
      "knowledgePoint": "考查知识点"
    }
  ]
}
choice 题必须带 options；speaking_hint 用于口语类提示（学生去语言陪练录音）；short 为简答。`;

const ACTIVE_GENERATE_SYSTEM = `你是 ZHI【主动评估官】。铁律：有学必考；用主动发问验收真实掌握，禁止 passive 式「请描述你今天学了什么」当主题。
根据【学习者画像】与【刚学完的内容】出题（4-5题），必须混合：
- active_qa（至少 2 题）：prompt 以「曦宝，」开头，直接向学生追问要害（定义/步骤/错因/应用），可选 coachFollowUp 写一句答完后追问。
- fill_blank（至少 1 题）：题干含 ___ 表示填空位（1-3 个空），考查刚学知识点。
- choice（0-1 题）：四选一验证关键概念。
国际课程轨禁止高考全国卷套题；国内轨按省份年级出新课标/省情题。
严格 JSON：
{
  "title": "试卷标题",
  "activeIntro": "主动验收开场一句（含曦宝，说明学完必须过关）",
  "questions": [
    {
      "id": "q1",
      "prompt": "曦宝，……？",
      "type": "active_qa|fill_blank|choice|short|speaking_hint",
      "options": ["A","B","C","D"],
      "knowledgePoint": "考查点",
      "coachFollowUp": "可选，答完后追问"
    }
  ]
}`;

const EVAL_SYSTEM = `你是 ZHI 学习评估官。根据试卷与学生作答，判断学习效率与能力。
严格 JSON：
{
  "scorePct": 0-100,
  "masteryScore": 0-100,
  "efficiency": "high|mid|low",
  "efficiencyLabel": "如：概念清晰但应用偏慢",
  "strengths": ["做得好的点"],
  "gaps": ["薄弱点"],
  "coachFeedback": "30字内点评",
  "nextAction": "今晚唯一可执行动作"
}`;

function parseJson(content: string): Record<string, unknown> | null {
  try {
    const trimmed = content.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return JSON.parse((fence ? fence[1] : trimmed).trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function efficiencyFromScore(score: number): 'high' | 'mid' | 'low' {
  if (score >= 75) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}

const QUESTION_TYPES: AssessmentQuestionType[] = [
  'choice',
  'short',
  'speaking_hint',
  'fill_blank',
  'active_qa',
];

function normalizeQuestion(q: AssessmentQuestion, index: number): AssessmentQuestion {
  let type = String(q.type ?? 'short') as AssessmentQuestionType;
  if (!QUESTION_TYPES.includes(type)) type = 'short';
  let prompt = String(q.prompt ?? '').slice(0, 600);
  if (type === 'active_qa' && !/曦宝/.test(prompt)) {
    prompt = `曦宝，${prompt.replace(/^[？?]\s*/, '')}`;
  }
  if (type === 'fill_blank' && !/___/.test(prompt)) {
    prompt = `${prompt}（填空：___）`;
  }
  return {
    id: String(q.id ?? `q${index + 1}`),
    prompt,
    type,
    options:
      type === 'choice' && Array.isArray(q.options)
        ? q.options.map(String).slice(0, 5)
        : undefined,
    knowledgePoint: q.knowledgePoint ? String(q.knowledgePoint).slice(0, 80) : undefined,
    coachFollowUp: q.coachFollowUp ? String(q.coachFollowUp).slice(0, 120) : undefined,
  };
}

function heuristicActiveQuestions(
  subjectName: string,
  learningContext: string,
  profile?: ReturnType<typeof buildLearnerProfile>,
): AssessmentQuestion[] {
  const snippet = learningContext.trim().slice(0, 80) || subjectName;
  const grade = profile?.gradeBand ?? '';
  const prov = profile?.provinceOrRegion ?? '';
  return [
    {
      id: 'q1',
      type: 'active_qa',
      prompt: `曦宝，你刚接触「${snippet}」——用一句话说清核心定义，别用「差不多」。`,
      knowledgePoint: '主动·定义',
      coachFollowUp: '若说不清，今晚回教材第 1 节重读 10 分钟。',
    },
    {
      id: 'q2',
      type: 'fill_blank',
      prompt: `【${subjectName}·填空】根据刚才内容，关键条件是 ___ ，常见错因是 ___ 。`,
      knowledgePoint: '填空·概念',
    },
    {
      id: 'q3',
      type: 'active_qa',
      prompt: `曦宝，若 ${prov ? `${prov}·` : ''}${grade} 模考遇到同类题，你第一步写什么？`,
      knowledgePoint: '主动·步骤',
    },
    {
      id: 'q4',
      type: 'choice',
      prompt: `【${subjectName}】下列哪项最符合刚才所学要点的应用？`,
      options: ['A. 仅记住结论，不做推导', 'B. 能代入具体条件并检验', 'C. 与所学章节无关', 'D. 跳过验证直接下一题'],
      knowledgePoint: '选择·应用',
    },
  ];
}

function pickSubjectForExam(
  dash: ReturnType<typeof buildLearningProgressDashboard>,
  preferredId: string | null,
  hint: string,
) {
  if (preferredId) {
    const hit = dash.subjects.find((s) => s.id === preferredId);
    if (hit) return hit;
  }
  return (
    dash.subjects.find((s) => s.id === 'math') ??
    dash.subjects.find((s) => s.id === 'toefl') ??
    dash.subjects[0]
  );
}

function heuristicQuestions(
  subjectId: string,
  subjectName: string,
  profile?: ReturnType<typeof buildLearnerProfile>,
): AssessmentQuestion[] {
  const track = profile?.curriculumTrack;
  const prov = profile?.provinceOrRegion ?? '';
  const grade = profile?.gradeBand ?? '';

  if (track === 'cn_gaokao') {
    const regionTag = prov ? `${prov}·新课标` : '新课标';
    return [
      {
        id: 'q1',
        prompt: `【${subjectName}·${regionTag}】${grade}同步：给出一道与你当前进度匹配的选择或填空（写明考查知识点），并附简要解题思路要点。`,
        type: 'short',
        knowledgePoint: '省卷同步',
      },
      {
        id: 'q2',
        prompt: `【${subjectName}】错题归因：你最近一类高频失误是什么？用 3 步说明如何在下一次限时练中避免。`,
        type: 'short',
        knowledgePoint: '错题策略',
      },
      {
        id: 'q3',
        prompt: `【${subjectName}·限时 12 分钟】自拟 1 道中等难度解答题（含小问），并写出评分要点（自评用）。`,
        type: 'short',
        knowledgePoint: '限时模拟',
      },
    ];
  }

  if (track === 'intl_ib_ap') {
    return [
      {
        id: 'q1',
        prompt: `【${subjectName}·国际课程】说明你所用 syllabus（AP/IB/A-Level/校内）的本章核心概念，并给出一道非高考纲的单元测题。`,
        type: 'short',
        knowledgePoint: '国际单元',
      },
      {
        id: 'q2',
        prompt: `【${subjectName}】找一道你本周作业/练习中的错题，写出错因分类（概念/计算/审题/英文表述）。`,
        type: 'short',
        knowledgePoint: '错因',
      },
    ];
  }

  const base: AssessmentQuestion[] = [
    {
      id: 'q1',
      prompt: `【${subjectName}】用一句话说明你今天学过的核心概念，并举一个应用场景。`,
      type: 'short',
      knowledgePoint: '概念+应用',
    },
    {
      id: 'q2',
      prompt: `【${subjectName}】指出一个你仍不确定的知识点，并说明你会如何验证自己是否真的掌握。`,
      type: 'short',
      knowledgePoint: '元认知',
    },
  ];
  if (subjectId === 'toefl') {
    base.push({
      id: 'q3',
      prompt: '口语：用 45 秒回答 — What skill did you practice today and what mistake did you catch?',
      type: 'speaking_hint',
      knowledgePoint: '托福口语',
    });
  }
  if (subjectId === 'sat') {
    base.push({
      id: 'q3',
      prompt: 'SAT 阅读：若文章主旨是「技术进步改变学习方式」，作者最可能支持哪一观点？简述理由。',
      type: 'short',
      knowledgePoint: '阅读推断',
    });
  }
  return base;
}

function examAlignForProfile(
  subjectId: string,
  profile: ReturnType<typeof buildLearnerProfile>,
): string | null {
  if (!profile) return SUBJECT_EXAM_ALIGN[subjectId] ?? null;
  if (profile.curriculumTrack === 'cn_gaokao') {
    const p = profile.provinceOrRegion ? `${profile.provinceOrRegion}新高考` : '新高考';
    if (subjectId === 'math') return `${p}·数学`;
    if (subjectId === 'phys') return `${p}·物理`;
    if (subjectId === 'en') return `${p}·英语`;
    return p;
  }
  if (profile.curriculumTrack === 'intl_ib_ap') return 'AP/IB/A-Level';
  if (profile.curriculumTrack === 'intl_us_uk') {
    return SUBJECT_EXAM_ALIGN[subjectId] ?? 'TOEFL/IELTS/SAT';
  }
  return SUBJECT_EXAM_ALIGN[subjectId] ?? null;
}

/** 主动式评估出卷（对话指令 / 学习后自动 / 手动触发的统一内核） */
export async function generateActiveAssessmentPaper(
  userId: string,
  opts: {
    userHint?: string;
    learningContext?: string;
    source: 'chat' | 'post_learning' | 'manual';
    paperType?: AssessmentPaperType;
    focusDirectoryId?: string | null;
    subjectId?: string;
  },
): Promise<AssessmentPaperDto> {
  const uid = userId.trim();
  const profile = buildLearnerProfile(uid);
  const dash = buildLearningProgressDashboard(uid);
  const hint = opts.userHint?.trim() ?? '';
  const learningContext =
    opts.learningContext?.trim() ||
    hint ||
    '本轮学习内容（见最近归档）';
  const preferredId =
    opts.subjectId?.trim() ||
    (profile ? inferAssessmentSubjectId(hint || learningContext, profile.curriculumTrack) : null);

  const subject = pickSubjectForExam(dash, preferredId, hint);
  if (!subject) throw new Error('暂无分科数据，请先完成梦校航标与学业建档');

  const anchor = getSchoolAnchorProfile(uid);
  const plan = getMentorPlanView(uid);
  const review = getTodayDailyReview(uid);
  const weakP0 = review?.planCorrections?.find((c) => c.priority === 'P0');
  const profileBlock = profile ? formatLearnerProfileBlock(profile) : '';

  let questions: AssessmentQuestion[] = [];
  let title =
    opts.source === 'post_learning'
      ? `学完必考 · ${subject.name}`
      : `${subject.name} · 主动验收`;
  let activeIntro =
    '曦宝，有学必考——下面是我主动发的验收题，别用「大概懂了」糊弄过去。';

  if (resolveUserLlm(uid) || process.env.DEEPSEEK_API_KEY?.trim()) {
    try {
      const userPayload = [
        profileBlock ? `【学习者画像】\n${profileBlock}` : '',
        `科目：${subject.name}（${subject.id}）`,
        `梦校：${plan?.targetSchool ?? anchor?.school ?? '未锁定'}`,
        `当前进度：${subject.progressPct}%`,
        `【刚学完/学生意图】\n${learningContext}`,
        hint ? `学生原话：${hint}` : '',
        weakP0 ? `今日 P0：${weakP0.action}` : '',
        opts.source === 'post_learning'
          ? '触发：学习证据已入库，立即主动验收（有学必考）'
          : '触发：学生在对话中要求评估/出题',
      ]
        .filter(Boolean)
        .join('\n');

      const gw = await gatewayJsonCompletion<{
        title?: string;
        activeIntro?: string;
        questions?: AssessmentQuestion[];
      }>(
        uid,
        toLlmChatMessages(buildSandboxedLlmMessages({ userId: uid }, ACTIVE_GENERATE_SYSTEM, userPayload)),
        {
        traceId: `assessment_active_${uid}_${opts.source}`,
        maxTokens: 1200,
        temperature: 0.35,
        flatWarp: { cost: WARP_COST.CHAT_COMPLETION, reason: 'ASSESSMENT_ACTIVE' },
      });
      const raw = gw.chargeOk ? gw.data : null;
      if (raw?.questions && Array.isArray(raw.questions)) {
        title = sanitizeLlmOutput(String(raw.title ?? title), { userId: uid }).slice(0, 120);
        activeIntro = sanitizeLlmOutput(String(raw.activeIntro ?? activeIntro), { userId: uid }).slice(
          0,
          300,
        );
        questions = (raw.questions as AssessmentQuestion[]).slice(0, 6).map(normalizeQuestion);
      }
    } catch {
      questions = [];
    }
  }

  if (questions.length === 0) {
    questions = heuristicActiveQuestions(subject.name, learningContext, profile);
    if (profile?.curriculumTrack === 'cn_gaokao' && profile.provinceOrRegion === '湖南') {
      title = `湖南·${profile.gradeBand} · ${subject.name} · 学完必考`;
    }
  }

  const paperType: AssessmentPaperType =
    opts.paperType ??
    (opts.source === 'post_learning'
      ? 'post_learning_active'
      : opts.source === 'chat'
        ? 'chat_active'
        : 'adaptive_chat');

  const row = saveAssessmentPaper({
    userId: uid,
    subjectId: subject.id,
    subjectName: subject.name,
    paperType,
    examAlign: examAlignForProfile(subject.id, profile) ?? undefined,
    title,
    questions,
    mode: 'active',
    source: opts.source,
    learningContext,
    activeIntro,
  });

  return paperRowToDto(row);
}

/** 学习证据落库后：有学必考（主动式） */
export async function generatePostLearningActivePaper(
  userId: string,
  input: {
    kind: 'vision' | 'chat' | 'archive' | 'voice' | 'video';
    label?: string;
    excerpt?: string;
  },
): Promise<AssessmentPaperDto | null> {
  const uid = userId.trim();
  if (!getSchoolAnchorProfile(uid)?.school?.trim()) return null;

  const kindLabel =
    input.kind === 'vision'
      ? '试卷/影像'
      : input.kind === 'video'
        ? '视频学习'
        : input.kind === 'voice'
          ? '语音'
          : input.kind === 'chat'
            ? '对话'
            : '归档';
  const learningContext = [
    `学习类型：${kindLabel}`,
    input.label?.trim() ? `标题：${input.label.trim()}` : '',
    input.excerpt?.trim() ? `内容摘要：${input.excerpt.trim().slice(0, 500)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    return await generateActiveAssessmentPaper(uid, {
      learningContext,
      source: 'post_learning',
      paperType: 'post_learning_active',
    });
  } catch {
    return null;
  }
}

/** 对话触发的主动评估（兼容旧名） */
export async function generateAdaptiveAssessmentPaper(
  userId: string,
  opts?: { userHint?: string; focusDirectoryId?: string | null },
): Promise<AssessmentPaperDto> {
  return generateActiveAssessmentPaper(userId, {
    userHint: opts?.userHint,
    focusDirectoryId: opts?.focusDirectoryId,
    source: 'chat',
    paperType: 'chat_active',
  });
}

function heuristicEval(answers: Record<string, string>): Omit<AssessmentEvalDto, 'paperId' | 'baselineKey'> {
  const text = Object.values(answers).join(' ');
  const len = text.trim().length;
  const score = len > 200 ? 78 : len > 80 ? 62 : len > 20 ? 45 : 28;
  const eff = efficiencyFromScore(score);
  return {
    scorePct: score,
    masteryScore: score,
    efficiency: eff,
    efficiencyLabel: eff === 'high' ? '表达完整，可进入变式提速' : eff === 'mid' ? '有基础但证据不足' : '需回到定义与例题',
    strengths: len > 80 ? ['能组织语言描述学习收获'] : [],
    gaps: len < 80 ? ['作答过短，无法验证真实掌握'] : ['需更多可检验的推导或例题'],
    coachFeedback: '别用「差不多」糊弄评估，拿出可验证的推导或口播。',
    nextAction: '针对最弱知识点做 1 道变式题或 45 秒口语复述。',
  };
}

export function getAssessmentHub(userId: string): AssessmentHubDto {
  const uid = userId.trim();
  const dash = buildLearningProgressDashboard(uid);
  const baseline = getBaselineStatus(uid);
  const parsed = baseline ? parseBaseline(baseline) : null;
  const scores = parsed?.currentScores ?? {};

  const subjects: AssessmentSubjectDto[] = dash.subjects.map((s) => {
    const evalKey = Object.keys(scores).find((k) => k.includes(s.name) && k.includes('评估'));
    const lastScore = evalKey ? scores[evalKey] : null;
    let efficiency: AssessmentSubjectDto['efficiency'] = 'unknown';
    if (lastScore) {
      const n = Number(String(lastScore).replace(/\D/g, ''));
      efficiency = efficiencyFromScore(Number.isFinite(n) ? n : s.progressPct);
    }
    return {
      id: s.id,
      name: s.name,
      progressPct: s.progressPct,
      lastScore,
      efficiency,
    };
  });

  const papers = listAssessmentPapers(uid, 8);
  const today = new Date().toISOString().slice(0, 10);
  const dailyPapers = papers.filter((p) => p.paper_type === 'daily_kp' && p.created_at >= Math.floor(Date.now() / 1000) - 86400);
  const dailyKpDone = dailyPapers.filter((p) => p.status === 'reckoned').length;

  const review = getTodayDailyReview(uid);
  const pendingActive = countPendingActivePapers(uid);
  const pendingRow = papers.find(
    (p) =>
      p.status === 'ready' &&
      (p.paper_type === 'post_learning_active' || p.paper_type === 'chat_active'),
  );
  const coachLine =
    pendingActive > 0
      ? `有学必考：${pendingActive} 份主动验收卷待完成（问答题/填空题）`
      : review?.headline
        ? `今日复盘已就绪 · ${review.headline}`
        : '学完内容会自动生成主动验收卷；也可在对话中说「帮我评估」。';

  return {
    subjects,
    pendingActiveExams: pendingActive,
    pendingExamPaperId: pendingRow?.id ?? null,
    recentPapers: papers.map((p) => ({
      id: p.id,
      title: p.title,
      subjectName: p.subject_name,
      paperType: p.paper_type,
      scoreSummary: p.score_summary,
      efficiencyLabel: p.efficiency_label,
      at: p.created_at * 1000,
    })),
    dailyKpDone,
    dailyKpTotal: Math.max(3, dailyKpCount(uid)),
    coachLine,
  };
}

function dailyKpCount(uid: string): number {
  const books = listTextbooksForUser(uid);
  const kps: string[] = [];
  for (const b of books.slice(0, 2)) {
    const ch = parseTextbookOutline(b).find((c) => c.index === (b.progress_chapter ?? 1));
    kps.push(...(ch?.knowledgePoints ?? []).slice(0, 2));
  }
  const baseline = getBaselineStatus(uid);
  const weak = baseline ? parseBaseline(baseline).weakSubjects : [];
  return Math.min(5, Math.max(3, kps.length + Math.min(2, weak.length)));
}

export async function generateSubjectPaper(
  userId: string,
  input: { subjectId: string; paperType?: 'subject_unit' | 'daily_kp' },
): Promise<AssessmentPaperDto> {
  const uid = userId.trim();
  const dash = buildLearningProgressDashboard(uid);
  const subject = dash.subjects.find((s) => s.id === input.subjectId) ?? dash.subjects[0];
  if (!subject) throw new Error('暂无分科数据，请先完成学业建档');

  const anchor = getSchoolAnchorProfile(uid);
  const plan = getMentorPlanView(uid);
  const review = getTodayDailyReview(uid);
  const weakP0 = review?.planCorrections?.find((c) => c.priority === 'P0');
  const profile = buildLearnerProfile(uid);
  const profileBlock = profile ? formatLearnerProfileBlock(profile) : '';

  let questions: AssessmentQuestion[] = [];
  let title = `${subject.name} · 掌握度评估`;

  if (resolveUserLlm(uid) || process.env.DEEPSEEK_API_KEY?.trim()) {
    try {
      const genUser = [
        profileBlock ? `【学习者画像】\n${profileBlock}` : '',
        `科目：${subject.name}（${subject.id}）`,
        `梦校：${plan?.targetSchool ?? anchor?.school ?? '未锁定'}`,
        `当前进度：${subject.progressPct}%`,
        weakP0 ? `今日 P0：${weakP0.action}` : '',
        input.paperType === 'daily_kp' ? '类型：今日知识点快测（3题）' : '类型：分科单元评估（4题）',
      ]
        .filter(Boolean)
        .join('\n');

      const gw = await gatewayJsonCompletion<{ title?: string; questions?: AssessmentQuestion[] }>(
        uid,
        toLlmChatMessages(buildSandboxedLlmMessages({ userId: uid }, GENERATE_SYSTEM, genUser)),
        {
        traceId: `assessment_gen_${uid}`,
        maxTokens: 900,
        temperature: 0.35,
        flatWarp: { cost: WARP_COST.CHAT_COMPLETION, reason: 'ASSESSMENT_GENERATE' },
      });
      const raw = gw.chargeOk ? gw.data : null;
      if (raw?.questions && Array.isArray(raw.questions)) {
        title = sanitizeLlmOutput(String(raw.title ?? title), { userId: uid }).slice(0, 120);
        questions = (raw.questions as AssessmentQuestion[]).slice(0, 6).map((q, i) => ({
          id: String(q.id ?? `q${i + 1}`),
          prompt: sanitizeLlmOutput(String(q.prompt ?? ''), { userId: uid }).slice(0, 500),
          type: q.type === 'choice' || q.type === 'speaking_hint' ? q.type : 'short',
          options: Array.isArray(q.options) ? q.options.map(String).slice(0, 5) : undefined,
          knowledgePoint: q.knowledgePoint ? String(q.knowledgePoint).slice(0, 80) : undefined,
        }));
      }
    } catch {
      questions = [];
    }
  }

  if (questions.length === 0) {
    questions = heuristicQuestions(subject.id, subject.name, profile);
  }

  const row = saveAssessmentPaper({
    userId: uid,
    subjectId: subject.id,
    subjectName: subject.name,
    paperType: input.paperType ?? 'subject_unit',
    examAlign: examAlignForProfile(subject.id, profile) ?? undefined,
    title,
    questions,
  });

  return paperRowToDto(row);
}

export async function generateDailyKpPaper(userId: string): Promise<AssessmentPaperDto> {
  const uid = userId.trim();
  const books = listTextbooksForUser(uid);
  const baseline = getBaselineStatus(uid);
  const weak = baseline ? parseBaseline(baseline).weakSubjects : [];
  const review = getTodayDailyReview(uid);
  const p0 = review?.planCorrections?.filter((c) => c.priority === 'P0') ?? [];

  const questions: AssessmentQuestion[] = [];
  for (const b of books.slice(0, 2)) {
    const ch = parseTextbookOutline(b).find((c) => c.index === (b.progress_chapter ?? 1));
    for (const kp of (ch?.knowledgePoints ?? []).slice(0, 2)) {
      questions.push({
        id: `kp-${questions.length + 1}`,
        prompt: `【${b.subject ?? '综合'}】解释「${kp}」并说明它与当前章节「${ch?.title ?? ''}」的关系。`,
        type: 'short',
        knowledgePoint: kp,
      });
    }
  }
  for (const w of weak.slice(0, 2)) {
    questions.push({
      id: `weak-${questions.length + 1}`,
      prompt: `【薄弱项·${w}】用 2-3 句话说明你今天针对它的学习动作与仍存在的卡点。`,
      type: 'short',
      knowledgePoint: w,
    });
  }
  for (const c of p0.slice(0, 1)) {
    questions.push({
      id: `p0-${questions.length + 1}`,
      prompt: `【今日 P0·${c.subjectName}】${c.action} — 你完成了什么？证据是什么？`,
      type: 'short',
      knowledgePoint: c.subjectName,
    });
  }

  const finalQ = questions.length >= 3 ? questions.slice(0, 5) : heuristicQuestions('gpa', '综合');
  const row = saveAssessmentPaper({
    userId: uid,
    subjectId: 'daily',
    subjectName: '今日知识点',
    paperType: 'daily_kp',
    title: `今日知识点评测 · ${new Date().toISOString().slice(0, 10)}`,
    questions: finalQ,
  });
  return paperRowToDto(row);
}

function paperRowToDto(row: NonNullable<ReturnType<typeof getAssessmentPaper>>): AssessmentPaperDto {
  const payload = parsePaperPayload(row);
  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    paperType: row.paper_type,
    examAlign: row.exam_align,
    title: row.title,
    questions: payload.questions,
    status: row.status,
    assessmentMode: payload.mode,
    activeIntro: payload.activeIntro,
    source: payload.source,
  };
}

export async function submitAssessmentPaper(
  userId: string,
  input: { paperId: string; answers: Record<string, string> },
): Promise<AssessmentEvalDto> {
  const uid = userId.trim();
  const paper = getAssessmentPaper(input.paperId);
  if (!paper || paper.user_id !== uid) throw new Error('试卷不存在');
  const payload = parsePaperPayload(paper);
  const questions = payload.questions;

  let evalBody: Omit<AssessmentEvalDto, 'paperId' | 'baselineKey'> = heuristicEval(input.answers);

  if (resolveUserLlm(uid) || process.env.DEEPSEEK_API_KEY?.trim()) {
    try {
      const qa = questions
        .map((q) => `Q[${q.id}] ${q.prompt}\nA: ${input.answers[q.id] ?? '（未答）'}`)
        .join('\n\n');
      const gw = await gatewayJsonCompletion<Record<string, unknown>>(
        uid,
        toLlmChatMessages(buildSandboxedLlmMessages(
          { userId: uid },
          EVAL_SYSTEM,
          `科目：${paper.subject_name}\n试卷：${paper.title}\n\n${qa}`,
        )),
        {
        traceId: `assessment_eval_${uid}`,
        maxTokens: 700,
        temperature: 0.3,
        flatWarp: { cost: WARP_COST.LANGUAGE_EVAL, reason: 'ASSESSMENT_EVAL' },
      });
      const raw = gw.chargeOk ? gw.data : null;
      if (raw) {
        const scorePct = Math.max(0, Math.min(100, Math.round(Number(raw.scorePct ?? raw.score_pct ?? 0))));
        const masteryScore = Math.max(
          0,
          Math.min(100, Math.round(Number(raw.masteryScore ?? raw.mastery_score ?? scorePct))),
        );
        const eff = String(raw.efficiency ?? 'mid') as 'high' | 'mid' | 'low';
        evalBody = {
          scorePct: scorePct || evalBody.scorePct,
          masteryScore: masteryScore || evalBody.masteryScore,
          efficiency: ['high', 'mid', 'low'].includes(eff) ? eff : efficiencyFromScore(scorePct),
          efficiencyLabel: String(raw.efficiencyLabel ?? raw.efficiency_label ?? evalBody.efficiencyLabel).slice(0, 80),
          strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String).slice(0, 3) : evalBody.strengths,
          gaps: Array.isArray(raw.gaps) ? raw.gaps.map(String).slice(0, 3) : evalBody.gaps,
          coachFeedback: String(raw.coachFeedback ?? raw.coach_feedback ?? evalBody.coachFeedback).slice(0, 200),
          nextAction: String(raw.nextAction ?? raw.next_action ?? evalBody.nextAction).slice(0, 200),
        };
      }
    } catch {
      /* heuristic */
    }
  }

  const baselineKey = `${paper.subject_name}·评估`;
  const scoreSummary = `${evalBody.scorePct}% · ${evalBody.efficiencyLabel}`;

  saveAssessmentAttempt({
    paperId: paper.id,
    userId: uid,
    answers: input.answers,
    scorePct: evalBody.scorePct,
    masteryScore: evalBody.masteryScore,
    evalBody: evalBody as unknown as Record<string, unknown>,
  });

  updateAssessmentPaperResult(paper.id, {
    status: 'reckoned',
    scoreSummary,
    efficiencyLabel: evalBody.efficiencyLabel,
  });

  applyStructuredBaseline(uid, {
    scores: {
      [baselineKey]: scoreSummary,
      最近评估: new Date().toISOString().slice(0, 10),
    },
    weakSubjects: evalBody.gaps.slice(0, 3),
  });

  getOrCreateDailyReview(uid, { force: true });

  recordEvolutionMilestone({
    userId: uid,
    battle: 'AP_KNOWLEDGE_FORGE',
    description: `学习评估 · ${paper.subject_name} · ${scoreSummary}`,
    amountHint: evalBody.scorePct,
  });

  let learningPathSummary: string | undefined;
  try {
    const pathDoc = await replanLearningPathAfterAssessment(uid, {
      subjectId: paper.subject_id,
      subjectName: paper.subject_name,
      scorePct: evalBody.scorePct,
      gaps: evalBody.gaps,
      strengths: evalBody.strengths,
    });
    learningPathSummary = formatLearningPathChatSummary(pathDoc);
  } catch {
    /* 路径重排失败不阻断交卷 */
  }

  return {
    paperId: paper.id,
    baselineKey,
    ...evalBody,
    learningPathSummary,
  };
}

export function getAssessmentPaperDto(paperId: string, userId: string): AssessmentPaperDto | null {
  const row = getAssessmentPaper(paperId);
  if (!row || row.user_id !== userId.trim()) return null;
  return paperRowToDto(row);
}
