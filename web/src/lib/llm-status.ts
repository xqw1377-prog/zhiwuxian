import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

/** 与后端 llmStatus 对齐；fetch 层可附加 reachability */
export type LlmHealthStatus =
  | 'configured'
  | 'unconfigured'
  | 'backend_unreachable'
  | 'auth_failed';

export type LlmHealth = {
  provider: 'deepseek' | 'openai' | 'none';
  model: string | null;
  configured: boolean;
  status: LlmHealthStatus;
};

type LlmHealthPayload = {
  provider?: LlmHealth['provider'];
  model?: string | null;
  configured?: boolean;
  status?: 'configured' | 'unconfigured';
};

function normalizeServerLlm(raw: LlmHealthPayload | undefined): LlmHealth {
  const configured = Boolean(raw?.configured && raw?.provider !== 'none');
  return {
    provider: raw?.provider ?? 'none',
    model: raw?.model ?? null,
    configured,
    status: configured ? 'configured' : 'unconfigured',
  };
}

export async function fetchLlmHealth(): Promise<LlmHealth> {
  try {
    const res = await authFetch('/api/ai/health');
    const json = await res.json().catch(() => null);
    if (res.status === 401) {
      return {
        provider: 'none',
        model: null,
        configured: false,
        status: 'auth_failed',
      };
    }
    if (!res.ok) {
      return {
        provider: 'none',
        model: null,
        configured: false,
        status: 'backend_unreachable',
      };
    }
    const d = unwrapEnvelope<{ llm?: LlmHealthPayload }>(json);
    return normalizeServerLlm(d.llm);
  } catch {
    return {
      provider: 'none',
      model: null,
      configured: false,
      status: 'backend_unreachable',
    };
  }
}

export function llmStatusLabel(health: LlmHealth | null): {
  text: string;
  tone: 'ok' | 'warn' | 'error';
} {
  if (!health) {
    return { text: '检测 LLM 状态…', tone: 'warn' };
  }
  switch (health.status) {
    case 'configured':
      return {
        text: `DeepSeek 在线${health.model ? ` · ${health.model}` : ''}`,
        tone: 'ok',
      };
    case 'unconfigured':
      return {
        text: '模板模式（平台未配置 DeepSeek Key）',
        tone: 'warn',
      };
    case 'auth_failed':
      return { text: '会话失效 · 请刷新或重新进入驾驶舱', tone: 'error' };
    case 'backend_unreachable':
    default:
      return {
        text: '后端未连接 · 请启动 npm run server（3401）',
        tone: 'error',
      };
  }
}
