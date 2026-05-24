/**
 * WUXIAN 3.0 · 导师心智引擎（洞悉人性、严苛护短的人生导师）
 */

import { resolveUserLlm } from './deepseek-client';
import { WARP_COST } from './billing-hub';
import { gatewayJsonCompletion } from './llm-gateway';
import {
  upsertMentorPlan,
  type CausalityGap,
  type DynamicMilestone,
  type MentorPlanView,
  type MilestoneStatus,
} from '../db/school-matrix';
import { initializeReversingMatrixSystem, upsertReversingMatrix } from '../db/milestone-schema';
import { getLearningDb } from '../../server/wuxian-learning-db';

export interface MentorConsultInput {
  userId: string;
  targetSchool: string;
  currentBaseline: Record<string, unknown>;
  daysToDeadline?: number;
}

const MENTOR_SYSTEM_PROMPT = `你是一个历经千帆、说话一针见血、却对学生有极高期许的顶级【人生导师】。
有一个学生向你提交了[目标名校]和[真实现状]。请为他完成深度人生重组规划。

输出四个维度，严格 JSON（不要 markdown）：
1. mentorWakeUpCall：当头棒喝，撕开自我麻痹，大白话点出段位差距（50字内，压迫感与唤醒感）。
2. challengeIndex：综合挑战指数 1-100。
3. causalityGaps：因果链数组，每项含 weakness、causalityEffect（弱项如何在未来导致崩盘）。
4. dynamicMilestones：逆向时间战役，每项含 codeName、deadline(YYYY-MM-DD)、mission、mentorWhisper。

格式：
{
  "mentorWakeUpCall": "",
  "challengeIndex": 0,
  "causalityGaps": [{"weakness":"","causalityEffect":""}],
  "dynamicMilestones": [{"codeName":"","deadline":"","mission":"","mentorWhisper":""}]
}`;

function clampChallenge(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 55;
  return Math.max(1, Math.min(100, Math.round(x)));
}

function parseMentorJson(content: string): Omit<MentorPlanView, 'userId' | 'targetSchool' | 'currentBaseline' | 'updatedAt' | 'activePhase'> | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    const causalityGaps: CausalityGap[] = Array.isArray(raw.causalityGaps)
      ? (raw.causalityGaps as Record<string, unknown>[])
          .map((g) => ({
            weakness: String(g.weakness ?? '').trim(),
            causalityEffect: String(g.causalityEffect ?? '').trim(),
          }))
          .filter((g) => g.weakness || g.causalityEffect)
      : [];

    const dynamicMilestones: DynamicMilestone[] = Array.isArray(raw.dynamicMilestones)
      ? (raw.dynamicMilestones as Record<string, unknown>[])
          .map((m) => ({
            codeName: String(m.codeName ?? m.phase ?? 'OPERATION').trim(),
            deadline: String(m.deadline ?? '').trim(),
            mission: String(m.mission ?? m.action ?? '').trim(),
            mentorWhisper: String(m.mentorWhisper ?? m.whisper ?? '').trim(),
            status: (['LOCKED', 'IN_PROGRESS', 'COMPLETED'].includes(
              String(m.status ?? '').toUpperCase(),
            )
              ? String(m.status).toUpperCase()
              : undefined) as MilestoneStatus | undefined,
          }))
          .filter((m) => m.codeName && m.deadline)
      : [];

    return {
      mentorWakeUpCall: String(raw.mentorWakeUpCall ?? '').trim().slice(0, 200),
      challengeIndex: clampChallenge(raw.challengeIndex),
      causalityGaps,
      dynamicMilestones,
    };
  } catch {
    return null;
  }
}

