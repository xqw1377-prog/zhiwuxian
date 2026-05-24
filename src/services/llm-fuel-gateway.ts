import type { LlmChatMessage, LlmChatMessageParam } from '../../server/llm/llm-provider';
import { WARP_COST } from './billing-hub';
import {
  gatewayJsonCompletion,
  gatewayOpenAiMessages,
  gatewayTextCompletion,
  resolveDeepseekGatewayLlm,
  resolveVisionGatewayLlm,
  type GatewayJsonResult,
} from './llm-gateway';

export type FuelTaskType =
  | 'CHAT_LIGHT'
  | 'ROUTE_REROUTE'
  | 'VISION_INTERCEPT'
  | 'VISION_INTAKE'
  | 'VISION_RELAY'
  | 'VISION_SOLVE'
  | 'SHADOW_SPAR_MUTATE'
  | 'SHADOW_SPAR_VERIFY';

type FuelChannel = 'text' | 'vision';

export type FuelTaskPolicy = {
  channel: FuelChannel;
  cost: number;
  reason: keyof typeof WARP_COST | string;
  maxTokens: number;
  timeoutMs: number;
  temperature: number;
  /** 是否允许未来引入更贵模型兜底（当前实现不启用升级池） */
  allowUpgrade?: boolean;
};

export const FUEL_TASK_POLICY: Record<FuelTaskType, FuelTaskPolicy> = {
  CHAT_LIGHT: {
    channel: 'text',
    cost: WARP_COST.CHAT_COMPLETION,
    reason: 'CHAT_COMPLETION',
    maxTokens: 260,
    timeoutMs: 18_000,
    temperature: 0.6,
  },
  ROUTE_REROUTE: {
    channel: 'text',
    cost: WARP_COST.PLANNER_REGEN,
    reason: 'PLANNER_REGEN',
    maxTokens: 900,
    timeoutMs: 25_000,
    temperature: 0.25,
    allowUpgrade: true,
  },
  VISION_INTERCEPT: {
    channel: 'vision',
    cost: WARP_COST.VISION_INTERCEPT,
    reason: 'VISION_INTERCEPT',
    maxTokens: 220,
    timeoutMs: 22_000,
    temperature: 0.2,
  },
  VISION_INTAKE: {
    channel: 'vision',
    cost: WARP_COST.CHAT_COMPLETION,
    reason: 'VISION_INTAKE',
    maxTokens: 1200,
    timeoutMs: 35_000,
    temperature: 0.2,
  },
  VISION_RELAY: {
    channel: 'text',
    cost: WARP_COST.VISION_RELAY,
    reason: 'VISION_RELAY',
    maxTokens: 180,
    timeoutMs: 16_000,
    temperature: 0.2,
  },
  VISION_SOLVE: {
    channel: 'vision',
    cost: WARP_COST.CHAT_COMPLETION,
    reason: 'VISION_SOLVE',
    maxTokens: 2000,
    timeoutMs: 40_000,
    temperature: 0.2,
  },
  SHADOW_SPAR_MUTATE: {
    channel: 'text',
    cost: WARP_COST.SHADOW_SPAR,
    reason: 'SHADOW_SPAR',
    maxTokens: 700,
    timeoutMs: 25_000,
    temperature: 0.25,
    allowUpgrade: true,
  },
  SHADOW_SPAR_VERIFY: {
    channel: 'text',
    cost: 0,
    reason: 'SHADOW_SPAR_VERIFY',
    maxTokens: 300,
    timeoutMs: 18_000,
    temperature: 0.2,
  },
};

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function resolvePolicy(taskType: FuelTaskType, overrides?: Partial<FuelTaskPolicy>): FuelTaskPolicy {
  const base = FUEL_TASK_POLICY[taskType];
  const merged: FuelTaskPolicy = { ...base, ...(overrides ?? {}) };
  return {
    ...merged,
    maxTokens: clampInt(Number(merged.maxTokens ?? base.maxTokens), 32, 4000),
    timeoutMs: clampInt(Number(merged.timeoutMs ?? base.timeoutMs), 2000, 120_000),
    temperature: Math.max(0, Math.min(1, Number(merged.temperature ?? base.temperature))),
    cost: Math.max(0, clampInt(Number(merged.cost ?? base.cost), 0, 10_000)),
  };
}

function resolveLlmForTask(userId: string, policy: FuelTaskPolicy) {
  return policy.channel === 'vision'
    ? resolveVisionGatewayLlm(userId)
    : resolveDeepseekGatewayLlm(userId);
}

export async function fuelJson<T>(
  userId: string,
  taskType: FuelTaskType,
  messages: LlmChatMessage[],
  options?: {
    traceId?: string;
    policyOverride?: Partial<FuelTaskPolicy>;
    minWarpBalance?: number;
  },
): Promise<GatewayJsonResult<T>> {
  const uid = userId.trim();
  const policy = resolvePolicy(taskType, options?.policyOverride);
  const llm = resolveLlmForTask(uid, policy);
  return gatewayJsonCompletion<T>(uid, messages, {
    traceId: options?.traceId ?? `${taskType.toLowerCase()}_${uid}`,
    timeout: policy.timeoutMs,
    temperature: policy.temperature,
    maxTokens: policy.maxTokens,
    minWarpBalance: options?.minWarpBalance,
    llm,
    ...(policy.cost > 0 ? { flatWarp: { cost: policy.cost, reason: policy.reason } } : { billable: false }),
  });
}

export async function fuelText(
  userId: string,
  taskType: FuelTaskType,
  messages: LlmChatMessage[],
  options?: {
    traceId?: string;
    policyOverride?: Partial<FuelTaskPolicy>;
    minWarpBalance?: number;
  },
): Promise<GatewayJsonResult<string>> {
  const uid = userId.trim();
  const policy = resolvePolicy(taskType, options?.policyOverride);
  const llm = resolveLlmForTask(uid, policy);
  return gatewayTextCompletion(uid, messages, {
    traceId: options?.traceId ?? `${taskType.toLowerCase()}_${uid}`,
    timeout: policy.timeoutMs,
    temperature: policy.temperature,
    maxTokens: policy.maxTokens,
    minWarpBalance: options?.minWarpBalance,
    llm,
    ...(policy.cost > 0 ? { flatWarp: { cost: policy.cost, reason: policy.reason } } : { billable: false }),
  });
}

export async function fuelOpenAiMessages(
  userId: string,
  taskType: FuelTaskType,
  messages: LlmChatMessageParam[],
  options?: {
    traceId?: string;
    jsonMode?: boolean;
    policyOverride?: Partial<FuelTaskPolicy>;
    minWarpBalance?: number;
  },
): Promise<GatewayJsonResult<string>> {
  const uid = userId.trim();
  const policy = resolvePolicy(taskType, options?.policyOverride);
  const llm = resolveLlmForTask(uid, policy);
  return gatewayOpenAiMessages(uid, messages, {
    traceId: options?.traceId ?? `${taskType.toLowerCase()}_${uid}`,
    timeout: policy.timeoutMs,
    temperature: policy.temperature,
    maxTokens: policy.maxTokens,
    minWarpBalance: options?.minWarpBalance,
    jsonMode: options?.jsonMode,
    llm,
    ...(policy.cost > 0 ? { flatWarp: { cost: policy.cost, reason: policy.reason } } : { billable: false }),
  });
}
