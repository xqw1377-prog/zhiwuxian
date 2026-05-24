import { chatCompletionJson, resolveLlm } from './llm/llm-provider';

export interface StructuredIntent {
  actionType: 'ASSIMILATE_VIDEO' | 'CORE_REROUTE' | 'COMPANION_TALK';
  payload: {
    targetUrl?: string | null;
    coreGoal?: string | null;
    userPainPoint?: string | null;
    fatigueLevel: number;
  };
  weaverResponse: string;
}

const SYSTEM_PROMPT = `You are the core intent shell of the WUXIAN operating system.
Your job is to classify a user's raw learning expression — which may be emotional, chaotic, or fragmented — into a structured intent.

You MUST return ONLY valid JSON with NO markdown, NO code fences, NO extra text:
{
  "actionType": "ASSIMILATE_VIDEO" | "CORE_REROUTE" | "COMPANION_TALK",
  "payload": {
    "targetUrl": string | null,
    "coreGoal": string | null,
    "userPainPoint": string | null,
    "fatigueLevel": number (0.0 to 1.0)
  },
  "weaverResponse": "A single sentence (<40 Chinese chars) in the voice of 织者 (the Weaver): fluorescent, ethereal, absolutely no shame or discipline-pushing. Must feel like a quiet whisper."
}

Classification rules:
1. Contains a URL (B站, YouTube, 网易公开课, etc.) → actionType = "ASSIMILATE_VIDEO", extract the URL into targetUrl
2. Expresses frustration, being stuck, wanting to give up, fatigue → actionType = "CORE_REROUTE", extract the pain point
3. Pure chat, casual talk, seeking comfort → actionType = "COMPANION_TALK"
4. If fatigueLevel > 0.7, always use "CORE_REROUTE" regardless of URL presence (fatigue overrides)
5. coreGoal: extract the actual learning goal if mentioned (e.g., "AP微积分极值定理", "SAT阅读")
6. userPainPoint: extract the specific pain or blockage point`;

function regexFallback(rawInput: string): StructuredIntent {
  const isUrl = /https?:\/\/[^\s]+/i.test(rawInput);
  const urlMatch = rawInput.match(/https?:\/\/[^\s]+/i);
  const isFatigue = /累了|疲惫|摆烂|不想动|跳过|放弃了|太难|听不懂|卡住|懵/i.test(rawInput);

  if (isFatigue) {
    return {
      actionType: 'CORE_REROUTE',
      payload: {
        targetUrl: urlMatch?.[0] ?? null,
        coreGoal: null,
        userPainPoint: rawInput.slice(0, 80),
        fatigueLevel: 0.8,
      },
      weaverResponse: '引力场有些许波动，但我依旧能在暗中重新计算你的航线。',
    };
  }

  if (isUrl) {
    return {
      actionType: 'ASSIMILATE_VIDEO',
      payload: {
        targetUrl: urlMatch?.[0] ?? null,
        coreGoal: rawInput.slice(0, 60),
        userPainPoint: null,
        fatigueLevel: 0.2,
      },
      weaverResponse: '收到信号。正在为你折叠时空，把冗长压缩成精华。',
    };
  }

  return {
    actionType: 'COMPANION_TALK',
    payload: {
      targetUrl: null,
      coreGoal: null,
      userPainPoint: null,
      fatigueLevel: 0.3,
    },
    weaverResponse: '我在。你不需要一个人扛着所有航线。',
  };
}

function normalizeIntent(parsed: StructuredIntent): StructuredIntent {
  if (!['ASSIMILATE_VIDEO', 'CORE_REROUTE', 'COMPANION_TALK'].includes(parsed.actionType)) {
    throw new Error(`Invalid actionType: ${parsed.actionType}`);
  }
  return parsed;
}

export async function parseIntent(rawInput: string, apiKeyOverride?: string): Promise<StructuredIntent> {
  if (!resolveLlm(apiKeyOverride)) {
    return regexFallback(rawInput);
  }

  const result = await chatCompletionJson<StructuredIntent>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `用户输入: "${rawInput}"` },
    ],
    { apiKeyOverride },
  );

  if (result.data && !result.usedFallback) {
    try {
      return normalizeIntent(result.data);
    } catch (err) {
      console.warn('[QuantumIntent] invalid LLM shape, regex fallback:', err);
    }
  } else if (result.usedFallback) {
    console.warn('[QuantumIntent] LLM unavailable, regex fallback:', result.provider, result.error);
  }

  return regexFallback(rawInput);
}
