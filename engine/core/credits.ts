/**
 * WUXIAN · Credits（SQLite 钱包后端）
 */

import { consumeCredits as walletConsume, addCredits as walletAdd, ensureWallet, getWalletSummary } from '../../server/user-wallet';

export type CreditReason =
  | 'VIDEO_ASSIMILATION'
  | 'AUDIO_ASSIMILATION'
  | 'CO_LEARN_MONITOR'
  | 'TALENT_ANALYZE';

export interface CreditBalance {
  userId: string;
  credits: number;
  updatedAt: string;
  dailyFreeCredits: number;
  lastResetAt: string;
}

export interface CreditConsumeResult {
  allowed: boolean;
  cost: number;
  remaining: number;
  message: string;
}

const DEFAULT_DAILY_FREE = 30;

export class CreditManager {
  get(userId: string): CreditBalance {
    const w = ensureWallet(userId);
    return {
      userId,
      credits: w.credits,
      updatedAt: w.updated_at,
      dailyFreeCredits: w.daily_free_credits,
      lastResetAt: w.credits_reset_at,
    };
  }

  estimate(reason: CreditReason, input?: unknown): number {
    const base: Record<CreditReason, number> = {
      VIDEO_ASSIMILATION: 20,
      AUDIO_ASSIMILATION: 10,
      CO_LEARN_MONITOR: 2,
      TALENT_ANALYZE: 1,
    };
    const v = base[reason];
    if (reason === 'VIDEO_ASSIMILATION') {
      const obj = (input as { payload?: { estimatedDuration?: number } }) ?? {};
      const mins = obj.payload?.estimatedDuration;
      if (typeof mins === 'number' && mins > 0) return Math.max(v, Math.ceil(mins / 10) * 5);
    }
    return v;
  }

  canConsume(userId: string, reason: CreditReason, input?: unknown): CreditConsumeResult {
    const b = this.get(userId);
    const cost = this.estimate(reason, input);
    if (b.credits < cost) {
      return { allowed: false, cost, remaining: b.credits, message: `认知算力不足：需要 ${cost} credits，当前剩余 ${b.credits}` };
    }
    return { allowed: true, cost, remaining: b.credits - cost, message: `本次消耗 ${cost} credits` };
  }

  consume(userId: string, reason: CreditReason, input?: unknown): CreditConsumeResult {
    const check = this.canConsume(userId, reason, input);
    if (!check.allowed) return check;
    const r = walletConsume(userId, check.cost);
    return { ...check, remaining: r.remaining, message: `本次消耗 ${check.cost} credits，剩余 ${r.remaining}` };
  }

  topUp(userId: string, credits: number): CreditBalance {
    walletAdd(userId, Math.floor(credits));
    return this.get(userId);
  }
}

let globalCredits: CreditManager | null = null;

export function getCreditManager(): CreditManager {
  if (!globalCredits) globalCredits = new CreditManager();
  return globalCredits;
}
