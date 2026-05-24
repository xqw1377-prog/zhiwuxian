import OpenAI from 'openai';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { ensureWarpLedger } from '../db/relay-schema';
import { getBaselineStatus } from '../db/baseline-schema';
import { getReversingMetrics } from '../db/milestone-schema';
import { resolveUserLlm } from './deepseek-client';
import { gatewayJsonCompletion } from './llm-gateway';

export type OmniStage = 'TARGET' | 'BASELINE' | 'DASHBOARD';
export type OmniTool = 'NONE' | 'VISION_INTERCEPT' | 'METRICS_INPUT' | 'PATH_RECONFIG';

export type InterventionResponse = {
  success: boolean;
  shouldTrigger: boolean;
  stage: OmniStage;
  mentorText: string;
  activeTool: OmniTool;
  remainingWarp: number;
  chargedWarp: number;
};

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function normalizeTool(v: unknown): OmniTool {
  const s = String(v ?? '').toUpperCase().trim();
  if (s === 'VISION_INTERCEPT') return 'VISION_INTERCEPT';
  if (s === 'METRICS_INPUT') return 'METRICS_INPUT';
  if (s === 'PATH_RECONFIG') return 'PATH_RECONFIG';
  return 'NONE';
}

function normalizeStage(v: unknown): OmniStage | null {
  const s = String(v ?? '').toUpperCase().trim();
  if (s === 'TARGET') return 'TARGET';
  if (s === 'BASELINE') return 'BASELINE';
  if (s === 'DASHBOARD') return 'DASHBOARD';
  return null;
}

function inferStage(input: { hasTarget: boolean; hasBaseline: boolean }): OmniStage {
  if (!input.hasTarget) return 'TARGET';
  if (!input.hasBaseline) return 'BASELINE';
  return 'DASHBOARD';
}

function computeCharge(tool: OmniTool): number {
  const base = 2;
  if (tool === 'METRICS_INPUT') return base + 1;
  if (tool === 'VISION_INTERCEPT') return base + 2;
  if (tool === 'PATH_RECONFIG') return base + 3;
  return base;
}

function consumeWarpPointsStrict(userId: string, charge: number): { ok: boolean; remaining: number } {
  const db = getLearningDb();
  ensureWarpLedger(userId);
  const c = clampInt(charge, 0, 9999, 0);
  return db.transaction(() => {
    const row = db.prepare(`SELECT available_warp_points FROM warp_ledger WHERE user_id = ?`).get(userId) as {
      available_warp_points: number;
    };
    const cur = Number(row?.available_warp_points ?? 0);
    if (cur < c) return { ok: false, remaining: cur };
    db.prepare(`UPDATE warp_ledger SET available_warp_points = available_warp_points - ? WHERE user_id = ?`).run(c, userId);
    const after = db.prepare(`SELECT available_warp_points FROM warp_ledger WHERE user_id = ?`).get(userId) as {
      available_warp_points: number;
    };
    return { ok: true, remaining: Number(after.available_warp_points ?? 0) };
  })();
}

function shouldTriggerPassive(input: { stage: OmniStage; userText?: string; daysLeft?: number; progress?: number }): boolean {
  if (typeof input.userText === 'string' && input.userText.trim()) return true;
  const daysLeft = Number(input.daysLeft ?? 999);
  const progress = Number(input.progress ?? 0);
  if (input.stage === 'TARGET') return true;
  if (input.stage === 'BASELINE') return true;
  if (input.stage === 'DASHBOARD' && progress < 45) return true;
  if (daysLeft <= 30 && progress < 55) return true;
  if (daysLeft <= 7 && progress < 60) return true;
  if (daysLeft <= 14 && progress < 25) return true;
  return false;
}

function getDeepseekClient(userId: string): { client: OpenAI; model: string; usesPrivateKey: boolean } | null {
  const llm = resolveUserLlm(userId);
  if (!llm) return null;
  return { client: llm.client, model: llm.model, usesPrivateKey: llm.usesPrivateKey };
}

