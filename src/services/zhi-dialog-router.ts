/**
 * ZHI 对话意图路由：抓取需求 → 直接执行（评估 / 视频 / 知识点菜单 / 路径）
 */

import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { listTextbooksForUser, parseTextbookOutline } from '../db/zhi-textbook-catalog-schema';
import { buildLearnerProfile, type CurriculumTrack } from './learner-profile';
import {
  inferAssessmentSubjectId,
  isAssessmentRequest,
  isPathPlanningRequest,
} from './zhi-chat-intent';
import { generateActiveAssessmentPaper } from './zhi-learning-assessment';
import {
  ensureLearningPath,
  formatLearningPathChatSummary,
  getLearningPath,
} from './learning-path-engine';
import { aggregateLearnerEvidence } from './learner-evidence-hub';
import { matchCoursewareForUser } from './zhi-courseware-matcher';
import { generateAdaptiveExamPaper } from './zhi-quiz-generator';
export type DialogActivatedTool =
  | 'METRICS_INPUT'
  | 'VISION_INTERCEPT'
  | 'LEARNING_ASSESSMENT'
  | 'LEARNING_PATH'
  | 'VIDEO_LEARN'
  | 'NONE';

export type DialogExecutionResult = {
  zhiOpening: string;
  activatedTool: DialogActivatedTool;
  zhiTip: string;
  zhiCoachNote: string;
  challengeIndex: number;
  targetSchool: string;
  warpPointsRemaining: number;
  warpDeducted: number;
  assessmentPaperId?: string;
  assessmentSubjectId?: string;
  videoUrl?: string;
  videoTitle?: string;
  dialogQuickActions?: DialogQuickAction[];
};

export type DialogQuickAction = {
  id: string;
  label: string;
  toolId: 'learning-assessment' | 'video-learn' | 'learning-path' | 'vision-intercept';
  replyToken?: string;
  assessmentSubjectId?: string;
  assessmentPaperId?: string;
  videoUrl?: string;
  videoTitle?: string;
};

export type DialogIntentKind =
  | 'comprehensive_assessment'
  | 'subject_assessment'
  | 'adaptive_exam'
  | 'subject_video'
  | 'subject_knowledge_menu'
  | 'subject_weak_bundle'
  | 'numeric_choice'
  | 'learning_path'
  | 'none';

export type DialogIntent = {
  kind: DialogIntentKind;
  subjectId: string | null;
  subjectName: string | null;
  choiceNumber?: number;
  raw: string;
};

const SUBJECT_NAMES: Record<string, string> = {
  math: '数学',
  phys: '物理',
  chem: '化学',
  en: '英语',
  toefl: '标化',
  sat: 'SAT',
  ap: 'AP',
  algo: '算法',
  essay: '文书',
  gpa: '综合',
};

const WEAK_SUBJECT_RE =
  /(?:数学|物理|化学|英语|托福|雅思|SAT|AP|算法|语文).{0,8}(?:比较差|较弱|很弱|薄弱|不行|不好|拖后腿|差劲|烂|弱)|(?:比较差|较弱|很弱|薄弱|不行|不好|拖后腿|差劲|烂|弱).{0,8}(?:数学|物理|化学|英语)/i;

const COMPREHENSIVE_RE =
  /整体|全面|全科|系统.{0,6}评估|做一次.{0,6}评估|帮我.{0,8}评估|重新.{0,4}评估|摸底一下/i;

const VIDEO_RE = /视频|网课|讲解|看课|B站|bilibili|youtube|微课/i;

const KNOWLEDGE_MENU_RE =
  /知识点|知识系统|知识体系|归纳|梳理|列出来|列个清单|清单|让我选|你来选|选一个|选哪个/i;

const PAPER_RE = /出.{0,4}卷|设计.{0,6}试卷|一套题|考题/i;
const EXAM_BUNDLE_RE = /模考|大卷|套卷|整套|模拟卷|真题卷|压轴卷|冲刺卷/i;

