/**
 * ZHI · 主动议程引擎（自动组织语言 + 基于进度/目标，不等用户开口）
 */

import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { getCommProtocol, recordProactiveTouch } from '../db/zhi-comm-protocol-schema';
import {
  getOrCreateDailyReview,
  getTodayDailyReview,
  needsDailyReviewToday,
  type DailyReviewDto,
} from './zhi-daily-review-engine';
import { getMentorPlanView } from '../db/school-matrix';
import { loadAnchorBriefForUser } from './school-anchor-brief';
import { hasUserBaselinePhotos, ZHI_BASELINE_PHOTO_INVITE_SHORT } from './zhi-baseline-invite';
import {
  buildLearningContextSnapshot,
  formatLearningSnapshotBlock,
} from './zhi-learning-context';
import { getLearningPath } from './learning-path-engine';
import { detectSchoolPathway, mergeMetricsForPathway, PATHWAY_LABEL } from './school-pathway';
import { matchSchoolIntel } from './school-anchor-brief';
import {
  COMM_PROTOCOL_DIRECTORY,
  formatProtocolDirectoryBlock,
  modeLabel,
  type CommModeId,
  type CommProtocolMode,
} from './zhi-comm-protocol';
import { gatewayJsonCompletion } from './llm-gateway';
import { WARP_COST } from './billing-hub';
import { resolveUserLlm } from './deepseek-client';
import {
  appendSnapshotToUserPrompt,
  proactiveBriefSystemPrompt,
  resolveZhiLlmContext,
} from './zhi-llm-prompts';
import {
  buildMastermindPlanSync,
  executeMastermindActions,
  mergeMastermindIntoBrief,
} from './zhi-mastermind-planner';

export type ProactiveScene = 'session_open' | 'anchor_wake' | 'return_visit' | 'daily_review';

export type ProactiveSection = { title: string; body: string };

export type ProactiveBriefResult = {
  protocolEstablished: boolean;
  sessionCount: number;
  /** 最近一次主动触达（unix 秒） */
  lastProactiveAt?: number | null;
  activeMode: CommModeId;
  activeModeLabel: string;
  protocolDirectory: CommProtocolMode[];
  headline: string;
  sections: ProactiveSection[];
  chatText: string;
  zhiTip: string;
  zhiCoachNote: string;
  activatedTool: 'METRICS_INPUT' | 'VISION_INTERCEPT' | 'LEARNING_PATH' | 'LEARNING_ASSESSMENT' | 'NONE';
  assessmentPaperId?: string;
  assessmentSubjectId?: string;
  challengeIndex: number;
  targetSchool: string;
  daysRemaining?: number;
  dynamicMilestones?: Array<{
    codeName: string;
    deadline: string;
    mission: string;
    status?: string;
  }>;
  dailyReview?: DailyReviewDto | null;
  requiredMetrics?: Record<string, unknown>;
  timelineMilestones?: import('../db/school-matrix').TimelineMilestone[];
  pathway: import('./school-pathway').SchoolPathway;
  pathwayLabel: string;
  weakSubjects?: string[];
  weakestSubject?: { name: string; progressPct: number } | null;
};

function hoursSince(tsSec: number | null | undefined): number {
  if (!tsSec) return 999;
  return (Date.now() / 1000 - tsSec) / 3600;
}

/** 距上次主动触达多久后进入「进度巡检」（小时，可用 env 覆盖） */
const PROACTIVE_PATROL_HOURS = Number(process.env.WUXIAN_PROACTIVE_PATROL_HOURS) || 2;

