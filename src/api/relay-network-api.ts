/**
 * WUXIAN 2.0 · 分布式算力中继 API
 */

import {
  listRelayProviders,
  setRelaySharing,
  settleRelayCompute,
  recordStarAllianceReferral,
  registerStarMedal,
  verifyStarMedal,
} from '../db/relay-network-schema';
import { ensureWarpLedger, getRelayNodeStatus } from '../db/relay-schema';
import { WarpRelayRouter } from '../services/relay-router';
import { getQuantumExecutionStrategy } from './user-api';

export function getRelayMarketplace() {
  return {
    providers: listRelayProviders(),
    defaultWarpCost: 8,
    platformFeeRatio: 0,
    providerShareRatio: 0.35,
  };
}

export function toggleRelaySharing(userId: string, enabled: boolean) {
  const strategy = getQuantumExecutionStrategy(userId);
  if (!strategy.isLifetime || !strategy.usesPrivateKey) {
    throw new Error('仅终身认证且已配置私有 API Key 的极客可开启算力共享');
  }
  setRelaySharing(userId, enabled);
  return { success: true, shareRelayEnabled: enabled };
}

export function requestRelayCompute(input: {
  consumerUserId: string;
  providerUserId: string;
  warpCost?: number;
}) {
  if (input.consumerUserId === input.providerUserId) {
    throw new Error('不能调用自己的中继节点');
  }
  const providers = listRelayProviders(100);
  if (!providers.some((p) => p.userId === input.providerUserId)) {
    throw new Error('该极客未开放闲置算力中继');
  }
  return settleRelayCompute({
    consumerUserId: input.consumerUserId,
    providerUserId: input.providerUserId,
    warpCost: input.warpCost ?? 8,
  });
}

export function ingestReferral(input: {
  referrerUserId: string;
  inviteeUserId: string;
  inviteToken?: string;
}) {
  return recordStarAllianceReferral(input);
}

export function issueMedalForPoster(userId: string, posterPath: string) {
  return registerStarMedal(userId, posterPath);
}

export function verifyMedal(medalId: string, hash: string) {
  return { valid: verifyStarMedal(medalId, hash) };
}

/** 2.0 星盟主控台数据 */
export function getStarLeagueDashboard(userId: string) {
  const ledger = ensureWarpLedger(userId);
  const relay = getRelayNodeStatus(userId);
  const strategy = getQuantumExecutionStrategy(userId);
  const base = process.env.WUXIAN_SHARE_BASE_URL?.trim() || 'https://wuxian.app';
  return {
    warpPoints: ledger.available_warp_points,
    inviteCode: ledger.invitation_code,
    contributedTokens: relay.contributedTokens,
    isSharingRelay: relay.isSharingRelay,
    totalServedTokens: relay.totalServedTokens,
    canHostRelay: strategy.isLifetime && strategy.usesPrivateKey,
    joinUrl: `${base}/join?code=${ledger.invitation_code}`,
    visionRelayCost: 5,
    referralBonus: 50,
  };
}

export function toggleRelayValve(userId: string, enabled: boolean) {
  return toggleRelaySharing(userId, enabled);
}

export async function dispatchVisionViaRelay(
  consumerUserId: string,
  payload: { screenshotData?: string; userHint?: string },
) {
  return WarpRelayRouter.dispatchVisionTask(consumerUserId, payload);
}