const NUMERIC_CHOICE_RE = /^选?\s*([1-3])\s*[。.!]?$/;

/** 明确要「路径/时间轴」而非「知识点清单」 */
const EXPLICIT_PATH_PLAN_RE =
  /学习路径|路径规划|时间轴|阶段计划|里程碑|梦校路径|学习规划|制定计划|复习计划|备考计划/i;

export function resolveDialogIntent(text: string, curriculumTrack: CurriculumTrack): DialogIntent {
  const t = text.trim();
  const subjectId = inferAssessmentSubjectId(t, curriculumTrack);
  const subjectName = subjectId ? (SUBJECT_NAMES[subjectId] ?? subjectId) : null;

  const choiceM = NUMERIC_CHOICE_RE.exec(t);
  if (choiceM) {
    return {
      kind: 'numeric_choice',
      subjectId: subjectId ?? 'math',
      subjectName: subjectName ?? '数学',
      choiceNumber: Number(choiceM[1]),
      raw: t,
    };
  }

  if (COMPREHENSIVE_RE.test(t) || (isAssessmentRequest(t) && /整体|全面|全科|系统/.test(t))) {
    return {
      kind: 'comprehensive_assessment',
      subjectId: subjectId ?? (curriculumTrack === 'cn_gaokao' ? 'math' : 'toefl'),
      subjectName: subjectName ?? (curriculumTrack === 'cn_gaokao' ? '数学' : '标化'),
      raw: t,
    };
  }

  if (EXAM_BUNDLE_RE.test(t) && (WEAK_SUBJECT_RE.test(t) || /短板|薄弱|错题|针对/.test(t) || Boolean(subjectId))) {
    const sid = subjectId ?? (curriculumTrack === 'cn_gaokao' ? 'math' : 'toefl');
    return { kind: 'adaptive_exam', subjectId: sid, subjectName: SUBJECT_NAMES[sid] ?? sid, raw: t };
  }

  if (WEAK_SUBJECT_RE.test(t) || (subjectId && /差|弱|不行|不好|薄弱|拖后腿/.test(t))) {
    const sid = subjectId ?? inferAssessmentSubjectId(t, curriculumTrack) ?? 'math';
    if (VIDEO_RE.test(t) && !PAPER_RE.test(t) && !isAssessmentRequest(t)) {
      return { kind: 'subject_video', subjectId: sid, subjectName: SUBJECT_NAMES[sid] ?? sid, raw: t };
    }
    if (KNOWLEDGE_MENU_RE.test(t) && !isAssessmentRequest(t) && !PAPER_RE.test(t)) {
      return { kind: 'subject_knowledge_menu', subjectId: sid, subjectName: SUBJECT_NAMES[sid] ?? sid, raw: t };
    }
    if (isAssessmentRequest(t) || PAPER_RE.test(t)) {
      return { kind: 'subject_assessment', subjectId: sid, subjectName: SUBJECT_NAMES[sid] ?? sid, raw: t };
    }
    return { kind: 'subject_weak_bundle', subjectId: sid, subjectName: SUBJECT_NAMES[sid] ?? sid, raw: t };
  }

  if (VIDEO_RE.test(t) && subjectId) {
    return { kind: 'subject_video', subjectId, subjectName, raw: t };
  }

  if (VIDEO_RE.test(t) && !subjectId && !isAssessmentRequest(t) && !PAPER_RE.test(t)) {
    const sid = curriculumTrack === 'cn_gaokao' ? 'math' : 'toefl';
    return { kind: 'subject_video', subjectId: sid, subjectName: SUBJECT_NAMES[sid] ?? sid, raw: t };
  }

  if (
    PAPER_RE.test(t) &&
    !isPathPlanningRequest(t) &&
    !EXPLICIT_PATH_PLAN_RE.test(t) &&
    !COMPREHENSIVE_RE.test(t)
  ) {
    const sid = subjectId ?? (curriculumTrack === 'cn_gaokao' ? 'math' : 'toefl');
    return { kind: 'subject_assessment', subjectId: sid, subjectName: SUBJECT_NAMES[sid] ?? sid, raw: t };
  }

  if (
    KNOWLEDGE_MENU_RE.test(t) &&
    !EXPLICIT_PATH_PLAN_RE.test(t) &&
    !isAssessmentRequest(t) &&
    !PAPER_RE.test(t)
  ) {
    const sid = subjectId ?? (curriculumTrack === 'cn_gaokao' ? 'math' : 'toefl');
    return { kind: 'subject_knowledge_menu', subjectId: sid, subjectName: SUBJECT_NAMES[sid] ?? sid, raw: t };
  }

  if (isAssessmentRequest(t) && !isPathPlanningRequest(t)) {
    return {
      kind: 'subject_assessment',
      subjectId: subjectId ?? (curriculumTrack === 'cn_gaokao' ? 'math' : 'toefl'),
      subjectName: subjectName ?? '综合',
      raw: t,
    };
  }

  return { kind: 'none', subjectId, subjectName, raw: t };
}

