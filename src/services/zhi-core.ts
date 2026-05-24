/**
 * WUXIAN · 【ZHI】主动神经内核（知 · 直 · 指）
 * 每一句主动训诫经 DeepSeek 神经元，烙印 ZHI 铁血导师印记。
 */

import { getMentorPlanView, getSchoolMatrixRow } from '../db/school-matrix';
import {
  intrusionFromBrief,
  isSchoolIntelQuery,
  loadAnchorBriefForUser,
} from './school-anchor-brief';
import { hasUserBaselinePhotos, ZHI_BASELINE_PHOTO_INVITE_SHORT } from './zhi-baseline-invite';
import { composeProactiveBriefAsync } from './zhi-proactive-engine';
import { resolveUserLlm } from './deepseek-client';
import { assertWarpBalance, WARP_COST } from './billing-hub';
import { gatewayJsonCompletion } from './llm-gateway';
import type { SchoolPathway } from './school-pathway';
import { sanitizeLlmOutput } from '../../server/agents/zhi-tools';
import {
  appendSnapshotToUserPrompt,
  pathwayCoachNote,
  pathwayIntrusionTip,
  resolveZhiLlmContext,
  zhiIntrusionSystemPrompt,
} from './zhi-llm-prompts';
import { buildRecentLearningEvidenceBlock } from './zhi-recent-evidence';
import { isAssessmentRequest, isPassiveOrVagueReply, isPathPlanningRequest } from './zhi-chat-intent';
import { executeDialogIntent, resolveDialogIntent } from './zhi-dialog-router';
import { ensureLearningPath, formatLearningPathChatSummary } from './learning-path-engine';
import { generateActiveAssessmentPaper } from './zhi-learning-assessment';
import { buildLearnerProfile } from './learner-profile';
import { buildMastermindPlanSync } from './zhi-mastermind-planner';
import type { DialogQuickAction } from './zhi-dialog-router';

export type ZhiActivatedTool =
  | 'METRICS_INPUT'
  | 'VISION_INTERCEPT'
  | 'LEARNING_ASSESSMENT'
  | 'LEARNING_PATH'
  | 'VIDEO_LEARN'
  | 'NONE';

export interface ZhiIntrusionResult {
  zhiOpening: string;
  activatedTool: ZhiActivatedTool;
  zhiTip: string;
  zhiCoachNote: string;
  challengeIndex: number;
  targetSchool: string;
  warpPointsRemaining: number;
  warpDeducted: number;
  /** 对话触发的自适应评估卷（打开学习评估工具并载入） */
  assessmentPaperId?: string;
  assessmentSubjectId?: string;
  videoUrl?: string;
  videoTitle?: string;
  dialogQuickActions?: DialogQuickAction[];
}

function parseZhiJson(content: string): Partial<ZhiIntrusionResult> | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    const tool = String(raw.activatedTool ?? 'NONE').toUpperCase();
    const activatedTool: ZhiActivatedTool =
      tool === 'METRICS_INPUT' ||
      tool === 'VISION_INTERCEPT' ||
      tool === 'LEARNING_ASSESSMENT' ||
      tool === 'LEARNING_PATH' ||
      tool === 'VIDEO_LEARN'
        ? tool
        : 'NONE';
    const followUp = String(raw.zhiFollowUpQuestion ?? '').trim().slice(0, 120);
    const tip = String(raw.zhiTip ?? '').trim().slice(0, 200);
    return {
      zhiOpening: String(raw.zhiOpening ?? '').trim().slice(0, 200),
      activatedTool,
      zhiTip: [tip, followUp].filter(Boolean).join('\n').slice(0, 280),
      zhiCoachNote: String(raw.zhiCoachNote ?? '').trim().slice(0, 160),
    };
  } catch {
    return null;
  }
}

