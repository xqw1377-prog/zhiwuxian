/**
 * ZHI · 智者主动规划（时间节点 × 能力 × 课程 × 知识点 × 学后评估）
 * 用户不补充数据时：主动追问 + 可自动出系统评估卷
 */

import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import {
  countPendingActivePapers,
  listAssessmentPapers,
} from '../db/zhi-assessment-schema';
import { listTextbooksForUser, parseTextbookOutline } from '../db/zhi-textbook-catalog-schema';
import type { LearningPathDocument } from '../db/learning-path-schema';
import {
  aggregateLearnerEvidence,
  type LearnerEvidencePack,
  type PathPushAction,
} from './learner-evidence-hub';
import {
  ensureLearningPath,
  formatLearningPathChatSummary,
  getLearningPath,
  type LearningPathDto,
} from './learning-path-engine';
import { buildLearnerProfile } from './learner-profile';
import { generateActiveAssessmentPaper } from './zhi-learning-assessment';
export type MastermindScene = 'session_open' | 'anchor_wake' | 'return_visit' | 'daily_review';

export type MastermindSection = { title: string; body: string };

export type ScheduleBlockType = 'study' | 'assess' | 'evidence' | 'rest';

export type MastermindScheduleBlock = {
  time: string;
  title: string;
  type: ScheduleBlockType;
  subjectId?: string;
  minutes: number;
};

export type MastermindDayPlan = {
  date: string;
  label: string;
  blocks: MastermindScheduleBlock[];
};

export type MastermindCourseBlock = {
  subjectName: string;
  subjectId: string;
  chapter: string;
  knowledgePoints: string[];
  minutes: number;
  reason: string;
};

export type MastermindDataRequest = {
  id: string;
  prompt: string;
  why: string;
  kind: PathPushAction['kind'];
};

export type MastermindPlan = {
  headline: string;
  sections: MastermindSection[];
  weeklySchedule: MastermindDayPlan[];
  courseBlocks: MastermindCourseBlock[];
  postAssessment: { dueDate: string; subjectId: string; subjectName: string; reason: string };
  dataRequests: MastermindDataRequest[];
  evidence: LearnerEvidencePack;
  path: LearningPathDocument | null;
  shouldAutoAssess: boolean;
  recommendedTool: 'VISION_INTERCEPT' | 'LEARNING_ASSESSMENT' | 'LEARNING_PATH' | 'METRICS_INPUT' | 'NONE';
  primaryQuestion: string;
};

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(n: number): Date {
  return new Date(Date.now() + n * 86400000);
}

function dayLabel(offset: number): string {
  if (offset === 0) return '今天';
  if (offset === 1) return '明天';
  return `${offset}天后`;
}

function daysSinceLastAssessment(userId: string): number {
  const papers = listAssessmentPapers(userId, 15).filter((p) => p.status === 'reckoned');
  if (!papers.length) return 999;
  const latest = Math.max(...papers.map((p) => p.created_at ?? 0));
  return (Date.now() / 1000 - latest) / 86400000;
}

function buildCourseBlocks(
  userId: string,
  path: LearningPathDocument | null,
  evidence: LearnerEvidencePack,
): MastermindCourseBlock[] {
  const blocks: MastermindCourseBlock[] = [];
  const active = path?.phases.find((p) => p.milestoneStatus === 'IN_PROGRESS');
  for (const u of active?.knowledgeUnits.slice(0, 4) ?? []) {
    blocks.push({
      subjectName: u.subjectName,
      subjectId: u.subjectId,
      chapter: active?.phase ?? '当前阶段',
      knowledgePoints: [u.title],
      minutes: 45,
      reason: `路径节点 · 目标掌握 ${u.masteryTargetPct}%`,
    });
  }
  for (const w of evidence.weaknesses.slice(0, 3)) {
    if (blocks.some((b) => b.knowledgePoints[0] === w.title)) continue;
    blocks.push({
      subjectName: w.subjectName,
      subjectId: w.subjectId,
      chapter: '短板攻坚',
      knowledgePoints: [w.title],
      minutes: 50,
      reason: w.evidence.slice(0, 60),
    });
  }
  const books = listTextbooksForUser(userId).slice(0, 2);
  for (const b of books) {
    const ch = parseTextbookOutline(b).find((c) => c.index === (b.progress_chapter ?? 1));
    const kps = (ch?.knowledgePoints ?? []).slice(0, 2);
    if (!kps.length) continue;
    blocks.push({
      subjectName: b.subject ?? '教材',
      subjectId: 'gpa',
      chapter: ch?.title ?? `第${b.progress_chapter ?? 1}章`,
      knowledgePoints: kps,
      minutes: 40,
      reason: `教材进度 ${b.progress_chapter ?? 1}/${parseTextbookOutline(b).length || '?'}`,
    });
  }
  return blocks.slice(0, 6);
}

