import { assertWarpBalance, WARP_COST } from './billing-hub';
import { fuelText } from './llm-fuel-gateway';

type RelayPayload = {
  screenshotData?: string;
  userHint?: string;
};

type RelayResult = {
  success: boolean;
  detectedConcept: string;
  relaySource: string | null;
  remainingWarpPoints: number;
  tokensUsed: number;
  usedRelayNetwork: boolean;
};

function clampLen(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return t.slice(0, n);
}

async function extractConceptTextOnly(
  userId: string,
  userHint?: string,
): Promise<{ concept: string; tokensUsed: number }> {
  const hint = clampLen(userHint?.trim() || '我卡在这步了。', 120);
  const gw = await fuelText(userId, 'VISION_INTERCEPT', [
    {
      role: 'system',
      content: '你是冷酷的一针见血的学习监视器。提取用户描述中阻碍前进的核心学术/技术概念。只输出概念名称，中文优先，禁止废话。',
    },
    { role: 'user', content: `用户吐槽: ${hint}` },
  ], {
    traceId: `fault_relay_${userId}`,
    policyOverride: { maxTokens: 160, channel: 'text', cost: WARP_COST.VISION_INTERCEPT },
  });

  if (!gw.chargeOk) throw new Error('Warp 燃料已耗尽，请充值后继续');

  const extracted = (gw.data ?? '').trim();
  const cleaned = extracted.replace(/["'“”]/g, '').trim();
  const concept = clampLen(cleaned || hint, 80);
  return { concept, tokensUsed: 0 };
}

export class FaultTolerantRelayEngine {
  static async executeWithRetry(consumerUserId: string, payload: RelayPayload): Promise<RelayResult> {
    const userId = consumerUserId.trim();
    if (!userId) throw new Error('缺少 consumerUserId');
    const { concept, tokensUsed } = await extractConceptTextOnly(userId, payload.userHint);
    return {
      success: true,
      detectedConcept: concept,
      relaySource: 'deepseek',
      remainingWarpPoints: assertWarpBalance(userId, 0).remaining,
      tokensUsed,
      usedRelayNetwork: false,
    };
  }
}