function pickActiveMode(input: {
  hasAnchor: boolean;
  hasBaseline: boolean;
  scene: ProactiveScene;
  protocolEstablished: boolean;
  hoursSinceLastProactive: number;
  hasInProgressMission: boolean;
  needsDailyReview: boolean;
  momentumStalled?: boolean;
}): CommModeId {
  if (!input.protocolEstablished) return 'PROTOCOL_INIT';
  if (!input.hasAnchor) return 'GOAL_ANCHOR';
  if (input.scene === 'anchor_wake') {
    return input.hasBaseline ? 'PROGRESS_PATROL' : 'BASELINE_INTAKE';
  }
  if (input.needsDailyReview || input.scene === 'daily_review') return 'DAILY_REVIEW';
  if (!input.hasBaseline) return 'BASELINE_INTAKE';
  if (input.momentumStalled && input.hasBaseline) return 'PROGRESS_PATROL';
  if (input.scene === 'return_visit' || input.hoursSinceLastProactive >= PROACTIVE_PATROL_HOURS) {
    return 'PROGRESS_PATROL';
  }
  if (input.hasInProgressMission) return 'MISSION_ORDER';
  if (input.scene === 'session_open' && input.hoursSinceLastProactive >= 0.5) return 'PROGRESS_PATROL';
  return 'PROGRESS_PATROL';
}

function assembleChatText(headline: string, sections: ProactiveSection[], footer?: string): string {
  const parts = [headline, ''];
  for (const s of sections) {
    parts.push(`【${s.title}】`, s.body, '');
  }
  if (footer?.trim()) parts.push(footer);
  return parts.join('\n').trim();
}