function heuristicZhi(input: {
  targetSchool: string;
  challengeIndex: number;
  userFeedback?: string;
  lowWarp: boolean;
  pathway: SchoolPathway;
}): ZhiIntrusionResult {
  if (input.lowWarp) {
    return {
      zhiOpening: '曦宝，托管算力已见底。ZHI 的因果透镜假死——立刻充值，别让时间线断裂。',
      activatedTool: 'NONE',
      zhiTip: '先补足 Warp 燃料，再谈逆袭。',
      zhiCoachNote: '',
      challengeIndex: input.challengeIndex,
      targetSchool: input.targetSchool,
      warpPointsRemaining: 0,
      warpDeducted: 0,
    };
  }

  const school = input.targetSchool || '未锁定的彼岸';
  const baselineTip = ZHI_BASELINE_PHOTO_INVITE_SHORT;
  return {
    zhiOpening: `曦宝，我是 ZHI。航标【${school}】命运阻力 ${input.challengeIndex}%。${input.userFeedback ? '你的心流信号已入账。' : '别用切屏假装学懂。'}`,
    activatedTool: 'VISION_INTERCEPT',
    zhiTip: pathwayIntrusionTip(input.pathway, baselineTip),
    zhiCoachNote: pathwayCoachNote(input.pathway),
    challengeIndex: input.challengeIndex,
    targetSchool: school,
    warpPointsRemaining: 0,
    warpDeducted: 0,
  };
}

