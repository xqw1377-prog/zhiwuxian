/**
 * WUXIAN · 统一 LLM 供应商抽象（DeepSeek / OpenAI / 启发式关闭）
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export type LlmProviderId = 'deepseek' | 'openai' | 'none';

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ResolvedLlm {
  provider: LlmProviderId;
  client: OpenAI;
  model: string;
  baseURL: string;
}

export interface LlmCallOptions {
  apiKeyOverride?: string;
  /** 用户自备 Key 时的 baseURL（与 apiKeyOverride 合用） */
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** 默认 true；false 时返回原始文本字符串（data 为 string） */
  jsonMode?: boolean;
  timeout?: number;
  traceId?: string;
  useHeuristicFallback?: boolean;
  userId?: string;
  /** 按 token 扣 Warp（与业务层 flatWarp 二选一，避免双扣） */
  billable?: boolean;
}

/** 支持多模态等 OpenAI 原生 message 形态 */
export type LlmChatMessageParam = ChatCompletionMessageParam;

/** 外部注册的计费钩子，由 billing-hub 注入 */
export type BillingHook = (userId: string, call: LlmCostRecord) => void;
let billingHook: BillingHook | null = null;

export function setLlmBillingHook(hook: BillingHook): void {
  billingHook = hook;
}

export interface LlmCostRecord {
  traceId: string;
  provider: LlmProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  error?: string;
}

const deepseekBase = () => process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1';
const openaiBase = () => process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';

function envProvider(): LlmProviderId | null {
  const raw = process.env.WUXIAN_LLM_PROVIDER?.trim().toLowerCase();
  if (raw === 'deepseek' || raw === 'openai' || raw === 'none' || raw === 'off' || raw === 'heuristic') {
    return raw === 'off' || raw === 'heuristic' ? 'none' : raw;
  }
  return null;
}

function deepseekModel(): string {
  return process.env.WUXIAN_DEEPSEEK_MODEL?.trim()
    || process.env.DEEPSEEK_MODEL?.trim()
    || 'deepseek-v4pro';
}

function openaiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || process.env.WUXIAN_OPENAI_MODEL?.trim() || 'gpt-4o-mini';
}

/**
 * 解析可用 LLM 配置；apiKeyOverride 优先（用户私有 Key）
 */
export function resolveLlm(apiKeyOverride?: string, providerOverride?: LlmProviderId): ResolvedLlm | null {
  const override = apiKeyOverride?.trim();
  if (override) {
    const p = providerOverride || envProvider();
    if (p === 'openai') {
      return { provider: 'openai', client: new OpenAI({ apiKey: override, baseURL: openaiBase() }), model: openaiModel(), baseURL: openaiBase() };
    }
    return { provider: 'deepseek', client: new OpenAI({ apiKey: override, baseURL: deepseekBase() }), model: deepseekModel(), baseURL: deepseekBase() };
  }

  const forced = providerOverride || envProvider();
  if (forced === 'none') return null;

  if (forced === 'openai' || (!forced && process.env.OPENAI_API_KEY?.trim())) {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (key) {
      return { provider: 'openai', client: new OpenAI({ apiKey: key, baseURL: openaiBase() }), model: openaiModel(), baseURL: openaiBase() };
    }
    if (forced === 'openai') return null;
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey && (forced === 'deepseek' || !forced)) {
    return { provider: 'deepseek', client: new OpenAI({ apiKey: deepseekKey, baseURL: deepseekBase() }), model: deepseekModel(), baseURL: deepseekBase() };
  }

  return null;
}

export interface ChatJsonResult<T> {
  data: T | null;
  provider: LlmProviderId;
  usedFallback: boolean;
  error?: string;
}

let cachedPlatformClient: { provider: LlmProviderId; client: OpenAI; baseURL: string } | null = null;

