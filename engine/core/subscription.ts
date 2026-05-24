/**
 * WUXIAN · toC 订阅（SQLite 钱包后端）
 */

import {
  ensureWallet,
  getWalletSummary,
  setSubscriptionTier,
  incrementUsage,
} from '../../server/user-wallet';

export type SubscriptionTier = 'free' | 'growth' | 'pro';

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  label: string;
  priceCNY: number;
  priceUSD: number;
  dailyGoalDeconstructs: number;
  dailyAudioMinutes: number;
  dailyCorrectionCalls: number;
  wormholeEnabled: boolean;
  talentRadarEnabled: boolean;
  publicCourseMatchEnabled: boolean;
  prioritySupport: boolean;
}

export interface UserSubscription {
  userId: string;
  tier: SubscriptionTier;
  active: boolean;
  startedAt: string;
  expiresAt?: string;
  dailyUsage: {
    goalDeconstructs: number;
    audioMinutes: number;
    correctionCalls: number;
  };
  lastResetAt: string;
}

export interface UsageCheckResult {
  allowed: boolean;
  remaining: number;
  tier: SubscriptionTier;
  message: string;
}

const PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    tier: 'free', label: '星尘 · 漫游者', priceCNY: 0, priceUSD: 0,
    dailyGoalDeconstructs: 1, dailyAudioMinutes: 10, dailyCorrectionCalls: 5,
    wormholeEnabled: false, talentRadarEnabled: true, publicCourseMatchEnabled: true, prioritySupport: false,
  },
  growth: {
    tier: 'growth', label: '复活甲 · ¥29/月', priceCNY: 29, priceUSD: 4,
    dailyGoalDeconstructs: 10, dailyAudioMinutes: 120, dailyCorrectionCalls: 50,
    wormholeEnabled: true, talentRadarEnabled: true, publicCourseMatchEnabled: true, prioritySupport: false,
  },
  pro: {
    tier: 'pro', label: '虫洞机甲 · ¥79/月', priceCNY: 79, priceUSD: 11,
    dailyGoalDeconstructs: 999, dailyAudioMinutes: 999, dailyCorrectionCalls: 999,
    wormholeEnabled: true, talentRadarEnabled: true, publicCourseMatchEnabled: true, prioritySupport: true,
  },
};

const USAGE_FIELD: Record<keyof UserSubscription['dailyUsage'], 'daily_goal_deconstructs' | 'daily_audio_minutes' | 'daily_correction_calls'> = {
  goalDeconstructs: 'daily_goal_deconstructs',
  audioMinutes: 'daily_audio_minutes',
  correctionCalls: 'daily_correction_calls',
};

export class SubscriptionManager {
  getPlan(tier: SubscriptionTier): SubscriptionPlan {
    return PLANS[tier];
  }

  listPlans(): SubscriptionPlan[] {
    return Object.values(PLANS);
  }

  getSubscription(userId: string): UserSubscription {
    const w = ensureWallet(userId);
    return {
      userId,
      tier: w.tier as SubscriptionTier,
      active: true,
      startedAt: w.created_at,
      expiresAt: w.tier_expires_at ?? undefined,
      dailyUsage: {
        goalDeconstructs: w.daily_goal_deconstructs,
        audioMinutes: w.daily_audio_minutes,
        correctionCalls: w.daily_correction_calls,
      },
      lastResetAt: w.usage_reset_at,
    };
  }

  checkUsage(userId: string, feature: keyof UserSubscription['dailyUsage'], amount = 1): UsageCheckResult {
    const sub = this.getSubscription(userId);
    const plan = PLANS[sub.tier];
    const limitMap: Record<string, number> = {
      goalDeconstructs: plan.dailyGoalDeconstructs,
      audioMinutes: plan.dailyAudioMinutes,
      correctionCalls: plan.dailyCorrectionCalls,
    };
    const limit = limitMap[feature];
    const used = sub.dailyUsage[feature];
    if (used + amount > limit) {
      return { allowed: false, remaining: 0, tier: sub.tier, message: `今日已达上限 (${limit})` };
    }
    return { allowed: true, remaining: limit - used - amount, tier: sub.tier, message: `剩余 ${limit - used - amount}` };
  }

  consume(userId: string, feature: keyof UserSubscription['dailyUsage'], amount = 1): UsageCheckResult {
    const check = this.checkUsage(userId, feature, amount);
    if (!check.allowed) return check;
    incrementUsage(userId, USAGE_FIELD[feature], amount);
    return check;
  }

  canWormhole(userId: string): boolean {
    return getWalletSummary(userId).wormholeEnabled;
  }

  upgrade(userId: string, tier: 'growth' | 'pro'): UserSubscription {
    setSubscriptionTier(userId, tier, 30);
    return this.getSubscription(userId);
  }

  downgradeToFree(userId: string): UserSubscription {
    setSubscriptionTier(userId, 'free');
    return this.getSubscription(userId);
  }

  subscribe(userId: string, tier: SubscriptionTier): UserSubscription {
    setSubscriptionTier(userId, tier, tier === 'free' ? 0 : 30);
    return this.getSubscription(userId);
  }

  getPlanUpgradeSuggestion(userId: string) {
    const sub = this.getSubscription(userId);
    if (sub.tier !== 'free') return null;
    if (sub.dailyUsage.goalDeconstructs >= PLANS.free.dailyGoalDeconstructs * 0.8) {
      return { current: 'free' as const, suggested: 'growth' as const, reason: '升级后每日可拆解 10 次' };
    }
    return null;
  }
}

let globalSubscriptionManager: SubscriptionManager | null = null;

export function getSubscriptionManager(): SubscriptionManager {
  if (!globalSubscriptionManager) globalSubscriptionManager = new SubscriptionManager();
  return globalSubscriptionManager;
}
