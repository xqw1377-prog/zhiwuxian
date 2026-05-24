/**
 * WUXIAN · 【ZHI】影子肉搏战 — 防假装学懂
 */

import { resolveUserLlm } from './deepseek-client';
import { assertWarpBalance, chargePlatformCompute, WARP_COST } from './billing-hub';
import { fuelJson } from './llm-fuel-gateway';
import { getMentorPlanView } from '../db/school-matrix';
import { ZhiTopologyEngine } from './zhi-topology';
import { DestinyExecutionEngine } from './destiny-engine';

export interface ShadowSparPayload {
  zhiWhisper: string;
  shadowProblem: string;
  shadowHint: string;
  syllabusDirect: string;
  warpPointsRemaining: number;
  warpDeducted: number;
}

export interface ShadowVerifyResult {
  passed: boolean;
  zhiWhisper: string;
  challengeIndex: number;
  warpPointsRemaining: number;
  warpDeducted: number;
  topology?: Awaited<ReturnType<typeof ZhiTopologyEngine.analyzeBreakpoint>>;
  destiny?: Awaited<ReturnType<typeof DestinyExecutionEngine.registerHardWork>>;
}

const MUTATE_SYSTEM = `你是【ZHI】的影子变异引擎。用户声称「学懂了」——你必须生成一道考查相同底层逻辑、但变量/图形/情境完全不同的变式题。
严格 JSON，无 Markdown：
{
  "zhiWhisper": "冷酷低语，含曦宝，指出真懂须肉搏影子题",
  "shadowProblem": "完整影子变式题题干（AP/托福风格，80字内）",
  "shadowHint": "只给方向不给答案：第一步应建立什么关系式",
  "syllabusDirect": "对应考纲 Unit"
}`;

const VERIFY_SYSTEM = `你是【ZHI】的推导裁判。判断学生的「第一步因果推导」是否抓住影子题底层逻辑（不要求完整解题）。
JSON：
{
  "passed": true或false,
  "zhiWhisper": "通过或重载解析的冷酷一句，含曦宝"
}`;

function parseJson<T extends Record<string, unknown>>(content: string): Partial<T> | null {
  try {
    return JSON.parse(content) as Partial<T>;
  } catch {
    return null;
  }
}

export class ZhiShadowEngine {
  static async spawnShadow(input: {
    userId: string;
    context: string;
    coachNote?: string;
    syllabusDirect?: string;
  }): Promise<ShadowSparPayload> {
    const uid = input.userId.trim();
    const context = input.context.trim() || 'AP 微积分级数收敛判定';

    const balance = assertWarpBalance(uid, WARP_COST.SHADOW_SPAR);
    if (!balance.ok) {
      return {
        zhiWhisper: '曦宝，Warp 燃料见底。影子肉搏战熄火——先充值。',
        shadowProblem: '设 ∑(n=1→∞) (-1)^n · n/(n+1) 的收敛性，用交错级数判别法写出第一步。',
        shadowHint: '先验证通项是否趋于 0，再套 Leibniz。',
        syllabusDirect: input.syllabusDirect ?? 'AP Calculus BC · Unit 10.15',
        warpPointsRemaining: balance.remaining,
        warpDeducted: 0,
      };
    }

    if (!resolveUserLlm(uid) && !process.env.DEEPSEEK_API_KEY?.trim()) {
      return {
        zhiWhisper:
          '曦宝，真懂还是假懂？把这道影子题的第一步因果推导敲进来。做对了解锁，做错了解析重载。',
        shadowProblem:
          '影子变式：讨论 ∑(n=2→∞) (ln n)/(n·√n) 的收敛性（禁止照搬原题符号结构）。',
        shadowHint: '第一步：用积分判别法比较 p-级数。',
        syllabusDirect: input.syllabusDirect ?? 'AP Calculus BC · Unit 10.14',
        warpPointsRemaining: balance.remaining,
        warpDeducted: 0,
      };
    }

    let parsed: Partial<ShadowSparPayload> | null = null;
    let warpRemaining = balance.remaining;
    let warpDeducted = 0;
    try {
      const gw = await fuelJson<Partial<ShadowSparPayload>>(uid, 'SHADOW_SPAR_MUTATE', [
        { role: 'system', content: MUTATE_SYSTEM },
        {
          role: 'user',
          content: `原卡点: ${context}\n小抄: ${input.coachNote ?? '无'}\n考纲: ${input.syllabusDirect ?? 'AP Calc BC'}`,
        },
      ], {
        traceId: `shadow_mutate_${uid}`,
        policyOverride: { maxTokens: 700 },
      });
      if (!gw.chargeOk) {
        return {
          zhiWhisper: '曦宝，算力不足。影子题已生成但无法清算——充值后继续肉搏。',
          shadowProblem: '影子变式：判定 ∑(n=1→∞) cos²n / n² 是否收敛。',
          shadowHint: '比较判别法 + 有界性。',
          syllabusDirect: input.syllabusDirect ?? 'AP Calculus BC · Unit 10.14',
          warpPointsRemaining: gw.warpRemaining,
          warpDeducted: 0,
        };
      }
      warpRemaining = gw.warpRemaining;
      warpDeducted = gw.warpDeducted;
      if (gw.data) parsed = gw.data;
    } catch (err) {
      console.warn('[ZhiShadow] mutate 降级:', err);
    }

    return {
      zhiWhisper:
        parsed?.zhiWhisper ??
        '曦宝，真懂还是假懂？把这道影子题的第一步因果推导敲进来。做对了解锁，做错了解析重载，算力加倍扣除。',
      shadowProblem:
        parsed?.shadowProblem ??
        '影子变式：讨论 ∑(n=2→∞) (ln n)/(n·√n) 的收敛性（变量与图形均已变异）。',
      shadowHint: parsed?.shadowHint ?? '第一步：积分判别 + 比较 p-级数。',
      syllabusDirect:
        parsed?.syllabusDirect ?? input.syllabusDirect ?? 'AP Calculus BC · Unit 10.14',
      warpPointsRemaining: warpRemaining,
      warpDeducted: warpDeducted,
    };
  }

