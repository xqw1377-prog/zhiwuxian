/**
 * ZHI · 进化账本（流速、阻力、算力流水、学习里程碑）
 */

import { appendEnergyFlowEvent, type TargetBattle } from '../db/life-ledger-schema';
import { getMentorPlanView } from '../db/school-matrix';
import { listRecentLanguageSessions } from '../db/zhi-language-session-schema';
import { listRecentVideoSessions } from '../db/zhi-video-session-schema';
import { getBillingStatus, listPlatformBillingLog } from './billing-hub';
import { buildLearningProgressDashboard } from './learning-progress-dashboard';
import { ZhiTokenSplitter } from './zhi-token-splitter';

export type EvolutionFlowDto = {
  id: string;
  label: string;
  battle: string;
  amount: number;
  at: number;
  kind: 'warp' | 'token' | 'milestone';
};

export type EvolutionLedgerDto = {
  challengeIndex: number;
  dreamPct: number;
  dreamDelta7d: number;
  warpPoints: number;
  corePercent: number;
  deepPercent: number;
  frozenTokens: number;
  weekStats: {
    languageSessions: number;
    videoCheckpoints: number;
    warpSpent: number;
  };
  flows: EvolutionFlowDto[];
  coachLine: string;
};

function battleLabel(battle: string): string {
  if (battle === 'TOEFL_LANGUAGE_MATRIX') return '语言';
  if (battle === 'VIDEO_LEARN') return '视频';
  if (battle === 'EVOLUTION_MATRIX') return '进化';
  return '知识';
}

export function buildEvolutionLedger(userId: string): EvolutionLedgerDto {
  const uid = userId.trim();
  const dash = buildLearningProgressDashboard(uid);
  const plan = getMentorPlanView(uid);
  const billing = getBillingStatus(uid);
  const tokens = ZhiTokenSplitter.getLedgerView(uid, 10);

  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const lang7 = listRecentLanguageSessions(uid, 30).filter((s) => s.created_at >= weekAgo);
  const vid7 = listRecentVideoSessions(uid, 30).filter((s) => s.created_at >= weekAgo);
  const billing7 = listPlatformBillingLog(uid, 30).filter(
    (b) => b.warp_delta < 0 && b.created_at >= weekAgo,
  );

  const flows: EvolutionFlowDto[] = [];

  for (const b of listPlatformBillingLog(uid, 6)) {
    flows.push({
      id: `warp-${b.created_at}`,
      label: String(b.reason ?? 'Warp'),
      battle: battleLabel('EVOLUTION_MATRIX'),
      amount: b.warp_delta,
      at: b.created_at * 1000,
      kind: 'warp',
    });
  }

  for (const f of tokens.recentFlows.slice(0, 8)) {
    flows.push({
      id: f.flow_id,
      label: f.action_description,
      battle: battleLabel(f.target_battle),
      amount: f.amount_changed,
      at: f.timestamp,
      kind: 'token',
    });
  }

  flows.sort((a, b) => b.at - a.at);

  const challengeIndex = plan?.challengeIndex ?? dash.dream.challengeIndex;
  const active = lang7.length + vid7.length;
  const coachLine =
    dash.dream.delta7d > 0
      ? `本周梦校确定性 +${dash.dream.delta7d}%，阻力 ${challengeIndex}%。保持节奏。`
      : active >= 3
        ? `本周 ${active} 次语言/视频撞击，阻力 ${challengeIndex}%。`
        : `阻力 ${challengeIndex}% · 需要可验证的学习流水（口语/视频/拍题）。`;

  return {
    challengeIndex,
    dreamPct: dash.dream.certaintyPct,
    dreamDelta7d: dash.dream.delta7d,
    warpPoints: billing.availableWarpPoints,
    corePercent: Math.round(tokens.corePercent),
    deepPercent: Math.round(tokens.deepPercent),
    frozenTokens: tokens.frozenPunishTokens,
    weekStats: {
      languageSessions: lang7.length,
      videoCheckpoints: vid7.length,
      warpSpent: billing7.reduce((a, b) => a + Math.abs(b.warp_delta), 0),
    },
    flows: flows.slice(0, 12),
    coachLine,
  };
}

export function recordEvolutionMilestone(input: {
  userId: string;
  battle: TargetBattle;
  description: string;
  amountHint?: number;
}): void {
  appendEnergyFlowEvent({
    userId: input.userId,
    battle: input.battle,
    amountChanged: input.amountHint ?? 0,
    actionDescription: input.description,
  });
}
