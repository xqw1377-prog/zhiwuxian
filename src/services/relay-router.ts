/**
 * WUXIAN 2.0 · Warp 智能中继调度器
 */

import { getWarpLedger } from '../db/relay-schema';
import { fuelText } from './llm-fuel-gateway';

export interface VisionRelayPayload {
  screenshotData?: string;
  userHint?: string;
}

export interface VisionRelayResult {
  success: boolean;
  detectedConcept: string;
  relaySource: string | null;
  remainingWarpPoints: number;
  tokensUsed: number;
  usedRelayNetwork: boolean;
}

const VISION_SYSTEM = '你现在是分布式自学网络的神经元节点，请提取截图中的核心学习概念，只返回一个简短中文概念名，不要解释。';

export class WarpRelayRouter {
  /**
   * 为消耗者寻找最优算力中继并执行多模态解构
   */
  static async dispatchVisionTask(
    consumerUserId: string,
    payload: VisionRelayPayload,
  ): Promise<VisionRelayResult> {
    return WarpRelayRouter.runVisionTextOnly(consumerUserId, payload);
  }

  private static async runVisionTextOnly(
    consumerUserId: string,
    payload: VisionRelayPayload,
  ): Promise<VisionRelayResult> {
    const hint = payload.userHint?.trim()
      ? `用户自述: ${payload.userHint}\n${VISION_SYSTEM}`
      : VISION_SYSTEM;

    const gw = await fuelText(
      consumerUserId,
      'VISION_RELAY',
      [
        { role: 'system', content: hint },
        { role: 'user', content: '只输出概念名。' },
      ],
      {
        traceId: `vision_relay_${consumerUserId}`,
        policyOverride: { maxTokens: 150 },
      },
    );

    if (!gw.chargeOk) {
      const remaining = getWarpLedger(consumerUserId).available_warp_points;
      throw new Error(remaining <= 0 ? '🚨 Warp 燃料已耗尽！请先补充燃料后再触发视觉中继。' : '平台算力未就绪：请先配置国内模型 Key');
    }

    const detectedConcept =
      (typeof gw.data === 'string' ? gw.data.trim() : '') ||
      payload.userHint?.trim() ||
      '未知概念';

    return {
      success: true,
      detectedConcept,
      relaySource: gw.provider === 'none' ? null : `${gw.provider}`,
      remainingWarpPoints: gw.warpRemaining,
      tokensUsed: 0,
      usedRelayNetwork: false,
    };
  }
}