function collectKnowledgePoints(
  userId: string,
  subjectId: string,
): Array<{ index: number; title: string; source: string }> {
  const out: Array<{ index: number; title: string; source: string }> = [];
  const path = getLearningPath(userId);
  if (path) {
    for (const p of path.phases) {
      for (const u of p.knowledgeUnits) {
        if (u.subjectId === subjectId || subjectId === 'gpa') {
          out.push({ index: 0, title: u.title, source: `路径·${p.phase}` });
        }
      }
    }
  }
  const evidence = aggregateLearnerEvidence(userId);
  for (const w of evidence.weaknesses) {
    if (w.subjectId === subjectId) {
      out.push({ index: 0, title: w.title, source: '短板证据' });
    }
  }
  const books = listTextbooksForUser(userId);
  for (const b of books) {
    const subj = b.subject?.includes('数') ? 'math' : 'gpa';
    if (subj !== subjectId && subjectId !== 'math') continue;
    const ch = parseTextbookOutline(b).find((c) => c.index === (b.progress_chapter ?? 1));
    for (const kp of (ch?.knowledgePoints ?? []).slice(0, 4)) {
      out.push({ index: 0, title: kp, source: `${b.title}` });
    }
  }
  const seen = new Set<string>();
  const deduped: typeof out = [];
  for (const item of out) {
    const key = item.title.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...item, index: deduped.length + 1 });
  }
  return deduped.slice(0, 8);
}

function formatKnowledgeMenu(subjectName: string, points: ReturnType<typeof collectKnowledgePoints>): string {
  if (!points.length) {
    return `${subjectName} 知识点清单暂空：先做一次评估或拍教材目录，我会自动归纳。`;
  }
  const lines = points.map((p) => `  ${p.index}. ${p.title}（${p.source}）`);
  return [`【${subjectName} · 知识点清单】`, ...lines, '', '回复数字选择下一步：', '  【1】立刻出验收卷', '  【2】匹配视频课开讲', '  【3】打开梦校学习路径'].join(
    '\n',
  );
}

function pickVideoMatch(userId: string, subjectId: string, hint: string) {
  const pack = matchCoursewareForUser(userId, 8);
  const subjectTag =
    subjectId === 'math'
      ? /数学|代数|函数|几何/
      : subjectId === 'phys'
        ? /物理|力学|电磁/
        : subjectId === 'en' || subjectId === 'toefl'
          ? /英语|托福|雅思|阅读/
          : new RegExp(SUBJECT_NAMES[subjectId] ?? '数学');
  const filtered = pack.matches.filter(
    (m) =>
      subjectTag.test(m.courseware.title) ||
      m.courseware.topicTags.some((t) => subjectTag.test(t)) ||
      m.coveredNeeds.some((n) => subjectTag.test(n)),
  );
  const top = filtered[0] ?? pack.matches[0];
  if (!top) return null;
  return {
    url: top.courseware.sourceUrl,
    title: top.courseware.title,
    score: top.matchScore,
    reasons: top.matchReasons.join('；'),
  };
}

