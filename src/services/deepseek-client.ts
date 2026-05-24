/**
 * WUXIAN 3.5 · 平台托管 DeepSeek 神经元（兼容 OpenAI SDK）
 */

import OpenAI from 'openai';
import { getUserLlmApiKey, getUserLlmSnapshot } from '../db/user-llm-config-schema';

export const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1';

export const DEEPSEEK_CHAT_MODEL =
  process.env.WUXIAN_DEEPSEEK_MODEL?.trim() || process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4pro';

export const DEEPSEEK_REASONER_MODEL =
  process.env.WUXIAN_DEEPSEEK_REASONER_MODEL?.trim() || process.env.WUXIAN_DEEPSEEK_MODEL?.trim() || 'deepseek-v4pro';

export function getPlatformDeepSeekKey(): string | null {
  return process.env.DEEPSEEK_API_KEY?.trim() || null;
}

export function createDeepSeekClient(apiKey?: string | null): OpenAI | null {
  const key = apiKey?.trim() || getPlatformDeepSeekKey();
  if (!key) return null;
  return new OpenAI({ apiKey: key, baseURL: DEEPSEEK_BASE_URL });
}

export interface ResolvedLlm {
  client: OpenAI;
  model: string;
  usesPrivateKey: boolean;
  shouldChargeWarp: boolean;
}

export function resolveUserLlm(_userId: string, preferReasoner = false): ResolvedLlm | null {
  const userId = _userId.trim();
  const privateKey = userId ? getUserLlmApiKey(userId, 'deepseek') : null;
  if (privateKey) {
    const snap = getUserLlmSnapshot(userId, 'deepseek');
    const baseURL = (snap.baseURL ?? '').trim() || DEEPSEEK_BASE_URL;
    const client = new OpenAI({ apiKey: privateKey, baseURL });
    const model =
      (snap.model ?? '').trim()
      || (preferReasoner ? DEEPSEEK_REASONER_MODEL : DEEPSEEK_CHAT_MODEL);
    return { client, model, usesPrivateKey: true, shouldChargeWarp: false };
  }

  const client = createDeepSeekClient();
  if (!client) return null;
  return {
    client,
    model: preferReasoner ? DEEPSEEK_REASONER_MODEL : DEEPSEEK_CHAT_MODEL,
    usesPrivateKey: false,
    shouldChargeWarp: true,
  };
}