export class OmniOrchestrator {
  public static async processIntrusion(input: {
    userId: string;
    userText?: string;
    force?: boolean;
  }): Promise<InterventionResponse> {
    const userId = input.userId.trim();
    const userText = typeof input.userText === 'string' ? input.userText.trim() : '';
    if (!userId) {
      return {
        success: false,
        shouldTrigger: false,
        stage: 'TARGET',
        mentorText: '缺少 userId。',
        activeTool: 'NONE',
        remainingWarp: 0,
        chargedWarp: 0,
      };
    }

    const ledger = ensureWarpLedger(userId);
    const baseline = getBaselineStatus(userId);
    const metrics = getReversingMetrics(userId);

    const hasTarget = Boolean(metrics?.targetDestination);
    const hasBaseline = Boolean(baseline);
    const stageHint = inferStage({ hasTarget, hasBaseline });
    const daysLeft = metrics?.daysLeft ?? 999;
    const progress = metrics?.progressPercentage ?? 0;

    const passiveTrigger = shouldTriggerPassive({ stage: stageHint, userText: userText || undefined, daysLeft, progress });
    const shouldTrigger = Boolean(input.force) || passiveTrigger;
    if (!shouldTrigger) {
      return {
        success: true,
        shouldTrigger: false,
        stage: stageHint,
        mentorText: '',
        activeTool: 'NONE',
        remainingWarp: Number(ledger.available_warp_points ?? 0),
        chargedWarp: 0,
      };
    }

    if (Number(ledger.available_warp_points ?? 0) <= 0) {
      return {
        success: false,
        shouldTrigger: true,
        stage: stageHint,
        mentorText: '曦宝，你在平台托管的算力燃料（Warp Points）已耗尽。先补燃料，别让时间线断裂。',
        activeTool: 'NONE',
        remainingWarp: 0,
        chargedWarp: 0,
      };
    }

    const deepseek = getDeepseekClient(userId);
    if (!deepseek) {
      return {
        success: false,
        shouldTrigger: true,
        stage: stageHint,
        mentorText: 'DeepSeek 调度器未配置。请先在“模型钥匙”里写入 DeepSeek Key。',
        activeTool: hasTarget ? (hasBaseline ? 'VISION_INTERCEPT' : 'METRICS_INPUT') : 'METRICS_INPUT',
        remainingWarp: Number(ledger.available_warp_points ?? 0),
        chargedWarp: 0,
      };
    }

    const systemPrompt = [
      '你是一个直接介入学生生活、铁血护短的高段位【人生导师】。',
      '当学生向你打字汇报，或者系统触发主动遥测时，你需要主动给出下一步指令，并就地开启最适合他的工具。',
      '',
      '【工具箱】',
      '- METRICS_INPUT：当发现学生刚设定目标或长期未更新成绩/弱项底牌时，亮出表单工具。',
      '- VISION_INTERCEPT：当学生表示卡住/看不懂/重复撞击时，激活卡点雷达。',
      '- PATH_RECONFIG：当学生改变目标或局势恶化需要重算路径时，重组因果计划。',
      '- NONE：纯对话。',
      '',
      '请严格返回 JSON：',
      '{',
      '  "suggestedStage": "TARGET|BASELINE|DASHBOARD",',
      '  "mentorWords": "必须包含曦宝，40字内，直指死线与痛点",',
      '  "toolToActivate": "METRICS_INPUT|VISION_INTERCEPT|PATH_RECONFIG|NONE"',
      '}',
    ].join('\n');

    const payload = [
      `【当前阶段】:${stageHint}`,
      `【目标】:${metrics?.targetDestination ?? '未设定'}`,
      `【剩余天数】:${daysLeft}`,
      `【当前进度】:${progress}%`,
      `【是否已提交现状】:${hasBaseline ? '是' : '否'}`,
      `【用户输入/遥测】:${userText || '系统自动流速遥测触发'}`,
    ].join('\n');

    let decision: Record<string, unknown> | null = null;
    try {
      const gw = await gatewayJsonCompletion<{
        suggestedStage?: string;
        mentorWords?: string;
        toolToActivate?: string;
      }>(userId, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: payload },
      ], {
        traceId: `omni_${userId}`,
        billable: false,
      });
      decision = gw.data;
      if (!decision && gw.error) throw new Error(gw.error);
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      const authFail = /Authentication Fails|401|unauthorized/i.test(msg);
      return {
        success: false,
        shouldTrigger: true,
        stage: stageHint,
        mentorText: authFail
          ? 'DeepSeek 鉴权失败。先修复平台调度器的引力源密钥。'
          : '调度器暂时失联。今晚别赌：先把现状与弱项交出来。',
        activeTool: hasTarget ? (hasBaseline ? 'VISION_INTERCEPT' : 'METRICS_INPUT') : 'METRICS_INPUT',
        remainingWarp: Number(ledger.available_warp_points ?? 0),
        chargedWarp: 0,
      };
    }

    const stage = normalizeStage(decision?.suggestedStage) ?? stageHint;
    const mentorText = String(decision?.mentorWords ?? '').trim() || '曦宝，别绕。把底牌交出来，今晚只做一件事。';
    const activeTool = normalizeTool(decision?.toolToActivate);
    const charge = computeCharge(activeTool);

    const consume = consumeWarpPointsStrict(userId, charge);
    if (!consume.ok) {
      return {
        success: false,
        shouldTrigger: true,
        stage,
        mentorText: '曦宝，平台托管 Warp Points 不够了。先补燃料，再谈计划。',
        activeTool: 'NONE',
        remainingWarp: consume.remaining,
        chargedWarp: 0,
      };
    }

    return {
      success: true,
      shouldTrigger: true,
      stage,
      mentorText,
      activeTool,
      remainingWarp: consume.remaining,
      chargedWarp: charge,
    };
  }
}