function heuristicMentorPlan(input: MentorConsultInput): Omit<MentorPlanView, 'userId' | 'currentBaseline' | 'updatedAt' | 'activePhase'> & { targetSchool: string } {
  const school = input.targetSchool.trim();
  const b = input.currentBaseline;
  const sat = Number(b.SAT ?? b.sat ?? 0);
  const toefl = Number(b.TOEFL ?? b.toefl ?? 0);

  const mentorWakeUpCall =
    sat > 0 && sat < 1450
      ? `看着我的眼睛：SAT ${sat} 想冲 ${school}，不是做梦是什么？今晚再刷手机，明天分母会直接把你压扁。拔刀。`
      : `现状和目标之间隔着一整条血路。你可以继续骗自己“还来得及”，也可以从现在起把每一天当成终审。`;

  const causalityGaps: CausalityGap[] = [
    {
      weakness: '标化底盘不稳',
      causalityEffect: '考场上时间一压缩，你会在压轴题全线崩盘，梦校门槛直接对你关门。',
    },
    {
      weakness: '高阶学科因果链断裂',
      causalityEffect: '文书和面试一旦追问底层推导，你会被贴上“高分低能”，推荐人也无法替你圆。',
    },
  ];

  const days = Math.max(30, input.daysToDeadline ?? 180);
  const now = Date.now();
  const fmt = (offsetDays: number) =>
    new Date(now + offsetDays * 86400000).toISOString().slice(0, 10);

  const dynamicMilestones: DynamicMilestone[] = [
    {
      codeName: 'OPERATION-01 // 补天战役',
      deadline: fmt(Math.round(days * 0.33)),
      mission: '用路径 B 疯狂投喂弱项截图，直到连续 7 天无卡点撞击。',
      mentorWhisper: '现在露怯总比考场上对着白卷哭体面。',
      status: 'IN_PROGRESS',
    },
    {
      codeName: 'OPERATION-02 // 标化破袭',
      deadline: fmt(Math.round(days * 0.66)),
      mission: '在极客算力中继下冲锋标化决战圈。',
      mentorWhisper: '硬骨头咬碎咽下去，入场券才会出现。',
      status: 'LOCKED',
    },
    {
      codeName: 'OPERATION-03 // 因果合流',
      deadline: fmt(days),
      mission: '锁死文书与活动叙事，完成梦校全分母节点。',
      mentorWhisper: '最后一程别怂，你配得上我押注的你。',
      status: 'LOCKED',
    },
  ];

  return {
    targetSchool: school,
    mentorWakeUpCall,
    challengeIndex: clampChallenge(72 + (sat < 1400 ? 18 : 8) + (toefl < 100 ? 10 : 0)),
    causalityGaps,
    dynamicMilestones,
  };
}

function syncReversingMatrix(userId: string, targetSchool: string, challengeIndex: number, daysToDeadline: number): void {
  initializeReversingMatrixSystem();
  const now = Math.floor(Date.now() / 1000);
  const deadlineTimestamp = now + daysToDeadline * 86400;
  const totalUnits = 100;
  const completedUnits = Math.max(1, Math.min(totalUnits - 1, Math.round((100 - challengeIndex) * 0.4)));

  upsertReversingMatrix({
    userId,
    targetDestination: targetSchool,
    baselineScore: 100 - challengeIndex,
    deadlineTimestamp,
    totalUnits,
    completedUnits,
  });

  getLearningDb().prepare(`
    UPDATE goal_reversing_matrix SET difficulty_index = ? WHERE user_id = ?
  `).run(challengeIndex, userId);
}

export class WuxianMentorEngine {
  /**
   * 召唤导师人格：判词 + 因果攻坚链 + 逆向战役，并写入 3.0 账本
   */
  static async consultAndArchitect(input: MentorConsultInput): Promise<MentorPlanView> {
    const userId = input.userId.trim();
    const targetSchool = input.targetSchool.trim();
    if (!userId || !targetSchool) {
      throw new Error('缺少 userId 或 targetSchool');
    }

    const daysToDeadline = Math.max(30, Math.min(1095, input.daysToDeadline ?? 180));
    const llm = resolveUserLlm(userId);

    let plan: Omit<MentorPlanView, 'userId' | 'currentBaseline' | 'updatedAt' | 'activePhase'> & {
      targetSchool: string;
    };

    if (resolveUserLlm(userId) || process.env.DEEPSEEK_API_KEY?.trim()) {
      const gw = await gatewayJsonCompletion<
        Omit<MentorPlanView, 'userId' | 'currentBaseline' | 'updatedAt' | 'activePhase'> & {
          targetSchool: string;
        }
      >(userId, [
        { role: 'system', content: MENTOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `【目标航标】: ${targetSchool}\n【现状评估】: ${JSON.stringify(input.currentBaseline)}\n【备考天数】: ${daysToDeadline}`,
        },
      ], {
        traceId: `mentor_consult_${userId}`,
        maxTokens: 1400,
        flatWarp: { cost: WARP_COST.MENTOR_CONSULT, reason: 'MENTOR_CONSULT' },
      });
      if (!gw.chargeOk) {
        plan = { ...heuristicMentorPlan(input), targetSchool };
      } else if (gw.data) {
        const parsed = parseMentorJson(JSON.stringify(gw.data)) ?? gw.data;
        plan = { ...parsed, targetSchool };
        if (!plan.mentorWakeUpCall) {
          plan.mentorWakeUpCall = heuristicMentorPlan(input).mentorWakeUpCall;
        }
      } else {
        if (gw.usedFallback) console.warn('[MentorEngine] LLM 降级:', gw.error);
        plan = { ...heuristicMentorPlan(input), targetSchool };
      }
    } else {
      plan = heuristicMentorPlan(input);
    }

    syncReversingMatrix(userId, targetSchool, plan.challengeIndex, daysToDeadline);

    return upsertMentorPlan({
      userId,
      targetSchool,
      currentBaseline: input.currentBaseline,
      mentorWakeUpCall: plan.mentorWakeUpCall,
      challengeIndex: plan.challengeIndex,
      causalityGaps: plan.causalityGaps,
      dynamicMilestones: plan.dynamicMilestones,
    });
  }
}