function platformClient(resolved: ResolvedLlm): OpenAI {
  if (resolved.provider === 'deepseek' && !process.env.WUXIAN_LLM_NO_CACHE) {
    if (!cachedPlatformClient || cachedPlatformClient.provider !== resolved.provider) {
      cachedPlatformClient = { provider: resolved.provider, client: resolved.client, baseURL: resolved.baseURL };
    }
    return cachedPlatformClient.client;
  }
  return resolved.client;
}

const costLog: LlmCostRecord[] = [];
const MAX_COST_LOG = 1000;

export function getLlmCostLog(): LlmCostRecord[] {
  return costLog.slice();
}

async function callWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('LLM_TIMEOUT')), timeoutMs);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('LLM_ABORTED'));
      }, { once: true });
    }),
  ]);
}

function heuristicFallbackParse<T>(messages: LlmChatMessage[]): T | null {
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  if (!lastUserMsg) return null;
  const jsonMatch = lastUserMsg.content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

function recordCost(rec: LlmCostRecord, userId?: string, feature?: string): void {
  costLog.push(rec);
  if (costLog.length > MAX_COST_LOG) costLog.splice(0, costLog.length - MAX_COST_LOG);
  try {
    const { insertCostLog } = require('../../src/db/cost-log-schema');
    insertCostLog({
      traceId: rec.traceId, userId: userId || '', provider: rec.provider,
      model: rec.model, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens,
      durationMs: rec.durationMs, warpCost: 0, feature: feature || '', error: rec.error || '',
    });
  } catch { /* cost log 写入失败不影响主流程 */ }
}

export async function chatCompletionJson<T>(
  messages: LlmChatMessage[],
  options?: LlmCallOptions,
): Promise<ChatJsonResult<T>> {
  const traceId = options?.traceId ?? `llm_${crypto.randomUUID().slice(0, 8)}`;
  const timeout = options?.timeout ?? 15000;
  const start = Date.now();

  async function tryProvider(providerOverride?: LlmProviderId): Promise<ChatJsonResult<T> | null> {
    const llm = resolveLlm(options?.apiKeyOverride, providerOverride);
    if (!llm) return null;

    const controller = new AbortController();
    const jsonMode = options?.jsonMode !== false;
    const model = options?.model?.trim() || llm.model;
    const client =
      options?.apiKeyOverride && options?.baseURL?.trim()
        ? new OpenAI({ apiKey: options.apiKeyOverride, baseURL: options.baseURL.trim() })
        : platformClient(llm);
    try {
      if (options?.userId) {
        try {
          const { checkDailyTokenCap } = require('../../src/services/billing-hub');
          const capCheck = await checkDailyTokenCap(options.userId, 0, 0);
          if (!capCheck.ok) {
            throw new Error(`DAILY_TOKEN_CAP: 今日配额已用完 (已用 ${capCheck.usedTokens})`);
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('DAILY_TOKEN_CAP')) throw e;
        }
      }
      const completion = await callWithTimeout(
        () =>
          client.chat.completions.create({
            model,
            ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
            ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
            messages,
          }),
        timeout,
        controller.signal,
      );
      const text = completion.choices[0]?.message?.content;
      if (!text) throw new Error('empty_completion');

      const inputTokens = completion.usage?.prompt_tokens ?? 0;
      const outputTokens = completion.usage?.completion_tokens ?? 0;
      recordCost({ traceId, provider: llm.provider, model, inputTokens, outputTokens, durationMs: Date.now() - start }, options?.userId);

      if (options?.userId) {
        try {
          const { checkDailyTokenCap } = require('../../src/services/billing-hub');
          await checkDailyTokenCap(options.userId, inputTokens, outputTokens);
        } catch {}
      }

      const result = {
        data: (jsonMode ? (JSON.parse(text) as T) : (text as T)),
        provider: llm.provider,
        usedFallback: false,
      };

      if (options?.billable && options?.userId && billingHook) {
        const rec: LlmCostRecord = { traceId, provider: llm.provider, model: llm.model, inputTokens, outputTokens, durationMs: Date.now() - start };
        billingHook(options.userId, rec);
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[WUXIAN LLM ${traceId}] ${llm.provider} failed:`, msg);
      recordCost({ traceId, provider: llm.provider, model: llm.model, inputTokens: 0, outputTokens: 0, durationMs: Date.now() - start, error: msg });

      if (options?.useHeuristicFallback !== false) {
        const heuristic = heuristicFallbackParse<T>(messages);
        if (heuristic) {
          return { data: heuristic, provider: llm.provider, usedFallback: true, error: `llm_fallback: ${msg}` };
        }
      }
      return { data: null, provider: llm.provider, usedFallback: true, error: msg };
    } finally {
      controller.abort();
    }
  };

  // 主 provider 尝试
  const primary = await tryProvider();
  if (primary?.data) return primary;

  // 交叉 failover：如果 deepseek 失败则尝试 openai，反之亦然
  if (primary?.error && !primary?.data) {
    const fallbackProviders: LlmProviderId[] = ['openai', 'deepseek'];
    const attempted = resolveLlm(options?.apiKeyOverride)?.provider;
    for (const fp of fallbackProviders) {
      if (fp === attempted) continue;
      const fallback = await tryProvider(fp);
      if (fallback?.data) return fallback;
    }
  }

  return primary ?? { data: null, provider: 'none', usedFallback: true, error: 'no_llm_configured' };
}

/** 任意 OpenAI message 列表（含 image_url 多模态）；默认返回文本 */
export async function chatCompletionMessages(
  messages: LlmChatMessageParam[],
  options?: LlmCallOptions,
): Promise<ChatJsonResult<string>> {
  const traceId = options?.traceId ?? `llm_${crypto.randomUUID().slice(0, 8)}`;
  const timeout = options?.timeout ?? 20_000;
  const jsonMode = options?.jsonMode === true;
  const start = Date.now();

  const llm = resolveLlm(options?.apiKeyOverride);
  if (!llm) {
    return { data: null, provider: 'none', usedFallback: true, error: 'no_llm_configured' };
  }

  const model = options?.model?.trim() || llm.model;
  const client =
    options?.apiKeyOverride && options?.baseURL?.trim()
      ? new OpenAI({ apiKey: options.apiKeyOverride, baseURL: options.baseURL.trim() })
      : platformClient(llm);

  const controller = new AbortController();
  try {
    const completion = await callWithTimeout(
      () =>
        client.chat.completions.create({
          model,
          messages,
          ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
          ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(options?.temperature != null ? { temperature: options.temperature } : {}),
        }),
      timeout,
      controller.signal,
    );
    const text = completion.choices[0]?.message?.content ?? '';
    if (!text) throw new Error('empty_completion');

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    recordCost({ traceId, provider: llm.provider, model, inputTokens, outputTokens, durationMs: Date.now() - start });

    if (options?.billable && options?.userId && billingHook) {
      billingHook(options.userId, {
        traceId,
        provider: llm.provider,
        model,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - start,
      });
    }

    const data = jsonMode ? (JSON.parse(text) as string) : text;
    return { data, provider: llm.provider, usedFallback: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[WUXIAN LLM ${traceId}] messages failed:`, msg);
    recordCost({
      traceId,
      provider: llm.provider,
      model,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      error: msg,
    });
    return { data: null, provider: llm.provider, usedFallback: true, error: msg };
  } finally {
    controller.abort();
  }
}

export function llmStatus(): {
  provider: LlmProviderId;
  model: string | null;
  configured: boolean;
  status: 'configured' | 'unconfigured';
} {
  const llm = resolveLlm();
  if (!llm) {
    return { provider: 'none', model: null, configured: false, status: 'unconfigured' };
  }
  return { provider: llm.provider, model: llm.model, configured: true, status: 'configured' };
}
