import OpenAI from 'openai';
import { getUserLlmApiKey, getUserLlmSnapshot } from '../db/user-llm-config-schema';

export const QWEN_BASE_URL =
  process.env.QWEN_BASE_URL?.trim()
  || process.env.DASHSCOPE_BASE_URL?.trim()
  || process.env.WUXIAN_QWEN_BASE_URL?.trim()
  || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export const QWEN_VISION_MODEL =
  process.env.WUXIAN_QWEN_VISION_MODEL?.trim()
  || process.env.QWEN_VISION_MODEL?.trim()
  || 'qianwen3.6plus';

export function getPlatformQwenKey(): string | null {
  return process.env.QWEN_API_KEY?.trim()
    || process.env.DASHSCOPE_API_KEY?.trim()
    || null;
}

export function createQwenClient(apiKey?: string | null, baseURL?: string | null): OpenAI | null {
  const key = apiKey?.trim() || getPlatformQwenKey();
  if (!key) return null;
  return new OpenAI({ apiKey: key, baseURL: (baseURL ?? '').trim() || QWEN_BASE_URL });
}

export interface ResolvedQwenVision {
  client: OpenAI;
  model: string;
  baseURL: string;
}

export function resolveQwenVision(userId?: string): ResolvedQwenVision | null {
  const uid = (userId ?? '').trim();
  const snap = uid ? getUserLlmSnapshot(uid, 'qwen') : null;
  const key = uid ? getUserLlmApiKey(uid, 'qwen') : null;
  const baseURL = (snap?.baseURL ?? '').trim() || QWEN_BASE_URL;
  const model = (snap?.model ?? '').trim() || QWEN_VISION_MODEL;
  const client = createQwenClient(key, baseURL);
  if (!client) return null;
  return { client, model, baseURL };
}