function buildWeeklySchedule(
  path: LearningPathDocument | null,
  evidence: LearnerEvidencePack,
  courseBlocks: MastermindCourseBlock[],
): MastermindDayPlan[] {
  const days: MastermindDayPlan[] = [];
  const focus = path?.todayFocus;
  const assessSubject = evidence.weaknesses[0];

  for (let i = 0; i < 7; i++) {
    const date = fmtDate(addDays(i));
    const blocks: MastermindScheduleBlock[] = [];

    if (i === 0) {
      if (focus) {
        blocks.push({
          time: '19:00–20:30',
          title: `攻坚：${focus.title}`,
          type: 'study',
          subjectId: focus.subjectId,
          minutes: 90,
        });
      } else if (courseBlocks[0]) {
        const c = courseBlocks[0];
        blocks.push({
          time: '19:00–20:30',
          title: `${c.subjectName} · ${c.knowledgePoints[0]}`,
          type: 'study',
          subjectId: c.subjectId,
          minutes: c.minutes,
        });
      }
      blocks.push({
        time: '20:30–21:00',
        title: '学后验收（有学必考）',
        type: 'assess',
        subjectId: assessSubject?.subjectId ?? 'math',
        minutes: 30,
      });
      if (evidence.dataCompletenessPct < 55) {
        blocks.push({
          time: '21:00–21:15',
          title: '补证据：拍卷面/教材目录',
          type: 'evidence',
          minutes: 15,
        });
      }
    } else if (i <= 3) {
      const c = courseBlocks[i % Math.max(1, courseBlocks.length)] ?? courseBlocks[0];
      if (c) {
        blocks.push({
          time: '19:30–20:30',
          title: `${c.subjectName} · ${c.knowledgePoints.join('、').slice(0, 40)}`,
          type: 'study',
          subjectId: c.subjectId,
          minutes: c.minutes,
        });
        if (i === 2) {
          blocks.push({
            time: '20:30–21:00',
            title: '阶段小测/验收',
            type: 'assess',
            subjectId: c.subjectId,
            minutes: 30,
          });
        }
      }
    } else {
      const checkpoint = path?.weeklyCheckpoints?.[i - 4];
      blocks.push({
        time: '全天',
        title: checkpoint?.deliverable ?? path?.phases.find((p) => p.milestoneStatus === 'IN_PROGRESS')?.goalSummary?.slice(0, 50) ?? '按路径推进',
        type: 'study',
        minutes: 60,
      });
    }

    days.push({ date, label: dayLabel(i), blocks });
  }
  return days;
}

function buildDataRequests(evidence: LearnerEvidencePack, anchor: ReturnType<typeof getSchoolAnchorProfile>): MastermindDataRequest[] {
  const out: MastermindDataRequest[] = [];
  for (const sig of evidence.missingSignals) {
    if (sig.includes('梦校')) {
      out.push({
        id: 'req-anchor',
        prompt: '你的梦校、专业、年级、入学时间是？（打开梦校航标 30 秒填完）',
        why: '没有终点，路径无法按时间节点倒排',
        kind: 'anchor',
      });
    } else if (sig.includes('建档') || sig.includes('试卷')) {
      out.push({
        id: 'req-vision',
        prompt: '拍一张最近的试卷、作业或教材目录页（一张即可，我用来读真实水平）',
        why: '没有卷面证据，我只能猜你的短板',
        kind: 'vision',
      });
    } else if (sig.includes('评估')) {
      out.push({
        id: 'req-assess',
        prompt: '我先给你出一套系统摸底卷（主动验收），做完我再把路径锁死',
        why: '分数比自述可靠，有学必考',
        kind: 'assessment',
      });
    } else if (sig.includes('省份') || sig.includes('年级')) {
      out.push({
        id: 'req-geo',
        prompt: `补全现就读学校与所在地（如${anchor?.currentRegion || '湖南'}），我会切换省卷/国际课程轨`,
        why: '地区决定考纲与评估卷型',
        kind: 'anchor',
      });
    }
  }
  if (!out.length && evidence.dataCompletenessPct < 70) {
    out.push({
      id: 'req-progress',
      prompt: '用一句话告诉我：今天最卡的一科/一章是什么？或发一张相关卷子',
      why: '主动同步进度，避免路径脱节',
      kind: 'causal',
    });
  }
  return out.slice(0, 4);
}