export class ZhiCoreEngine {
  /**
   * ZHI 主动切入：读取航标与命运阻力，经 DeepSeek 输出训诫并调度工具
   */
  static async zhiIntrusion(
    userId: string,
    userFeedback?: string,
    opts?: { focusDirectoryId?: string | null },
  ): Promise<ZhiIntrusionResult> {
    const uid = userId.trim();
    if (!uid) {
      throw new Error('缺少 userId');
    }

    const llmCtx = resolveZhiLlmContext(uid, { focusDirectoryId: opts?.focusDirectoryId });
    const plan = getMentorPlanView(uid);
    const row = getSchoolMatrixRow(uid);
    const targetSchool = plan?.targetSchool ?? row?.target_school ?? '未锁定的彼岸';
    const challengeIndex = Number(plan?.challengeIndex ?? row?.challenge_index ?? 99);

    const balance = assertWarpBalance(uid, 1);
    if (!balance.ok) {
      return {
        ...heuristicZhi({
          targetSchool,
          challengeIndex,
          userFeedback,
          lowWarp: true,
          pathway: llmCtx.pathway,
        }),
        warpPointsRemaining: balance.remaining,
      };
    }

    const feedbackText = userFeedback?.trim() ?? '';

    if (feedbackText) {
      const profile = buildLearnerProfile(uid);
      const track = profile?.curriculumTrack ?? 'cn_gaokao';
      const intent = resolveDialogIntent(feedbackText, track);
      if (intent.kind !== 'none') {
        const routed = await executeDialogIntent(uid, intent, {
          targetSchool,
          challengeIndex,
          warpRemaining: balance.remaining,
          focusDirectoryId: opts?.focusDirectoryId,
          userHint: feedbackText,
        });
        if (routed) {
          return {
            zhiOpening: routed.zhiOpening,
            activatedTool: routed.activatedTool as ZhiActivatedTool,
            zhiTip: routed.zhiTip,
            zhiCoachNote: routed.zhiCoachNote,
            challengeIndex: routed.challengeIndex,
            targetSchool: routed.targetSchool,
            warpPointsRemaining: routed.warpPointsRemaining,
            warpDeducted: routed.warpDeducted,
            assessmentPaperId: routed.assessmentPaperId,
            assessmentSubjectId: routed.assessmentSubjectId,
            videoUrl: routed.videoUrl,
            videoTitle: routed.videoTitle,
            dialogQuickActions: routed.dialogQuickActions,
          };
        }
      }
    }

    if (!userFeedback?.trim()) {
      const proactive = await composeProactiveBriefAsync(uid, 'session_open', {
        focusDirectoryId: opts?.focusDirectoryId,
      });
      return {
        zhiOpening: proactive.chatText,
        activatedTool:
          proactive.assessmentPaperId ? 'LEARNING_ASSESSMENT' : proactive.activatedTool,
        zhiTip: proactive.zhiTip,
        zhiCoachNote: proactive.zhiCoachNote,
        challengeIndex: proactive.challengeIndex,
        targetSchool: proactive.targetSchool,
        warpPointsRemaining: balance.remaining,
        warpDeducted: 0,
        assessmentPaperId: proactive.assessmentPaperId,
        assessmentSubjectId: proactive.assessmentSubjectId,
      };
    }

    if (feedbackText && isPathPlanningRequest(feedbackText) && !isAssessmentRequest(feedbackText)) {
      try {
        const doc = await ensureLearningPath(uid);
        const summary = formatLearningPathChatSummary(doc);
        return {
          zhiOpening: `曦宝，已按梦校航标生成可执行学习路径（省情时间轴 + 知识点 + 有学必考）。\n\n${summary}`,
          activatedTool: 'LEARNING_PATH',
          zhiTip: '查看「学习路径」时间轴；说「帮我评估」验收今日攻坚知识点。',
          zhiCoachNote: doc.nextAssessmentDue ? `下次必考：${doc.nextAssessmentDue}` : '',
          challengeIndex: doc.challengeIndex,
          targetSchool: doc.targetSchool,
          warpPointsRemaining: balance.remaining,
          warpDeducted: 0,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : '路径生成失败';
        return {
          zhiOpening: `曦宝，学习路径暂不可用：${msg}。请先完成梦校航标（院校、年级、入学时间）。`,
          activatedTool: 'NONE',
          zhiTip: '打开「梦校航标」保存后再说「帮我做学习规划」。',
          zhiCoachNote: '',
          challengeIndex,
          targetSchool,
          warpPointsRemaining: balance.remaining,
          warpDeducted: 0,
        };
      }
    }

    if (feedbackText && isAssessmentRequest(feedbackText)) {
      try {
        const paper = await generateActiveAssessmentPaper(uid, {
          userHint: feedbackText,
          focusDirectoryId: opts?.focusDirectoryId,
          source: 'chat',
          paperType: 'chat_active',
        });
        const profile = buildLearnerProfile(uid);
        const trackLabel = profile?.curriculumLabel ?? '当前课程轨';
        return {
          zhiOpening:
            paper.activeIntro ||
            `曦宝，已按【${trackLabel}】生成主动验收卷「${paper.title}」（${paper.questions.length} 题，含问答/填空）。有学必考，现在就开始答。`,
          activatedTool: 'LEARNING_ASSESSMENT',
          zhiTip: '在下方「学习评估」逐题作答；交卷后我会更新分科掌握度与弱项。',
          zhiCoachNote: paper.examAlign ? `卷型：${paper.examAlign}` : '',
          challengeIndex,
          targetSchool,
          warpPointsRemaining: balance.remaining,
          warpDeducted: 0,
          assessmentPaperId: paper.id,
          assessmentSubjectId: paper.subjectId,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : '出卷失败';
        return {
          zhiOpening: `曦宝，评估卷生成失败：${msg}。先补全梦校航标里的现就读学校与所在地（如湖南），再说一次「帮我摸底」。`,
          activatedTool: 'LEARNING_ASSESSMENT',
          zhiTip: '打开「学习评估」手动选科目出卷，或更新航标后让我重试。',
          zhiCoachNote: '',
          challengeIndex,
          targetSchool,
          warpPointsRemaining: balance.remaining,
          warpDeducted: 0,
        };
      }
    }

    if (userFeedback?.trim() && isPassiveOrVagueReply(userFeedback)) {
      const plan = buildMastermindPlanSync(uid);
      if (plan) {
        return {
          zhiOpening: [
            '曦宝，你这句我没法用来排时间轴——梦校智者不靠猜。',
            '',
            plan.primaryQuestion,
            plan.dataRequests[0] ? `请补充：${plan.dataRequests[0].prompt}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          activatedTool: plan.recommendedTool,
          zhiTip: plan.shouldAutoAssess
            ? '也可直接做我刚准备的系统评估卷。'
            : '拍一张卷子或打开学习路径看本周表。',
          zhiCoachNote: pathwayCoachNote(llmCtx.pathway),
          challengeIndex,
          targetSchool,
          warpPointsRemaining: balance.remaining,
          warpDeducted: 0,
        };
      }
    }

    if (userFeedback?.trim() && isSchoolIntelQuery(userFeedback)) {
      const brief = loadAnchorBriefForUser(uid);
      if (brief) {
        const intel = intrusionFromBrief(brief, plan, uid);
        return {
          zhiOpening: intel.zhiOpening,
          activatedTool: intel.activatedTool,
          zhiTip: intel.zhiTip,
          zhiCoachNote: intel.zhiCoachNote,
          challengeIndex: intel.challengeIndex,
          targetSchool: intel.targetSchool,
          warpPointsRemaining: balance.remaining,
          warpDeducted: 0,
        };
      }
    }

    if (!resolveUserLlm(uid) && !process.env.DEEPSEEK_API_KEY?.trim()) {
      return {
        ...heuristicZhi({
          targetSchool,
          challengeIndex,
          userFeedback,
          lowWarp: false,
          pathway: llmCtx.pathway,
        }),
        warpPointsRemaining: balance.remaining,
      };
    }

    const lockedBrief = loadAnchorBriefForUser(uid);
    const needsBaseline = !hasUserBaselinePhotos(uid);

    const evidenceBlock = buildRecentLearningEvidenceBlock(uid, 5);
    const userPromptBase = [
      `【当前航标】: ${targetSchool}`,
      `【升学路径】: ${llmCtx.pathway}`,
      `【命运阻力】: ${challengeIndex}%`,
      `【实时心流信号】: ${userFeedback?.trim() || '系统静默流速判定延迟'}`,
      lockedBrief?.chatText ? `【已锁定情报与倒计时表】\n${lockedBrief.chatText.slice(0, 1200)}` : '',
      evidenceBlock,
    ]
      .filter(Boolean)
      .join('\n');

    const gw = await gatewayJsonCompletion<Partial<ZhiIntrusionResult>>(uid, [
      {
        role: 'system',
        content: zhiIntrusionSystemPrompt(llmCtx.pathway, llmCtx.curriculumTrack, uid),
      },
      {
        role: 'user',
        content: appendSnapshotToUserPrompt(userPromptBase, llmCtx.snapshotBlock),
      },
    ], {
      traceId: `zhi_intrusion_${uid}`,
      maxTokens: 900,
      flatWarp: { cost: WARP_COST.MENTOR_INTERVENTION, reason: 'MENTOR_INTERVENTION' },
    });

    if (!gw.chargeOk) {
      return {
        ...heuristicZhi({
          targetSchool,
          challengeIndex,
          userFeedback,
          lowWarp: true,
          pathway: llmCtx.pathway,
        }),
        warpPointsRemaining: gw.warpRemaining,
      };
    }

    let parsed: Partial<ZhiIntrusionResult> | null = gw.data;
    if (!parsed && gw.usedFallback) {
      console.warn('[ZhiCore] LLM 降级:', gw.error);
    } else if (parsed) {
      parsed = parseZhiJson(JSON.stringify(parsed)) ?? parsed;
    }

    const base = parsed
      ? {
          zhiOpening: parsed.zhiOpening || '',
          activatedTool: parsed.activatedTool ?? 'VISION_INTERCEPT',
          zhiTip: parsed.zhiTip || '',
          zhiCoachNote: parsed.zhiCoachNote || '',
        }
      : heuristicZhi({
          targetSchool,
          challengeIndex,
          userFeedback,
          lowWarp: false,
          pathway: llmCtx.pathway,
        });

    const baselineSuffix = needsBaseline ? ` ${ZHI_BASELINE_PHOTO_INVITE_SHORT}` : '';

    const llmCtxUser = { userId: uid };
    return {
      zhiOpening: sanitizeLlmOutput(
        base.zhiOpening ||
          `曦宝，我是 ZHI。盯住【${targetSchool}】，阻力 ${challengeIndex}%，现在就开始物理改变。`,
        llmCtxUser,
      ),
      activatedTool: needsBaseline ? 'VISION_INTERCEPT' : (base.activatedTool ?? 'VISION_INTERCEPT'),
      zhiTip: sanitizeLlmOutput(
        (base.zhiTip || '今晚必须完成一次真实撞击。') + baselineSuffix,
        llmCtxUser,
      ),
      zhiCoachNote: sanitizeLlmOutput(
        base.zhiCoachNote || pathwayCoachNote(llmCtx.pathway),
        llmCtxUser,
      ),
      challengeIndex,
      targetSchool,
      warpPointsRemaining: gw.warpRemaining,
      warpDeducted: gw.warpDeducted,
    };
  }
}