  static async verifyShadowAttempt(input: {
    userId: string;
    shadowProblem: string;
    attempt: string;
    syllabusDirect?: string;
  }): Promise<ShadowVerifyResult> {
    const uid = input.userId.trim();
    const attempt = input.attempt.trim();
    if (!attempt) throw new Error('请提交第一步推导');

    const llm = resolveUserLlm(uid);

    let passed = attempt.length >= 12;
    let zhiWhisper = passed
      ? '算你有骨气。影子题第一步因果已对齐——锁解除，引力轨回正。'
      : '曦宝，这叫敷衍。解析重载，再撞一次。';

    if (resolveUserLlm(uid) || process.env.DEEPSEEK_API_KEY?.trim()) {
      try {
        const gw = await fuelJson<{ passed?: boolean; zhiWhisper?: string }>(uid, 'SHADOW_SPAR_VERIFY', [
          { role: 'system', content: VERIFY_SYSTEM },
          {
            role: 'user',
            content: `影子题:\n${input.shadowProblem}\n\n学生第一步:\n${attempt}`,
          },
        ], {
          traceId: `shadow_verify_${uid}`,
          policyOverride: { maxTokens: 300 },
        });
        const raw = gw.data;
        if (raw?.passed != null) passed = Boolean(raw.passed);
        if (raw?.zhiWhisper) zhiWhisper = String(raw.zhiWhisper).slice(0, 200);
      } catch {
        /* heuristic */
      }
    }

    let warpRemaining = assertWarpBalance(uid, 0).remaining;
    let warpDeducted = 0;

    if (!passed) {
      const penalty = chargePlatformCompute(
        uid,
        WARP_COST.SHADOW_SPAR,
        'SHADOW_FAIL_RELOAD',
        llm?.usesPrivateKey ?? false,
      );
      warpRemaining = penalty.remaining;
      warpDeducted = penalty.deducted;
    }

    let destiny: ShadowVerifyResult['destiny'];
    let challengeIndex = 0;
    let topology: ShadowVerifyResult['topology'];

    if (passed) {
      topology = await ZhiTopologyEngine.analyzeBreakpoint({
        userId: uid,
        intentText: `影子肉搏通过: ${attempt.slice(0, 80)}`,
        subjectTrack: 'AP_CALC_BC',
        applyDestiny: true,
        warpReason: 'MENTOR_INTERVENTION',
        warpAmount: WARP_COST.MENTOR_INTERVENTION,
      });
      challengeIndex = topology.challengeIndex;
      destiny = topology.destiny;
      warpRemaining = topology.warpPointsRemaining;
      warpDeducted += topology.warpDeducted;
    } else {
      const plan = getMentorPlanView(uid);
      challengeIndex = Number(plan?.challengeIndex ?? 92);
    }

    return {
      passed,
      zhiWhisper,
      challengeIndex,
      warpPointsRemaining: warpRemaining,
      warpDeducted,
      topology,
      destiny,
    };
  }
}
