/**
 * WUXIAN · 【ZHI】AP/托福多维因果断层拓扑
 * DeepSeek 输出强制解构为：考纲直击 / 因果断层 / 阻力扣减
 */

import { getMentorPlanView, getSchoolMatrixRow } from '../db/school-matrix';
import { resolveUserLlm } from './deepseek-client';
import { assertWarpBalance, WARP_COST, type BillingReason } from './billing-hub';
import { gatewayJsonCompletion } from './llm-gateway';
import { DestinyExecutionEngine } from './destiny-engine';

export type ZhiSubjectTrack = 'AP_CALC_BC' | 'AP_PHYS_C' | 'AP_CS_A' | 'TOEFL' | 'GENERAL';

export interface ZhiTopologyBreakdown {
  syllabusDirect: string;
  causalityGap: string;
  resistanceReduction: number;
  expectedApBefore: number;
  expectedApAfter: number;
  zhiVoiceLine: string;
  coachNote: string;
  challengeIndex: number;
  targetSchool: string;
  warpPointsRemaining: number;
  warpDeducted: number;
  destiny?: Awaited<ReturnType<typeof DestinyExecutionEngine.registerHardWork>>;
}

const AP_SYLLABUS_HINT = `
College Board 参考锚点（输出时须点名 Unit 编号）：
- AP Calculus BC: Unit 10.12–10.15 Taylor/Maclaurin, Unit 10.8–10.11 Series convergence
- AP Physics C Mechanics: Unit 3–4 Rotation, Unit 5 Oscillations
- AP CS A: Unit 3 Boolean/iteration, Unit 4 ArrayList
`;

const TOPOLOGY_SYSTEM = `你是【ZHI】的 AP/托福考纲拓扑引擎。禁止天马行空，必须按三模块输出 JSON（无 Markdown）：
{
  "syllabusDirect": "【考纲直击】College Board 官方考纲 Unit X.X 名称（中文+英文缩写）",
  "causalityGap": "【因果断层】精准指出高一/高二前置漏洞，为何此步卡住（一句硬核诊断）",
  "resistanceReduction": 3.5,
  "expectedApBefore": 3,
  "expectedApAfter": 5,
  "zhiVoiceLine": "耳机盲弹用：含「曦宝」，20字内，冷酷",
  "coachNote": "可落地第一步动作，30字内"
}
resistanceReduction 范围 1.5–4.0；expectedAp 为 1–5 整数。`;

function parseTopologyJson(content: string): Partial<ZhiTopologyBreakdown> | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    const reduction = Math.min(4, Math.max(1.5, Number(raw.resistanceReduction) || 3.5));
    return {
      syllabusDirect: String(raw.syllabusDirect ?? '').trim().slice(0, 200),
      causalityGap: String(raw.causalityGap ?? '').trim().slice(0, 240),
      resistanceReduction: reduction,
      expectedApBefore: Math.min(5, Math.max(1, Math.round(Number(raw.expectedApBefore) || 3))),
      expectedApAfter: Math.min(5, Math.max(1, Math.round(Number(raw.expectedApAfter) || 5))),
      zhiVoiceLine: String(raw.zhiVoiceLine ?? '').trim().slice(0, 120),
      coachNote: String(raw.coachNote ?? '').trim().slice(0, 160),
    };
  } catch {
    return null;
  }
}

function heuristicTopology(input: {
  targetSchool: string;
  challengeIndex: number;
  intentText: string;
  track: ZhiSubjectTrack;
}): Omit<ZhiTopologyBreakdown, 'warpPointsRemaining' | 'warpDeducted' | 'destiny'> {
  const track = input.track;
  const syllabus =
    track === 'AP_PHYS_C'
      ? 'College Board AP Physics C · Unit 4 Torque & Rotational Dynamics'
      : track === 'TOEFL'
        ? 'TOEFL iBT · Speaking Task 1 Independent (45s)'
        : 'College Board AP Calculus BC · Unit 10.13 Taylor Series Convergence';

  return {
    syllabusDirect: syllabus,
    causalityGap:
      '你在极限与级数之间的代数化简断层未闭合——高一无穷小量阶的比较直觉仍在拖后腿。',
    resistanceReduction: 3.5,
    expectedApBefore: 3,
    expectedApAfter: 5,
    zhiVoiceLine: `曦宝，${input.intentText.slice(0, 12) || '这步'}不是看懂，是撞穿。`,
    coachNote: '先写出泰勒展开首项，再用 Ratio Test 对级数逐项施压。',
    challengeIndex: input.challengeIndex,
    targetSchool: input.targetSchool,
  };
}

