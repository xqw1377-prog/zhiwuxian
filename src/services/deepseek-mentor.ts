/**
 * WUXIAN 3.5 · DeepSeek 主动帮扶导师（平台代收算力）
 */

import { getMentorPlanView, getSchoolMatrixRow } from '../db/school-matrix';
import { getReversingMetrics } from '../db/milestone-schema';
import { resolveUserLlm } from './deepseek-client';
import { assertWarpBalance, WARP_COST } from './billing-hub';
import { gatewayJsonCompletion } from './llm-gateway';
import type { SchoolPathway } from './school-pathway';
import {
  appendSnapshotToUserPrompt,
  mentorInterventionSystemPrompt,
  pathwayMentorOpening,
  resolveZhiLlmContext,
} from './zhi-llm-prompts';

export type DeepSeekTool = 'NONE' | 'METRICS_INPUT' | 'VISION_INTERCEPT' | 'PATH_RECONFIG';

export interface DeepSeekIntervention {
  shouldTrigger: boolean;
  mentorOpening?: string;
  requiredTool?: DeepSeekTool;
  coachTip?: string;
  challengeIndex?: number;
  targetSchool?: string;
  warpPointsRemaining?: number;
  warpDeducted?: number;
  platformHosted?: boolean;
}

function parseInterventionJson(content: string): Partial<DeepSeekIntervention> | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    const tool = String(raw.requiredTool ?? 'NONE').toUpperCase();
    const requiredTool: DeepSeekTool =
      tool === 'METRICS_INPUT' || tool === 'VISION_INTERCEPT' || tool === 'PATH_RECONFIG'
        ? tool
        : tool === 'NONE'
          ? 'NONE'
          : 'VISION_INTERCEPT';
    return {
      mentorOpening: String(raw.mentorOpening ?? '').trim().slice(0, 240),
      requiredTool,
      coachTip: String(raw.coachTip ?? '').trim().slice(0, 200),
    };
  } catch {
    return null;
  }
}

function heuristicIntervention(input: {
  targetSchool: string;
  challengeIndex: number;
  lowWarp: boolean;
  pathway: SchoolPathway;
}): DeepSeekIntervention {
  if (input.lowWarp) {
    return {
      shouldTrigger: true,
      mentorOpening:
        '曦宝，你在平台代收的算力燃料（Warp Points）已耗尽。导师的因果透镜正在假死，请立即充值接入算力，不要让时间线断裂。',
      requiredTool: 'NONE',
      coachTip: '算力断供警告',
      challengeIndex: input.challengeIndex,
      targetSchool: input.targetSchool,
    };
  }

  return {
    shouldTrigger: true,
    mentorOpening: pathwayMentorOpening(
      input.targetSchool,
      input.challengeIndex,
      input.pathway,
    ),
    requiredTool: input.challengeIndex >= 80 ? 'VISION_INTERCEPT' : 'METRICS_INPUT',
    coachTip:
      input.pathway === 'domestic_cn'
        ? '打开指标清算或摄影拦截，上传今日数学/物理卷面或 CSP 练习记录。'
        : '打开导师指定的工具卡片，完成一次真实投喂或现状清算，不要假装努力。',
    challengeIndex: input.challengeIndex,
    targetSchool: input.targetSchool,
  };
}

export class DeepSeekActiveMentor {
  /**
   * 平台代收算力：检查 Warp → 读取航标 → DeepSeek 主动干预 → 扣减燃料
   */
  static async checkAndIntervene(userId: string, opts?: { force?: boolean }): Promise<DeepSeekIntervention> {
    const uid = userId.trim();
    if (!uid) return { shouldTrigger: false };

    const llmCtx = resolveZhiLlmContext(uid);
    const balance = assertWarpBalance(uid, 1);
    const mentorPlan = getMentorPlanView(uid);
    const matrixRow = getSchoolMatrixRow(uid);
    const metrics = getReversingMetrics(uid);

    const targetSchool =
      mentorPlan?.targetSchool ?? matrixRow?.target_school ?? metrics?.targetDestination ?? '';
    const challengeIndex = Number(
      mentorPlan?.challengeIndex ?? matrixRow?.challenge_index ?? metrics?.progressPercentage ?? 70,
    );

    if (!balance.ok) {
      return {
        ...heuristicIntervention({
          targetSchool: targetSchool || '目标院校',
          challengeIndex,
          lowWarp: true,
          pathway: llmCtx.pathway,
        }),
        warpPointsRemaining: balance.remaining,
        platformHosted: true,
      };
    }

    if (!targetSchool && !opts?.force) {
      return { shouldTrigger: false };
    }

    if (!resolveUserLlm(uid) && !process.env.DEEPSEEK_API_KEY?.trim()) {
      return {
        ...heuristicIntervention({
          targetSchool: targetSchool || '梦校航道',
          challengeIndex,
          lowWarp: false,
          pathway: llmCtx.pathway,
        }),
        warpPointsRemaining: balance.remaining,
      };
    }

    const userPromptBase = [
      `【目标学校】: ${targetSchool || '未设定'}`,
      `【升学路径】: ${llmCtx.pathway}`,
      `【当前命运阻力】: ${challengeIndex}%`,
      `【现状基线】: ${matrixRow?.current_baseline ?? mentorPlan?.currentBaseline ?? '{}'}`,
      `【逆向进度】: ${metrics?.progressPercentage ?? 0}%`,
      `【剩余天数】: ${metrics?.daysLeft ?? '未知'}`,
    ].join('\n');

    const gw = await gatewayJsonCompletion<Partial<DeepSeekIntervention>>(uid, [
      { role: 'system', content: mentorInterventionSystemPrompt(llmCtx.pathway) },
      {
        role: 'user',
        content: appendSnapshotToUserPrompt(userPromptBase, llmCtx.snapshotBlock),
      },
    ], {
      traceId: `mentor_${uid}`,
      maxTokens: 600,
      flatWarp: { cost: WARP_COST.MENTOR_INTERVENTION, reason: 'MENTOR_INTERVENTION' },
    });

    if (!gw.chargeOk) {
      return {
        ...heuristicIntervention({
          targetSchool: targetSchool || '目标院校',
          challengeIndex,
          lowWarp: true,
          pathway: llmCtx.pathway,
        }),
        warpPointsRemaining: gw.warpRemaining,
      };
    }

    let parsed: Partial<DeepSeekIntervention> | null = null;
    if (gw.data) {
      parsed = parseInterventionJson(JSON.stringify(gw.data)) ?? gw.data;
    } else if (gw.usedFallback) {
      console.warn('[DeepSeekMentor] LLM 降级:', gw.error);
    }

    const base: DeepSeekIntervention = parsed
      ? {
          shouldTrigger: true,
          mentorOpening: parsed.mentorOpening,
          requiredTool: parsed.requiredTool ?? 'VISION_INTERCEPT',
          coachTip: parsed.coachTip,
        }
      : heuristicIntervention({
          targetSchool: targetSchool || '梦校航道',
          challengeIndex,
          lowWarp: false,
          pathway: llmCtx.pathway,
        });

    return {
      ...base,
      challengeIndex,
      targetSchool: targetSchool || undefined,
      warpPointsRemaining: gw.warpRemaining,
      warpDeducted: gw.warpDeducted,
      platformHosted: !resolveUserLlm(uid)?.usesPrivateKey,
    };
  }
}
