/**
 * ZHI v3.5 intrusion ↔ 旧版 Omni/Electron 遥测响应兼容层
 */

import type { ZhiActivatedTool, ZhiIntrusionResult } from './zhi-core';

export type OmniIntrusionCompat = {
  success: boolean;
  shouldTrigger: boolean;
  stage: 'TARGET' | 'BASELINE' | 'DASHBOARD';
  mentorText: string;
  activeTool: 'NONE' | 'VISION_INTERCEPT' | 'METRICS_INPUT' | 'PATH_RECONFIG';
  remainingWarp: number;
  chargedWarp: number;
};

function mapActivatedTool(tool: ZhiActivatedTool): OmniIntrusionCompat['activeTool'] {
  if (tool === 'VISION_INTERCEPT') return 'VISION_INTERCEPT';
  if (tool === 'METRICS_INPUT') return 'METRICS_INPUT';
  return 'NONE';
}

function inferStage(result: ZhiIntrusionResult): OmniIntrusionCompat['stage'] {
  if (result.targetSchool.includes('未锁定')) return 'TARGET';
  if (/建档|试卷|教材|baseline/i.test(result.zhiTip)) return 'BASELINE';
  return 'DASHBOARD';
}

/** 合并为 API 单层 JSON，供 Electron / ZhiLifeMatrix / 旧 v2 路由使用 */
export function enrichZhiIntrusionApiPayload(
  result: ZhiIntrusionResult,
  opts?: { userText?: string; force?: boolean },
): ZhiIntrusionResult & OmniIntrusionCompat {
  const mentorText = [result.zhiOpening, result.zhiTip, result.zhiCoachNote]
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const hasSignal = Boolean(opts?.userText?.trim()) || Boolean(mentorText);
  const shouldTrigger =
    Boolean(opts?.force) || hasSignal || result.activatedTool !== 'NONE' || result.warpDeducted > 0;

  return {
    ...result,
    success: true,
    shouldTrigger,
    stage: inferStage(result),
    mentorText,
    activeTool: mapActivatedTool(result.activatedTool),
    remainingWarp: result.warpPointsRemaining,
    chargedWarp: result.warpDeducted,
  };
}