function defaultQuickActions(subjectId: string, subjectName: string): DialogQuickAction[] {
  return [
    {
      id: 'dq-1',
      label: `1 · ${subjectName}验收卷`,
      toolId: 'learning-assessment',
      replyToken: '1',
      assessmentSubjectId: subjectId,
    },
    {
      id: 'dq-2',
      label: `2 · ${subjectName}视频课`,
      toolId: 'video-learn',
      replyToken: '2',
    },
    {
      id: 'dq-3',
      label: '3 · 学习路径',
      toolId: 'learning-path',
      replyToken: '3',
    },
  ];
}

export async function executeDialogIntent(
  userId: string,
  intent: DialogIntent,
  ctx: {
    targetSchool: string;
    challengeIndex: number;
    warpRemaining: number;
    focusDirectoryId?: string | null;
    userHint: string;
  },
): Promise<DialogExecutionResult | null> {
  const uid = userId.trim();
  if (intent.kind === 'none') return null;

  const anchor = getSchoolAnchorProfile(uid);
  if (!anchor?.school?.trim() && intent.kind !== 'numeric_choice') {
    return {
      zhiOpening: '曦宝，先锁定梦校航标（院校/年级/入学时间），我才能对口出卷、排视频和知识点。',
      activatedTool: 'NONE',
      zhiTip: '打开「梦校航标」30 秒填完，再说一次你的需求。',
      zhiCoachNote: '',
      challengeIndex: ctx.challengeIndex,
      targetSchool: ctx.targetSchool,
      warpPointsRemaining: ctx.warpRemaining,
      warpDeducted: 0,
      dialogQuickActions: [],
    };
  }

  const sid = intent.subjectId ?? 'math';
  const sname = intent.subjectName ?? SUBJECT_NAMES[sid] ?? '综合';

  if (intent.kind === 'numeric_choice' && intent.choiceNumber) {
    if (intent.choiceNumber === 1) {
      return executeDialogIntent(
        uid,
        { kind: 'subject_assessment', subjectId: sid, subjectName: sname, raw: ctx.userHint },
        ctx,
      );
    }
    if (intent.choiceNumber === 2) {
      return executeDialogIntent(
        uid,
        { kind: 'subject_video', subjectId: sid, subjectName: sname, raw: ctx.userHint },
        ctx,
      );
    }
    if (intent.choiceNumber === 3) {
      return executeDialogIntent(
        uid,
        { kind: 'learning_path', subjectId: sid, subjectName: sname, raw: ctx.userHint },
        ctx,
      );
    }
  }

  if (intent.kind === 'learning_path') {
    try {
      const doc = await ensureLearningPath(uid);
      return {
        zhiOpening: `曦宝，梦校学习路径已就绪。\n\n${formatLearningPathChatSummary(doc).slice(0, 900)}`,
        activatedTool: 'LEARNING_PATH',
        zhiTip: '按时间轴执行；每个知识点学完要验收。',
        zhiCoachNote: doc.todayFocus ? `今日：${doc.todayFocus.title}` : '',
        challengeIndex: doc.challengeIndex,
        targetSchool: doc.targetSchool,
        warpPointsRemaining: ctx.warpRemaining,
        warpDeducted: 0,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : '路径不可用';
      return {
        zhiOpening: `曦宝，路径生成失败：${msg}`,
        activatedTool: 'NONE',
        zhiTip: '先完成梦校航标。',
        zhiCoachNote: '',
        challengeIndex: ctx.challengeIndex,
        targetSchool: ctx.targetSchool,
        warpPointsRemaining: ctx.warpRemaining,
        warpDeducted: 0,
      };
    }
  }

  if (
    intent.kind === 'comprehensive_assessment' ||
    intent.kind === 'subject_assessment'
  ) {
    try {
      const hint =
        intent.kind === 'comprehensive_assessment'
          ? `整体摸底评估·${ctx.userHint}`
          : `${sname}薄弱专项评估·${ctx.userHint}`;
      const paper = await generateActiveAssessmentPaper(uid, {
        userHint: hint,
        focusDirectoryId: ctx.focusDirectoryId,
        source: 'chat',
        paperType: 'chat_active',
        subjectId: sid,
      });
      const profile = buildLearnerProfile(uid);
      return {
        zhiOpening:
          paper.activeIntro ||
          `曦宝，已按【${profile?.curriculumLabel ?? '你的课程轨'}】生成${intent.kind === 'comprehensive_assessment' ? '整体摸底' : sname}验收卷「${paper.title}」（${paper.questions.length} 题）。现在作答，别拖。`,
        activatedTool: 'LEARNING_ASSESSMENT',
        zhiTip: '卷已在「学习评估」打开；交卷后自动重排路径与短板。',
        zhiCoachNote: paper.examAlign ? `卷型：${paper.examAlign}` : '',
        challengeIndex: ctx.challengeIndex,
        targetSchool: ctx.targetSchool,
        warpPointsRemaining: ctx.warpRemaining,
        warpDeducted: 0,
        assessmentPaperId: paper.id,
        assessmentSubjectId: paper.subjectId,
        dialogQuickActions: [
          {
            id: 'open-paper',
            label: '▶ 开始答题',
            toolId: 'learning-assessment',
            assessmentSubjectId: paper.subjectId,
          },
        ],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : '出卷失败';
      return {
        zhiOpening: `曦宝，出卷失败：${msg}`,
        activatedTool: 'LEARNING_ASSESSMENT',
        zhiTip: '补全航标与就读地后重试，或点下方「学习评估」手动出卷。',
        zhiCoachNote: '',
        challengeIndex: ctx.challengeIndex,
        targetSchool: ctx.targetSchool,
        warpPointsRemaining: ctx.warpRemaining,
        warpDeducted: 0,
      };
    }
  }

  if (intent.kind === 'adaptive_exam') {
    const evidence = aggregateLearnerEvidence(uid);
    const weak = evidence.weaknesses
      .filter((w) => (intent.subjectId ? w.subjectId === intent.subjectId : true))
      .slice(0, 10)
      .map((w) => w.title);
    if (weak.length === 0) {
      return {
        zhiOpening: `曦宝，要裂变模考卷我需要“短板基因”。先做一次评估或拍一张错题/试卷页，我才能按缺口生成高辨析大卷。`,
        activatedTool: 'LEARNING_ASSESSMENT',
        zhiTip: '点「学习评估」先做一次摸底，或用 + 发试卷/错题页。',
        zhiCoachNote: '',
        challengeIndex: ctx.challengeIndex,
        targetSchool: ctx.targetSchool,
        warpPointsRemaining: ctx.warpRemaining,
        warpDeducted: 0,
      };
    }
    const sid = intent.subjectId ?? 'math';
    const paper = await generateAdaptiveExamPaper({
      userId: uid,
      subjectId: sid,
      weakPoints: weak,
      questionCount: 20,
      difficulty: 'hard',
      userHint: ctx.userHint,
    });
    return {
      zhiOpening: `曦宝，已按短板基因裂变生成「${paper.title}」。现在直接开考，做完立刻交卷，我会按结果重排路径与短板。`,
      activatedTool: 'LEARNING_ASSESSMENT',
      zhiTip: '卷已在「学习评估」打开；不许跳过验收。',
      zhiCoachNote: weak[0] ? `短板优先：${weak[0]}` : '',
      challengeIndex: ctx.challengeIndex,
      targetSchool: ctx.targetSchool,
      warpPointsRemaining: ctx.warpRemaining,
      warpDeducted: 0,
      assessmentPaperId: paper.paperId,
      assessmentSubjectId: paper.subjectId,
      dialogQuickActions: [
        {
          id: 'open-adaptive-exam',
          label: '▶ 立即开考',
          toolId: 'learning-assessment',
          assessmentSubjectId: paper.subjectId,
          assessmentPaperId: paper.paperId,
        },
      ],
    };
  }

  if (intent.kind === 'subject_video') {
    const video = pickVideoMatch(uid, sid, ctx.userHint);
    if (!video?.url) {
      return {
        zhiOpening: `曦宝，${sname}类视频暂未匹配到库内课件。你可以粘贴 B 站/YouTube 链接，或先做验收卷让我知道弱在哪。`,
        activatedTool: 'LEARNING_ASSESSMENT',
        zhiTip: '回复【1】出卷 或 粘贴视频链接',
        zhiCoachNote: '',
        challengeIndex: ctx.challengeIndex,
        targetSchool: ctx.targetSchool,
        warpPointsRemaining: ctx.warpRemaining,
        warpDeducted: 0,
        dialogQuickActions: defaultQuickActions(sid, sname),
      };
    }
    return {
      zhiOpening: `曦宝，按你的${sname}短板，我已匹配课件「${video.title}」（匹配度 ${video.score}%）。\n${video.reasons}\n\n正在打开视频学习。`,
      activatedTool: 'VIDEO_LEARN',
      zhiTip: '看完卡点章节后回复「帮我评估」验收。',
      zhiCoachNote: '有学必考',
      challengeIndex: ctx.challengeIndex,
      targetSchool: ctx.targetSchool,
      warpPointsRemaining: ctx.warpRemaining,
      warpDeducted: 0,
      videoUrl: video.url,
      videoTitle: video.title,
      dialogQuickActions: [
        {
          id: 'play-video',
          label: `▶ 播放：${video.title.slice(0, 16)}`,
          toolId: 'video-learn',
          videoUrl: video.url,
          videoTitle: video.title,
        },
        {
          id: 'after-video-assess',
          label: '考完验收',
          toolId: 'learning-assessment',
          assessmentSubjectId: sid,
        },
      ],
    };
  }

  if (intent.kind === 'subject_knowledge_menu' || intent.kind === 'subject_weak_bundle') {
    const points = collectKnowledgePoints(uid, sid);
    const menuText = formatKnowledgeMenu(sname, points);
    const video = intent.kind === 'subject_weak_bundle' ? pickVideoMatch(uid, sid, ctx.userHint) : null;

    let opening = `曦宝，${sname}这条线我接住了。${intent.kind === 'subject_weak_bundle' ? '短板不能只靠感觉，要选可验证的动作。' : ''}\n\n${menuText}`;

    if (intent.kind === 'subject_weak_bundle' && video?.url) {
      opening += `\n\n（已备好匹配视频「${video.title}」，回复【2】立即播放）`;
    }

    return {
      zhiOpening: opening,
      activatedTool: intent.kind === 'subject_weak_bundle' ? 'LEARNING_ASSESSMENT' : 'LEARNING_PATH',
      zhiTip: '直接回复 1 / 2 / 3，或点下方快捷钮。',
      zhiCoachNote: points[0] ? `建议先攻：${points[0].title}` : '',
      challengeIndex: ctx.challengeIndex,
      targetSchool: ctx.targetSchool,
      warpPointsRemaining: ctx.warpRemaining,
      warpDeducted: 0,
      dialogQuickActions: defaultQuickActions(sid, sname).map((a) =>
        a.id === 'dq-2' && video
          ? { ...a, videoUrl: video.url, videoTitle: video.title }
          : a,
      ),
    };
  }

  return null;
}
