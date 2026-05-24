/**
 * WUXIAN · 统一 LLM 网关（超时 / fallback / 计费不双扣）
 *
 * 计费策略（二选一）：
 * - flatWarp：平台托管先扣固定 Warp，调用 chatCompletionJson 时 billable=false
 * - 无 flatWarp：平台托管走 billable=true 按 token 扣费（initLlmBilling）
 * - 用户自备 Key：不扣平台 Warp
 */

import {
  chatCompletionJson,
  chatCompletionMessages,
  type ChatJsonResult,
  type LlmChatMessage,
  type LlmChatMessageParam,
} from '../../server/llm/llm-provider';
import { getUserLlmApiKey, getUserLlmSnapshot } from '../db/user-llm-config-schema';
import { DEEPSEEK_BASE_URL, resolveUserLlm } from './deepseek-client';
import { getPlatformQwenKey, resolveQwenVision } from './qwen-client';
import {
  assertWarpBalance,
  chargePlatformCompute,
  releaseLlmTokenReservation,
  reserveLlmTokens,
  type BillingReason,
} from './billing-hub';

export type GatewayWarpMeta = {
  chargeOk: boolean;
  warpRemaining: number;
  warpDeducted: number;
};

export type GatewayJsonResult<T> = ChatJsonResult<T> & GatewayWarpMeta;

function failResult<T>(remaining: number, error: string): GatewayJsonResult<T> {
  return {
    data: null,
    provider: 'none',
    usedFallback: true,
    error,
    chargeOk: false,
    warpRemaining: remaining,
    warpDeducted: 0,
  };
}

function estimatePromptTokens(messages: Array<{ content?: unknown }>): number {
  const joined = messages
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')))
    .join('\n');
  return Math.max(1, Math.ceil(joined.length / 4));
}

export type ResolvedGatewayLlm = {
  apiKeyOverride?: string;
  baseURL?: string;
  model?: string;
  usesPrivateKey: boolean;
  ready: boolean;
};

export function resolveDeepseekGatewayLlm(userId: string): ResolvedGatewayLlm {
  const uid = userId.trim();
  const llm = resolveUserLlm(uid);
  if (!llm && !process.env.DEEPSEEK_API_KEY?.trim()) {
    return { usesPrivateKey: false, ready: false };
  }
  if (!llm) {
    return { usesPrivateKey: false, ready: true };
  }
  if (!llm.usesPrivateKey) {
    return { usesPrivateKey: false, model: llm.model, ready: true };
  }
  const key = getUserLlmApiKey(uid, 'deepseek');
  const snap = getUserLlmSnapshot(uid, 'deepseek');
  return {
    usesPrivateKey: true,
    apiKeyOverride: key ?? undefined,
    baseURL: (snap.baseURL ?? '').trim() || DEEPSEEK_BASE_URL,
    model: llm.model,
    ready: true,
  };
}

/** 视觉链路优先 Qwen，否则 DeepSeek */
export function resolveVisionGatewayLlm(userId: string): ResolvedGatewayLlm {
  const uid = userId.trim();
  const qwen = resolveQwenVision(uid);
  if (qwen) {
    const privateKey = Boolean(getUserLlmApiKey(uid, 'qwen'));
    return {
      usesPrivateKey: privateKey,
      apiKeyOverride: privateKey ? getUserLlmApiKey(uid, 'qwen') ?? undefined : getPlatformQwenKey() ?? undefined,
      baseURL: qwen.baseURL,
      model: qwen.model,
      ready: true,
    };
  }
  return resolveDeepseekGatewayLlm(uid);
}

function resolveLlmCallOptions(userId: string): ResolvedGatewayLlm {
  return resolveDeepseekGatewayLlm(userId);
}

type GatewayCallOptions = {
  timeout?: number;
  traceId?: string;
  useHeuristicFallback?: boolean;
  maxTokens?: number;
  temperature?: number;
  minWarpBalance?: number;
  jsonMode?: boolean;
  flatWarp?: { cost: number; reason: BillingReason };
  llm?: ResolvedGatewayLlm;
  /** 默认：无 flatWarp 且非自备 Key 时为 true */
  billable?: boolean;
};

async function applyWarpCharge(
  userId: string,
  llmOpts: ResolvedGatewayLlm,
  flatWarp?: { cost: number; reason: BillingReason },
): Promise<
  | { ok: false; remaining: number }
  | { ok: true; warpRemaining: number; warpDeducted: number }
> {
  const uid = userId.trim();
  let warpRemaining = assertWarpBalance(uid, 0).remaining;
  let warpDeducted = 0;
  const useFlat = Boolean(flatWarp) && !llmOpts.usesPrivateKey;
  if (useFlat && flatWarp) {
    const ch = chargePlatformCompute(uid, flatWarp.cost, flatWarp.reason, false);
    warpRemaining = ch.remaining;
    warpDeducted = ch.deducted;
    if (!ch.ok) return { ok: false, remaining: ch.remaining };
  }
  return { ok: true, warpRemaining, warpDeducted };
}