function inferTrack(intentText: string, hint?: ZhiSubjectTrack): ZhiSubjectTrack {
  if (hint && hint !== 'GENERAL') return hint;
  const t = intentText.toLowerCase();
  if (/托福|toefl|口语|speaking/i.test(intentText)) return 'TOEFL';
  if (/物理|力学|转动|torque|newton/i.test(t)) return 'AP_PHYS_C';
  if (/cs|计算机|array|java/i.test(t)) return 'AP_CS_A';
  if (/微积分|calculus|泰勒|taylor|integral|积分/i.test(intentText)) return 'AP_CALC_BC';
  return 'AP_CALC_BC';
}

export class ZhiTopologyEngine {
  /**
   * 结构化解构卡点：考纲直击 + 因果断层 + 阻力扣减
   */
  static async analyzeBreakpoint(input: {
    userId: string;
    intentText?: string;
    screenshotData?: string;
    subjectTrack?: ZhiSubjectTrack;
    applyDestiny?: boolean;
    warpReason?: keyof typeof WARP_COST | string;
    warpAmount?: number;
  }): Promise<ZhiTopologyBreakdown> {
    const uid = input.userId.trim();
    if (!uid) throw new Error('缺少 userId');

    const plan = getMentorPlanView(uid);
    const row = getSchoolMatrixRow(uid);
    const targetSchool = plan?.targetSchool ?? row?.target_school ?? '未锁定的彼岸';
    const challengeIndex = Number(plan?.challengeIndex ?? row?.challenge_index ?? 92);
    const intentText = (input.intentText ?? '屏幕盲投卡点').trim();
    const track = inferTrack(intentText, input.subjectTrack);

    const warpCost = input.warpAmount ?? WARP_COST.GHOST_BLIND;
    const balance = assertWarpBalance(uid, 1);
    if (!balance.ok) {
      const h = heuristicTopology({ targetSchool, challengeIndex, intentText, track });
      return { ...h, warpPointsRemaining: balance.remaining, warpDeducted: 0 };
    }

    if (!resolveUserLlm(uid) && !process.env.DEEPSEEK_API_KEY?.trim()) {
      const h = heuristicTopology({ targetSchool, challengeIndex, intentText, track });
      return { ...h, warpPointsRemaining: balance.remaining, warpDeducted: 0 };
    }

    const userContent = screenshotDataNote(input.screenshotData)
      ? `【盲投残影已入账】${intentText}\n${AP_SYLLABUS_HINT}\n学科轨: ${track}`
      : `【心流信号】${intentText}\n${AP_SYLLABUS_HINT}\n学科轨: ${track}`;

    let parsed: Partial<ZhiTopologyBreakdown> | null = null;
    let warpRemaining = balance.remaining;
    let warpDeducted = 0;
    try {
      const gw = await gatewayJsonCompletion<Partial<ZhiTopologyBreakdown>>(uid, [
        { role: 'system', content: TOPOLOGY_SYSTEM },
        {
          role: 'user',
          content: `航标: ${targetSchool} | 命运阻力: ${challengeIndex}%\n${userContent}`,
        },
      ], {
        traceId: `topology_${uid}`,
        maxTokens: 800,
        flatWarp: {
          cost: warpCost,
          reason: (input.warpReason ?? 'GHOST_BLIND') as BillingReason,
        },
      });
      if (!gw.chargeOk) {
        const h = heuristicTopology({ targetSchool, challengeIndex, intentText, track });
        return { ...h, warpPointsRemaining: gw.warpRemaining, warpDeducted: 0 };
      }
      warpRemaining = gw.warpRemaining;
      warpDeducted = gw.warpDeducted;
      if (gw.data) parsed = parseTopologyJson(JSON.stringify(gw.data)) ?? gw.data;
      else if (gw.error) console.warn('[ZhiTopology] 降级:', gw.error);
    } catch (err) {
      console.warn('[ZhiTopology] 降级:', err);
    }

    const base = parsed
      ? {
          ...heuristicTopology({ targetSchool, challengeIndex, intentText, track }),
          ...parsed,
          challengeIndex,
          targetSchool,
        }
      : heuristicTopology({ targetSchool, challengeIndex, intentText, track });

    let destiny: ZhiTopologyBreakdown['destiny'];
    if (input.applyDestiny) {
      const reduction = base.resistanceReduction;
      const solved = reduction >= 2 ? 1 : 0;
      destiny =
        (await DestinyExecutionEngine.registerHardWork(uid, 0.25, solved, {
          resolvedConcept: base.syllabusDirect.slice(0, 80),
        })) ?? undefined;
    }

    const idx = destiny?.challengeIndex ?? challengeIndex;

    return {
      ...base,
      challengeIndex: idx,
      warpPointsRemaining: warpRemaining,
      warpDeducted: warpDeducted,
      destiny,
    };
  }
}

function screenshotDataNote(data?: string): boolean {
  if (!data?.trim()) return false;
  return data.length > 200;
}