function formatScheduleText(days: MastermindDayPlan[]): string {
  return days
    .map((d) => {
      const lines = d.blocks.map((b) => `  ${b.time}  ${b.title}（${b.type === 'assess' ? '验收' : b.type === 'evidence' ? '补数据' : '学习'}·${b.minutes}min）`);
      return `${d.label} ${d.date}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

function formatCourseText(blocks: MastermindCourseBlock[]): string {
  return blocks
    .map(
      (c, i) =>
        `${i + 1}. ${c.subjectName} · ${c.chapter}\n   知识点：${c.knowledgePoints.join('；')}\n   建议 ${c.minutes} 分钟 · ${c.reason}`,
    )
    .join('\n\n');
}

/** 同步生成主动规划（课程/时间/知识点/评估安排 + 追数据清单） */
export function buildMastermindPlanSync(userId: string): MastermindPlan | null {
  const uid = userId.trim();
  const anchor = getSchoolAnchorProfile(uid);
  if (!anchor?.school?.trim()) return null;

  const evidence = aggregateLearnerEvidence(uid);
  let path = getLearningPath(uid);
  if (!path?.phases?.length) {
    try {
      path = null;
    } catch {
      path = null;
    }
  }

  const profile = buildLearnerProfile(uid);
  const courseBlocks = buildCourseBlocks(uid, path, evidence);
  const weeklySchedule = buildWeeklySchedule(path, evidence, courseBlocks);
  const dataRequests = buildDataRequests(evidence, anchor);

  const pendingActive = countPendingActivePapers(uid);
  const daysSinceAssess = daysSinceLastAssessment(uid);
  const assessDue =
    path?.nextAssessmentDue && path.nextAssessmentDue <= fmtDate(new Date());
  const shouldAutoAssess =
    pendingActive === 0 &&
    evidence.dataCompletenessPct >= 35 &&
    (daysSinceAssess >= 5 || assessDue || daysSinceAssess > 900);

  const topWeak = evidence.weaknesses[0];
  const postAssessment = {
    dueDate: path?.nextAssessmentDue ?? fmtDate(addDays(2)),
    subjectId: topWeak?.subjectId ?? path?.todayFocus?.subjectId ?? 'math',
    subjectName: topWeak?.subjectName ?? path?.todayFocus?.title?.slice(0, 8) ?? '数学',
    reason: topWeak
      ? `短板验收：${topWeak.title}`
      : '阶段过关前必须有一次可验证分数',
  };

  let recommendedTool: MastermindPlan['recommendedTool'] = 'LEARNING_PATH';
  if (evidence.dataCompletenessPct < 45) recommendedTool = 'VISION_INTERCEPT';
  else if (shouldAutoAssess) recommendedTool = 'LEARNING_ASSESSMENT';
  else if (!path) recommendedTool = 'LEARNING_PATH';

  const primaryQuestion =
    dataRequests[0]?.prompt ??
    (topWeak
      ? `今天【${topWeak.title}】你能交付什么证据？（卷面/错题/录音）`
      : '今天主攻哪一科、哪一章？');

  const activePhase = path?.phases.find((p) => p.milestoneStatus === 'IN_PROGRESS');
  const sections: MastermindSection[] = [
    {
      title: '智者总规划（按梦校时间节点倒排）',
      body: [
        `梦校：${anchor.school} · ${anchor.major} · ${anchor.currentGrade}`,
        `课程轨：${profile?.curriculumLabel ?? '待识别'}`,
        path
          ? `当前阶段：${activePhase?.phase ?? '—'}（截止 ${activePhase?.deadline ?? '—'}）`
          : '路径生成中：请先保存航标后刷新',
        path?.criticalDates?.length
          ? `关键考期：${path.criticalDates.slice(0, 3).map((c) => `${c.date} ${c.label}`).join('；')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
    {
      title: '本周时间表（我已替你排好）',
      body: formatScheduleText(weeklySchedule),
    },
    {
      title: '课程与知识点队列',
      body: formatCourseText(courseBlocks),
    },
    {
      title: '学后评估（有学必考）',
      body: [
        `下次验收：${postAssessment.dueDate} · ${postAssessment.subjectName}`,
        `原因：${postAssessment.reason}`,
        shouldAutoAssess
          ? '（系统将主动为你生成摸底/验收卷，无需你再开口要）'
          : pendingActive > 0
            ? `（你已有 ${pendingActive} 份待考卷，先做完）`
            : '说「帮我评估」或点学习路径里的「验收」随时可考',
      ].join('\n'),
    },
  ];

  if (dataRequests.length) {
    sections.push({
      title: '我必须向你索要的数据（你不主动，我就主动问）',
      body: dataRequests.map((r, i) => `${i + 1}. ${r.prompt}\n   → ${r.why}`).join('\n\n'),
    });
  }

  if (path) {
    sections.push({
      title: '路径引擎摘要',
      body: formatLearningPathChatSummary(path).slice(0, 1200),
    });
  }

  const headline = topWeak
    ? `曦宝，我是你的梦校智者：今天先撞穿【${topWeak.title}】，其余先靠边。`
    : `曦宝，证据完备度 ${evidence.dataCompletenessPct}%——我先帮你把本周战役排死。`;

  return {
    headline,
    sections,
    weeklySchedule,
    courseBlocks,
    postAssessment,
    dataRequests,
    evidence,
    path,
    shouldAutoAssess,
    recommendedTool,
    primaryQuestion,
  };
}

export function mergeMastermindIntoBrief<
  T extends { headline: string; sections: MastermindSection[]; chatText: string; zhiTip: string; activatedTool: string },
>(
  base: T,
  plan: MastermindPlan | null,
): T {
  if (!plan) return base;
  const sections = [...plan.sections, ...base.sections];
  const chatText = [plan.headline, '', ...plan.sections.map((s) => `【${s.title}】\n${s.body}`), '', base.chatText]
    .join('\n')
    .trim();
  return {
    ...base,
    headline: plan.headline,
    sections,
    chatText,
    zhiTip: plan.shouldAutoAssess
      ? '系统评估卷已就绪或即将生成；做完自动重排路径。'
      : plan.dataRequests[0]
        ? plan.dataRequests[0].prompt
        : base.zhiTip,
    activatedTool:
      base.activatedTool === 'NONE' || base.activatedTool === 'METRICS_INPUT'
        ? plan.recommendedTool
        : base.activatedTool,
  };
}

/** 主动执行：系统评估出卷等 */
export async function executeMastermindActions(
  userId: string,
  plan: MastermindPlan | null,
  scene: MastermindScene,
): Promise<{
  assessmentPaperId?: string;
  assessmentSubjectId?: string;
  assessmentIntro?: string;
  assessmentTip?: string;
}> {
  if (!plan) return {};
  if (!['session_open', 'return_visit', 'anchor_wake'].includes(scene)) return {};
  if (!plan.shouldAutoAssess) return {};

  const uid = userId.trim();
  try {
    const hint = [
      `智者主动规划·${scene}`,
      plan.postAssessment.reason,
      plan.evidence.weaknesses.slice(0, 3).map((w) => w.title).join('；'),
      `学后评估截止 ${plan.postAssessment.dueDate}`,
    ].join('\n');
    const paper = await generateActiveAssessmentPaper(uid, {
      userHint: hint,
      source: 'chat',
      paperType: 'chat_active',
      subjectId: plan.postAssessment.subjectId,
      learningContext: formatCourseText(plan.courseBlocks),
    });
    return {
      assessmentPaperId: paper.id,
      assessmentSubjectId: paper.subjectId,
      assessmentIntro: paper.activeIntro,
      assessmentTip: `【系统主动评估】卷已生成「${paper.title}」，现在作答；交卷后路径按你的真实能力重排。`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '出卷失败';
    return { assessmentTip: `主动出卷未完成：${msg}。请先补全航标/建档后刷新。` };
  }
}

/** 一键：规划 + 可选自动评估 + 确保路径 */
export async function runMastermindCycle(
  userId: string,
  scene: MastermindScene = 'session_open',
): Promise<{
  plan: MastermindPlan | null;
  pathSummary?: string;
  assessmentPaperId?: string;
  assessmentSubjectId?: string;
}> {
  const uid = userId.trim();
  try {
    await ensureLearningPath(uid);
  } catch {
    /* 航标不全时跳过 */
  }
  const plan = buildMastermindPlanSync(uid);
  const executed = await executeMastermindActions(uid, plan, scene);
  return {
    plan,
    pathSummary: plan?.path ? plan.path.summaryLine : undefined,
    assessmentPaperId: executed.assessmentPaperId,
    assessmentSubjectId: executed.assessmentSubjectId,
  };
}