async function gatewayCall<T>(
  userId: string,
  messages: LlmChatMessage[],
  options: GatewayCallOptions,
): Promise<GatewayJsonResult<T>> {
  const uid = userId.trim();
  const llmOpts = options.llm ?? resolveLlmCallOptions(uid);
  if (!llmOpts.ready) {
    return failResult(0, 'no_llm_configured');
  }

  const traceId = options.traceId ?? `gw_${crypto.randomUUID().slice(0, 8)}`;
  if (options.minWarpBalance != null) {
    const bal = assertWarpBalance(uid, options.minWarpBalance);
    if (!bal.ok) return failResult(bal.remaining, 'INSUFFICIENT_WARP');
  }

  const warp = await applyWarpCharge(uid, llmOpts, options.flatWarp);
  if (!warp.ok) return failResult(warp.remaining, 'INSUFFICIENT_WARP');

  const useFlat = Boolean(options.flatWarp) && !llmOpts.usesPrivateKey;
  const willBill = options.billable ?? (!useFlat && !llmOpts.usesPrivateKey);
  const reserved = willBill && !llmOpts.usesPrivateKey
    ? reserveLlmTokens(
      uid,
      traceId,
      Math.ceil((estimatePromptTokens(messages) + (options.maxTokens ?? 1200)) * 1.2),
    )
    : { ok: true, remaining: 0, reserved: 0 };
  if (!reserved.ok) {
    return failResult(warp.warpRemaining, 'INSUFFICIENT_TOKENS');
  }
  const core = await chatCompletionJson<T>(messages, {
    timeout: options.timeout ?? 20_000,
    traceId,
    useHeuristicFallback: options.useHeuristicFallback ?? true,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    jsonMode: options.jsonMode !== false,
    apiKeyOverride: llmOpts.apiKeyOverride,
    baseURL: llmOpts.baseURL,
    model: llmOpts.model,
    userId: uid,
    billable: willBill,
  });

  if (reserved.reserved > 0 && (!core.data || (core.usedFallback && Boolean(core.error)))) {
    releaseLlmTokenReservation(uid, traceId, `RELEASE:${traceId}`);
  }

  return {
    ...core,
    chargeOk: true,
    warpRemaining: warp.warpRemaining,
    warpDeducted: warp.warpDeducted,
  };
}

async function gatewayMessagesCall(
  userId: string,
  messages: LlmChatMessageParam[],
  options: GatewayCallOptions,
): Promise<GatewayJsonResult<string>> {
  const uid = userId.trim();
  const llmOpts = options.llm ?? resolveLlmCallOptions(uid);
  if (!llmOpts.ready) {
    return failResult(0, 'no_llm_configured');
  }

  const traceId = options.traceId ?? `gw_${crypto.randomUUID().slice(0, 8)}`;
  if (options.minWarpBalance != null) {
    const bal = assertWarpBalance(uid, options.minWarpBalance);
    if (!bal.ok) return failResult(bal.remaining, 'INSUFFICIENT_WARP');
  }

  const warp = await applyWarpCharge(uid, llmOpts, options.flatWarp);
  if (!warp.ok) return failResult(warp.remaining, 'INSUFFICIENT_WARP');

  const useFlat = Boolean(options.flatWarp) && !llmOpts.usesPrivateKey;
  const willBill = options.billable ?? (!useFlat && !llmOpts.usesPrivateKey);
  const reserved = willBill && !llmOpts.usesPrivateKey
    ? reserveLlmTokens(
      uid,
      traceId,
      Math.ceil((estimatePromptTokens(messages as any) + (options.maxTokens ?? 1200)) * 1.2),
    )
    : { ok: true, remaining: 0, reserved: 0 };
  if (!reserved.ok) {
    return failResult(warp.warpRemaining, 'INSUFFICIENT_TOKENS');
  }
  const core = await chatCompletionMessages(messages, {
    timeout: options.timeout ?? 20_000,
    traceId,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    jsonMode: options.jsonMode === true,
    apiKeyOverride: llmOpts.apiKeyOverride,
    baseURL: llmOpts.baseURL,
    model: llmOpts.model,
    userId: uid,
    billable: willBill,
  });

  if (reserved.reserved > 0 && (!core.data || (core.usedFallback && Boolean(core.error)))) {
    releaseLlmTokenReservation(uid, traceId, `RELEASE:${traceId}`);
  }

  return {
    ...core,
    chargeOk: true,
    warpRemaining: warp.warpRemaining,
    warpDeducted: warp.warpDeducted,
  };
}

/** JSON 模式 LLM 调用（推荐所有生产路径使用） */
export async function gatewayJsonCompletion<T>(
  userId: string,
  messages: LlmChatMessage[],
  options: Omit<GatewayCallOptions, 'jsonMode'> = {},
): Promise<GatewayJsonResult<T>> {
  return gatewayCall<T>(userId, messages, { ...options, jsonMode: true });
}

/** 纯文本 completion（无 JSON 约束） */
export async function gatewayTextCompletion(
  userId: string,
  messages: LlmChatMessage[],
  options: Omit<GatewayCallOptions, 'jsonMode' | 'useHeuristicFallback'> = {},
): Promise<GatewayJsonResult<string>> {
  return gatewayCall<string>(userId, messages, {
    ...options,
    jsonMode: false,
    useHeuristicFallback: false,
  });
}

/** 多模态 / 任意 OpenAI messages（视觉、复杂 user content） */
export async function gatewayOpenAiMessages(
  userId: string,
  messages: LlmChatMessageParam[],
  options: Omit<GatewayCallOptions, 'useHeuristicFallback'> & { llm?: ResolvedGatewayLlm } = {},
): Promise<GatewayJsonResult<string>> {
  return gatewayMessagesCall(userId, messages, {
    ...options,
    jsonMode: options.jsonMode ?? false,
    llm: options.llm ?? resolveVisionGatewayLlm(userId),
  });
}