export function composeProactiveBrief(
  userId: string,
  scene: ProactiveScene = 'session_open',
  opts?: { focusDirectoryId?: string | null },
): ProactiveBriefResult {
  const uid = userId.trim();
  const protocolRow = getCommProtocol(uid);
  const protocolEstablished = Boolean(protocolRow?.established_at);
  const anchor = getSchoolAnchorProfile(uid);
  const hasAnchor = Boolean(anchor?.school);
  const hasBaseline = hasUserBaselinePhotos(uid);
  const learningSnap = hasAnchor
    ? buildLearningContextSnapshot(uid, { focusDirectoryId: opts?.focusDirectoryId })
    : null;
  const pathway =
    learningSnap?.pathway ??
    (anchor
      ? detectSchoolPathway(anchor.school, anchor.major, {
          currentSchool: anchor.currentSchool,
          currentRegion: anchor.currentRegion,
          targetSchoolRegion: anchor.targetSchoolRegion,
          currentGrade: anchor.currentGrade,
        })
      : 'generic');
  const intel = anchor ? matchSchoolIntel(anchor.school, anchor.major) : null;
  const brief = hasAnchor ? loadAnchorBriefForUser(uid) : null;
  const plan = getMentorPlanView(uid);
  const challengeIndex = brief?.challengeIndex ?? plan?.challengeIndex ?? 88;
  const targetSchool =
    plan?.targetSchool ?? (anchor ? `${anchor.school} · ${anchor.major}` : '未锁定的彼岸');
  const activeMilestone = brief?.dynamicMilestones?.find((m) => m.status === 'IN_PROGRESS');
  const hasInProgressMission = Boolean(activeMilestone);

  const pendingDaily = hasAnchor && needsDailyReviewToday(uid);
  const dailyReview: DailyReviewDto | null =
    pendingDaily || scene === 'daily_review'
      ? getOrCreateDailyReview(uid)
      : hasAnchor
        ? getTodayDailyReview(uid)
        : null;

  const momentumStalled = Boolean(
    learningSnap?.momentumHint && /停滞|落后|预警|不足|放缓/.test(learningSnap.momentumHint),
  );

  const activeMode = pickActiveMode({
    hasAnchor,
    hasBaseline,
    scene,
    protocolEstablished,
    hoursSinceLastProactive: hoursSince(protocolRow?.last_proactive_at),
    hasInProgressMission,
    needsDailyReview: pendingDaily || scene === 'daily_review',
    momentumStalled,
  });

  const sections: ProactiveSection[] = [];
  let headline = '';
  let zhiTip = '';
  let activatedTool: ProactiveBriefResult['activatedTool'] = 'NONE';
  const zhiCoachNote = '主动权在 ZHI：你负责执行，我负责按进度追问与下命令。';

  if (activeMode === 'PROTOCOL_INIT') {
    headline =
      '曦宝，第一次沟通我们先立约：这不是你问我答的聊天，是我按你的学习进度与梦校目标，主动展开每一次对话。';
    sections.push({
      title: '立约说明',
      body: [
        '你和普通 AI 的区别在这里：',
        '  · 普通 AI：等你提问',
        '  · ZHI：我读航标 + 进度表 + 你的试卷档案，主动巡检、下达战役、追问归档',
        '下面是我们的「沟通形式目录」，以后每次对话都按它编排。',
      ].join('\n'),
    });
    sections.push({
      title: '形式目录',
      body: formatProtocolDirectoryBlock().replace('【沟通形式目录 · 已立约】', '').trim(),
    });
    if (!hasAnchor) {
      sections.push({
        title: '我现在的主动议程',
        body: [
          '第一步：打开「梦校航标」，锁定院校/阶段目标、专业/主攻科、年级与入学时间。',
          '第二步：我会立刻告诉你“从哪一门课开始”，并把今天任务写成可交付清单。',
        ].join('\n'),
      });
      activatedTool = 'METRICS_INPUT';
    } else if (!hasBaseline) {
      sections.push({
        title: '我现在的主动议程',
        body: `航标已有。第二步：${ZHI_BASELINE_PHOTO_INVITE_SHORT}`,
      });
      activatedTool = 'VISION_INTERCEPT';
    }
    zhiTip = hasAnchor
      ? learningSnap?.pathway === 'k12_stage'
        ? '按议程发单元卷/错题本，或回复今天主攻科涨了几分、哪道题还不稳。'
        : learningSnap?.pathway === 'domestic_cn'
          ? '按议程发试卷/教材，或回复今日数学/物理/竞赛进度一句。'
          : '按议程发试卷/教材，或回复今日进度一句。'
      : '先去梦校航标：可选大学梦校，或选「还没想好大学」走校内成长（全班第一/单科提分）。';
  } else {
    headline = `曦宝，【主动 · ${modeLabel(activeMode)}】基于 ${targetSchool} 与当前进度，我先开口。`;
    sections.push({
      title: '形式目录（已立约）',
      body: COMM_PROTOCOL_DIRECTORY.map((m) => `· ${m.label}`).join('\n'),
    });

    if (learningSnap && (scene === 'session_open' || scene === 'return_visit' || activeMode === 'PROGRESS_PATROL')) {
      sections.push({
        title: '学习向快照（仅学业数据）',
        body: formatLearningSnapshotBlock(learningSnap),
      });
    }

    if (activeMode === 'GOAL_ANCHOR') {
      if (brief) {
        sections.push({
          title: '航标情报与倒计时',
          body: brief.chatText.split('\n').slice(1).join('\n').trim() || brief.chatText,
        });
        zhiTip = '读完表后，用一句话回复：今晚你打算撞穿哪一项。';
        activatedTool = 'METRICS_INPUT';
      } else {
        sections.push({
          title: '航标未锁定',
          body: '打开「梦校航标」：院校 + 专业 + 年级 + 入学时间。锁定后我会主动抛出招生情报、硬指标与倒计时表。',
        });
        zhiTip = '去梦校航标完成唤醒，不必先问我。';
        activatedTool = 'METRICS_INPUT';
      }
    } else if (activeMode === 'BASELINE_INTAKE') {
      const weakFromBaseline = learningSnap?.weakSubjects?.[0]?.trim() || '';
      const weakFromProgress = learningSnap?.weakestSubject?.name?.trim() || '';
      const weakPicked = weakFromBaseline || weakFromProgress;
      const hasWeakSignal = Boolean(weakPicked);
      const starter =
        weakPicked
          ? `短板优先：${weakPicked}`
          : pathway === 'k12_stage'
            ? '短板优先（默认数学）'
            : pathway === 'domestic_cn'
              ? '短板优先（默认数学）'
              : pathway === 'us_intl'
                ? '短板优先（默认托福）'
                : '短板优先（默认数学）';
      sections.push({
        title: '学业建档（我主动索要）',
        body: [
          ZHI_BASELINE_PHOTO_INVITE_SHORT,
          '',
          brief
            ? `当前倒计时节点：${activeMilestone?.codeName ?? brief.timelineMilestones[0]?.phase ?? 'T1'}，距入学 ${brief.daysRemaining} 天。`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      sections.push({
        title: '从短板开始（因人而异）',
        body: [
          `先从：${starter}`,
          weakPicked
            ? `依据：系统已捕捉到你的薄弱点（${weakPicked}）。`
            : '依据：你尚未补充足够数据；我先用“短板优先”的策略开工，随后用摸底评估纠偏。',
          '你现在只要做两件事（二选一即可）：',
          '  1) 点「+」发一张卷子/错题/作业/教材目录页（最快）',
          '  2) 打开「学习评估」做一次摸底（我会把路径按结果重排）',
        ].join('\n'),
      });
      zhiTip =
        learningSnap?.pathway === 'k12_stage'
          ? '先发今天主攻科的一张卷子或错题页，一张即可开工。'
          : learningSnap?.pathway === 'domestic_cn'
            ? '先发数学卷或教材目录页也行，一张即可开工。'
            : '先发数学或标化卷也行，一张即可开工。';
      activatedTool = hasWeakSignal ? 'VISION_INTERCEPT' : 'LEARNING_ASSESSMENT';
    } else if (activeMode === 'MISSION_ORDER') {
      const mission = activeMilestone ?? brief?.dynamicMilestones?.[0];
      sections.push({
        title: '今日战役（我下达，不用你问）',
        body: [
          mission
            ? `节点：${mission.codeName}（${mission.deadline}）\n任务：${mission.mission}`
            : '打开左侧倒计时表，执行「进行中」那一行。',
          brief ? `命运阻力 ${challengeIndex}% · 距入学 ${brief.daysRemaining} 天。` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      zhiTip = '今晚 22:00 前交付一项可验证成果（截图/错题/口语录音）。';
      activatedTool = 'VISION_INTERCEPT';
    } else if (activeMode === 'DAILY_REVIEW' && dailyReview) {
      headline = `曦宝，【每日复盘 · ${dailyReview.reviewDate}】计划已按你的最新进度修正。`;
      sections.push({
        title: '数据复盘',
        body: dailyReview.retrospective.map((l) => `  · ${l}`).join('\n'),
      });
      sections.push({
        title: '计划修正',
        body: dailyReview.planCorrections
          .map((c) => `  · [${c.priority}] ${c.subjectName}（${c.dueBy}）\n      → ${c.action}`)
          .join('\n'),
      });
      sections.push({
        title: '倒计时表更新',
        body: dailyReview.revisedMission,
      });
      zhiTip = '回复 P0 完成情况，或发试卷——明日计划会再自动修正。';
      activatedTool = 'METRICS_INPUT';
    } else if (activeMode === 'PROGRESS_PATROL') {
      const pathDoc = hasAnchor ? getLearningPath(uid) : null;
      if (pathDoc?.pushHeadline || pathDoc?.todayFocus) {
        const weakLines = (pathDoc.weaknessLedger ?? []).slice(0, 3).map(
          (w) => `  · [${w.severity}] ${w.title}`,
        );
        sections.push({
          title: '短板推动（证据驱动）',
          body: [
            pathDoc.pushHeadline ?? '',
            pathDoc.todayFocus
              ? `今日攻坚：${pathDoc.todayFocus.title}（${pathDoc.todayFocus.dueDate}）`
              : '',
            weakLines.length ? ['短板 TOP：', ...weakLines].join('\n') : '',
            pathDoc.missingSignals?.length
              ? `先补齐：${pathDoc.missingSignals.join('、')}`
              : '',
            pathDoc.dataCompletenessPct != null
              ? `证据完备度 ${pathDoc.dataCompletenessPct}% — 越多越准`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        });
        zhiTip =
          pathDoc.pushActions?.[0]?.label ??
          '打开「学习路径」；今日短板必须验收，别跳过。';
        activatedTool = 'LEARNING_PATH';
      }
      const qs = learningSnap?.patrolQuestions ?? [
        '1. 自上次对话以来，倒计时节点推进了多少？',
        '2. 专业课：做对了什么、卡在哪一题/哪一章？',
        '3. 明天之前你能交付什么可验证证据？',
      ];
      sections.push({
        title: '进度巡检（我先问）',
        body: [
          ...qs,
          activeMilestone
            ? `\n当前战役节点：${activeMilestone.codeName} → ${activeMilestone.mission}`
            : '',
          learningSnap && learningSnap.baselineEvidenceCount === 0
            ? '\n（尚未学业建档：建议用 + 发试卷或教材页，我会把差距改成你的真实现状）'
            : '',
        ].join('\n'),
      });
      zhiTip = '直接按 1-2-3 回答，不必寒暄。';
      if (learningSnap?.baselineEvidenceCount === 0) {
        const weakFromBaseline = learningSnap?.weakSubjects?.[0]?.trim() || '';
        const weakFromProgress = learningSnap?.weakestSubject?.name?.trim() || '';
        const weakPicked = weakFromBaseline || weakFromProgress;
        activatedTool = weakPicked ? 'VISION_INTERCEPT' : 'LEARNING_ASSESSMENT';
      } else {
        activatedTool = 'METRICS_INPUT';
      }
    }
  }

  const chatText =
    activeMode === 'DAILY_REVIEW' && dailyReview?.chatText
      ? dailyReview.chatText
      : assembleChatText(headline, sections);
  recordProactiveTouch(uid, activeMode);

  const refreshedBrief = dailyReview ? loadAnchorBriefForUser(uid) : brief;
  const rawMetrics = refreshedBrief?.requiredMetrics ?? brief?.requiredMetrics ?? intel?.requiredMetrics ?? {};
  const requiredMetrics = mergeMetricsForPathway(
    intel?.requiredMetrics ?? {},
    rawMetrics as Record<string, unknown>,
    pathway,
  );

  const protocolAfter = getCommProtocol(uid);

  return {
    protocolEstablished: true,
    sessionCount: protocolAfter?.session_count ?? 1,
    lastProactiveAt: protocolAfter?.last_proactive_at ?? null,
    activeMode,
    activeModeLabel: modeLabel(activeMode),
    protocolDirectory: COMM_PROTOCOL_DIRECTORY,
    headline,
    sections,
    chatText,
    zhiTip,
    zhiCoachNote,
    activatedTool,
    challengeIndex,
    targetSchool,
    daysRemaining: refreshedBrief?.daysRemaining,
    dynamicMilestones: refreshedBrief?.dynamicMilestones,
    requiredMetrics,
    timelineMilestones: refreshedBrief?.timelineMilestones ?? brief?.timelineMilestones,
    dailyReview,
    pathway,
    pathwayLabel: PATHWAY_LABEL[pathway],
    weakSubjects: learningSnap?.weakSubjects ?? [],
    weakestSubject: learningSnap?.weakestSubject ?? null,
  };
}

async function enrichProactiveBriefWithLlm(
  uid: string,
  base: ProactiveBriefResult,
  scene: ProactiveScene,
  focusDirectoryId?: string | null,
): Promise<ProactiveBriefResult> {
  if (base.activeMode === 'PROTOCOL_INIT') return base;
  if (!resolveUserLlm(uid) && !process.env.DEEPSEEK_API_KEY?.trim()) return base;

  const llmCtx = resolveZhiLlmContext(uid, { focusDirectoryId });
  const gw = await gatewayJsonCompletion<{
    headline?: string;
    openingLine?: string;
    pushQuestion?: string;
    zhiTip?: string;
    zhiCoachNote?: string;
    activatedTool?: string;
  }>(
    uid,
    [
      {
        role: 'system',
        content: proactiveBriefSystemPrompt(
          llmCtx.pathway,
          base.activeModeLabel,
          llmCtx.curriculumTrack,
          uid,
        ),
      },
      {
        role: 'user',
        content: appendSnapshotToUserPrompt(
          [
            `主动模式：${base.activeModeLabel}`,
            `场景：${scene}`,
            `梦校：${base.targetSchool}`,
            `命运阻力：${base.challengeIndex}%`,
            `模板提纲：\n${base.chatText.slice(0, 2200)}`,
          ].join('\n'),
          llmCtx.snapshotBlock,
        ),
      },
    ],
    {
      traceId: `proactive_${uid}_${scene}`,
      maxTokens: 560,
      temperature: 0.45,
      flatWarp: { cost: WARP_COST.CHAT_COMPLETION, reason: 'PROACTIVE_BRIEF' },
    },
  );

  if (!gw.chargeOk || !gw.data) return base;

  const d = gw.data;
  const headline = d.headline?.trim() || base.headline;
  const sections = [...base.sections];
  if (d.openingLine?.trim()) {
    sections.unshift({ title: 'ZHI 此刻开口', body: d.openingLine.trim().slice(0, 400) });
  }
  if (d.pushQuestion?.trim()) {
    sections.push({ title: '你必须回答', body: d.pushQuestion.trim().slice(0, 200) });
  }

  let activatedTool = base.activatedTool;
  const tool = String(d.activatedTool ?? '').toUpperCase();
  const toolNorm =
    tool === 'ASSESSMENT' ? 'LEARNING_ASSESSMENT' : tool;
  if (
    toolNorm === 'METRICS_INPUT' ||
    toolNorm === 'VISION_INTERCEPT' ||
    toolNorm === 'LEARNING_PATH' ||
    toolNorm === 'LEARNING_ASSESSMENT' ||
    toolNorm === 'NONE'
  ) {
    activatedTool = toolNorm as ProactiveBriefResult['activatedTool'];
  }

  const chatText =
    base.activeMode === 'DAILY_REVIEW' && base.dailyReview?.chatText
      ? [base.dailyReview.chatText, d.zhiTip?.trim()].filter(Boolean).join('\n\n')
      : assembleChatText(headline, sections);

  return {
    ...base,
    headline,
    sections,
    chatText,
    zhiTip: d.zhiTip?.trim() || base.zhiTip,
    zhiCoachNote: d.zhiCoachNote?.trim() || base.zhiCoachNote,
    activatedTool,
  };
}

/** 模板议程 + 可选 LLM 改写（更主动、带追问） */
export async function composeProactiveBriefAsync(
  userId: string,
  scene: ProactiveScene = 'session_open',
  opts?: { focusDirectoryId?: string | null; skipLlm?: boolean },
): Promise<ProactiveBriefResult> {
  const base0 = composeProactiveBrief(userId, scene, { focusDirectoryId: opts?.focusDirectoryId });
  const mastermind = buildMastermindPlanSync(userId.trim());
  let base = mergeMastermindIntoBrief(base0, mastermind);
  const executed = await executeMastermindActions(userId.trim(), mastermind, scene);
  if (executed.assessmentPaperId) {
    base = {
      ...base,
      assessmentPaperId: executed.assessmentPaperId,
      assessmentSubjectId: executed.assessmentSubjectId,
      activatedTool: 'LEARNING_ASSESSMENT',
      zhiTip: executed.assessmentTip ?? base.zhiTip,
      sections: [
        ...base.sections,
        {
          title: '系统主动评估（智者出题）',
          body: [
            executed.assessmentIntro ?? '有学必考：请立即作答。',
            '交卷后我会按真实得分重排知识点、时间表与下一场验收。',
          ].join('\n'),
        },
      ],
      chatText: [
        base.chatText,
        '',
        '【系统主动评估】',
        executed.assessmentIntro ?? '',
        executed.assessmentTip ?? '',
      ]
        .join('\n')
        .trim(),
    };
  }
  if (opts?.skipLlm) return base;
  const enriched = await enrichProactiveBriefWithLlm(userId.trim(), base, scene, opts?.focusDirectoryId);
  return {
    ...enriched,
    assessmentPaperId: base.assessmentPaperId ?? enriched.assessmentPaperId,
    assessmentSubjectId: base.assessmentSubjectId ?? enriched.assessmentSubjectId,
    activatedTool:
      base.assessmentPaperId && enriched.activatedTool === 'NONE'
        ? 'LEARNING_ASSESSMENT'
        : enriched.activatedTool,
  };
}
