/**
 * WUXIAN 3.5 · 平台统一代收算力清算账本
 * 用户充值 → Warp 燃料；平台后台静默调度 DeepSeek。
 */

import { getLearningDb } from '../../server/wuxian-learning-db';
import {
  deductWarpPoints,
  ensureWarpLedger,
  getWarpLedger,
  grantWarpPoints,
} from '../db/relay-schema';
import { addTokensToDB, consumeTokensFromDB, ensureWalletRow } from '../db/wallet-schema';
import { ZhiTokenSplitter } from './zhi-token-splitter';
import { setLlmBillingHook, type LlmCostRecord } from '../../server/llm/llm-provider';
import { getUserLlmSnapshot } from '../db/user-llm-config-schema';

export const WARP_COST = {
  MENTOR_INTERVENTION: 2,
  MENTOR_CONSULT: 5,
  METRICS_COMPILE: 4,
  VISION_INTERCEPT: 5,
  VISION_RELAY: 3,
  PLANNER_REGEN: 4,
  CHAT_COMPLETION: 2,
  /** Option+Space 盲投心流截屏 */
  GHOST_BLIND: 2,
  /** 影子肉搏战变异题 + 失败重载 */
  SHADOW_SPAR: 5,
  /** 托福/雅思口语写作因果精算 */
  LANGUAGE_EVAL: 8,
  /** 全套听读写说全真模考因果清算 */
  FULL_MOCK_EXAM: 25,
  /** 认知逃避：3 分钟无有效撞击且切窗 */
  ESCAPE_PENALTY: 10,
} as const;

export type BillingReason = keyof typeof WARP_COST | string;

export interface BillingStatus {
  userId: string;
  availableWarpPoints: number;
  tokenBalance: number;
  invitationCode: string;
  platformHosted: boolean;
  deepSeekConfigured: boolean;
}

export interface ChargeResult {
  ok: boolean;
  remaining: number;
  deducted: number;
  error?: 'INSUFFICIENT_WARP' | 'INVALID_AMOUNT';
}

function initializeBillingLedger(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_billing_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      warp_delta INTEGER NOT NULL,
      token_delta INTEGER DEFAULT 0,
      reason TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_billing_log_user ON platform_billing_log(user_id);
  `);
  try {
    db.exec(`ALTER TABLE platform_billing_log ADD COLUMN token_delta INTEGER DEFAULT 0`);
  } catch {}
}

function logBillingEvent(userId: string, input: { warpDelta?: number; tokenDelta?: number; reason: string }): void {
  initializeBillingLedger();
  const warpDelta = Math.trunc(input.warpDelta ?? 0);
  const tokenDelta = Math.trunc(input.tokenDelta ?? 0);
  getLearningDb()
    .prepare(`INSERT INTO platform_billing_log (user_id, warp_delta, token_delta, reason) VALUES (?, ?, ?, ?)`)
    .run(userId, warpDelta, tokenDelta, input.reason.slice(0, 120));
}

export function listPlatformBillingLog(
  userId: string,
  limit = 12,
): Array<{ warp_delta: number; token_delta: number; reason: string; created_at: number }> {
  initializeBillingLedger();
  return getLearningDb()
    .prepare(
      `SELECT warp_delta, token_delta, reason, created_at FROM platform_billing_log
       WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId.trim(), Math.min(50, Math.max(1, limit))) as Array<{
    warp_delta: number;
    token_delta: number;
    reason: string;
    created_at: number;
  }>;
}

export function getBillingStatus(userId: string): BillingStatus {
  const ledger = ensureWarpLedger(userId);
  const wallet = ensureWalletRow(userId);
  return {
    userId,
    availableWarpPoints: Number(ledger.available_warp_points ?? 0),
    tokenBalance: Number(wallet.token_balance ?? 0),
    invitationCode: ledger.invitation_code ?? '',
    platformHosted: true,
    deepSeekConfigured: Boolean(process.env.DEEPSEEK_API_KEY?.trim() || getUserLlmSnapshot(userId, 'deepseek').hasKey),
  };
}

export function chargeWarp(userId: string, amount: number, reason: BillingReason): ChargeResult {
  const cost = Math.max(0, Math.round(amount));
  if (cost <= 0) {
    const ledger = getWarpLedger(userId);
    return { ok: true, remaining: Number(ledger.available_warp_points), deducted: 0 };
  }

  const ledger = ensureWarpLedger(userId);
  const before = Number(ledger.available_warp_points ?? 0);
  if (before < cost) {
    return { ok: false, remaining: before, deducted: 0, error: 'INSUFFICIENT_WARP' };
  }

  const remaining = deductWarpPoints(userId, cost);
  logBillingEvent(userId, { warpDelta: -cost, reason: String(reason) });
  return { ok: true, remaining, deducted: cost };
}

export function topUpWarp(userId: string, amount: number, reason = 'TOPUP'): number {
  const grant = Math.max(1, Math.round(amount));
  const remaining = grantWarpPoints(userId, grant);
  logBillingEvent(userId, { warpDelta: grant, reason });
  return remaining;
}

/**
 * 平台托管算力：非自备 Key 用户调用 LLM 前扣减 Warp
 */
export function chargePlatformCompute(
  userId: string,
  cost: number,
  reason: BillingReason,
  usesPrivateKey: boolean,
): ChargeResult {
  if (usesPrivateKey) {
    const ledger = getWarpLedger(userId);
    return { ok: true, remaining: Number(ledger.available_warp_points), deducted: 0 };
  }

  const tokenSplit = ZhiTokenSplitter.siphonForBillingReason(userId, reason);
  if (!tokenSplit.success) {
    const ledger = getWarpLedger(userId);
    return {
      ok: false,
      remaining: Number(ledger.available_warp_points ?? 0),
      deducted: 0,
      error: 'INSUFFICIENT_WARP',
    };
  }

  return chargeWarp(userId, cost, reason);
}

export function applyEscapePenalty(userId: string): ChargeResult & { mentorWords: string } {
  ZhiTokenSplitter.siphonEnergy(
    userId,
    'AP_KNOWLEDGE_FORGE',
    'LIGHTWEIGHT',
    '认知逃避 · 逻辑单元冻结惩罚',
    { applyFreeze: true },
  );
  const result = chargeWarp(userId, WARP_COST.ESCAPE_PENALTY, 'ESCAPE_PENALTY');
  const mentorWords =
    '曦宝，你已经在这个卡点前逃避了整整 3 分钟。为了惩罚你的自我麻痹，平台已代扣 10 Warp 算力燃料。听着，逃避不会让梦校录取门槛降低一分。今晚不解决这个因果漏洞，谁也不准退场。';
  return { ...result, mentorWords };
}

/** 每 1000 输入 token = 1 Warp, 每 1000 输出 token = 2 Warp */
const LLM_TOKEN_WARP_RATE = { input: 0.001, output: 0.002 };

/** 每日 token 上限控制 */
let dailyTokenCaps: Map<string, number> = new Map(); // userId -> daily token limit (0 = unlimited)

export function setDailyTokenCap(userId: string, cap: number): void {
  if (cap <= 0) dailyTokenCaps.delete(userId);
  else dailyTokenCaps.set(userId, cap);
}

export function getDailyTokenCap(userId: string): number {
  return dailyTokenCaps.get(userId) ?? 0;
}

async function checkDailyTokenCap(userId: string, inputTokens: number, outputTokens: number): Promise<{ ok: boolean; remainingTokens: number; usedTokens: number }> {
  const cap = dailyTokenCaps.get(userId);
  if (!cap) return { ok: true, remainingTokens: 0, usedTokens: 0 };
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_token_usage (
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      used_tokens INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, date)
    )
  `);
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare('SELECT used_tokens FROM daily_token_usage WHERE user_id = ? AND date = ?').get(userId, today) as { used_tokens: number } | undefined;
  const used = row?.used_tokens ?? 0;
  const total = used + inputTokens + outputTokens;
  if (total > cap) return { ok: false, remainingTokens: cap - used, usedTokens: used };
  db.prepare('INSERT OR REPLACE INTO daily_token_usage (user_id, date, used_tokens) VALUES (?, ?, ?)').run(userId, today, total);
  return { ok: true, remainingTokens: cap - total, usedTokens: total };
}

export function initLlmBilling(): void {
  setLlmBillingHook((userId: string, call: LlmCostRecord) => {
    finalizeLlmTokenReservation(userId, call.traceId, call.inputTokens + call.outputTokens, `LLM:${call.provider}`);
  });
}

export { checkDailyTokenCap };

export function assertWarpBalance(userId: string, minimum = 1): ChargeResult {
  const ledger = ensureWarpLedger(userId);
  const remaining = Number(ledger.available_warp_points ?? 0);
  if (remaining < minimum) {
    return { ok: false, remaining, deducted: 0, error: 'INSUFFICIENT_WARP' };
  }
  return { ok: true, remaining, deducted: 0 };
}

type LlmReservation = { userId: string; reservedTokens: number; createdAtSec: number };
const llmReservations: Map<string, LlmReservation> = new Map();

export function reserveLlmTokens(userId: string, traceId: string, reserveTokens: number): { ok: boolean; remaining: number; reserved: number } {
  const uid = userId.trim();
  const tid = traceId.trim();
  const reserve = Math.max(0, Math.floor(reserveTokens));
  if (!uid || !tid || reserve <= 0) {
    const wallet = ensureWalletRow(uid);
    return { ok: true, remaining: Number(wallet.token_balance ?? 0), reserved: 0 };
  }
  const consumed = consumeTokensFromDB(uid, reserve);
  if (!consumed.ok) {
    return { ok: false, remaining: consumed.remaining, reserved: 0 };
  }
  llmReservations.set(tid, { userId: uid, reservedTokens: reserve, createdAtSec: Math.floor(Date.now() / 1000) });
  logBillingEvent(uid, { tokenDelta: -reserve, reason: `RESERVE:${tid}` });
  return { ok: true, remaining: consumed.remaining, reserved: reserve };
}

export function releaseLlmTokenReservation(userId: string, traceId: string, reason: string): void {
  const uid = userId.trim();
  const tid = traceId.trim();
  const r = llmReservations.get(tid);
  if (!r) return;
  if (r.userId !== uid) return;
  llmReservations.delete(tid);
  if (r.reservedTokens > 0) {
    addTokensToDB(uid, r.reservedTokens);
    logBillingEvent(uid, { tokenDelta: r.reservedTokens, reason: reason.slice(0, 120) });
  }
}

export function finalizeLlmTokenReservation(userId: string, traceId: string, actualTokens: number, reason: string): void {
  const uid = userId.trim();
  const tid = traceId.trim();
  const r = llmReservations.get(tid);
  const used = Math.max(0, Math.floor(actualTokens));
  if (!r || r.userId !== uid) {
    if (used > 0) {
      const consumed = consumeTokensFromDB(uid, used);
      if (consumed.ok) logBillingEvent(uid, { tokenDelta: -consumed.deducted, reason });
    }
    return;
  }
  llmReservations.delete(tid);

  if (used < r.reservedTokens) {
    const refund = r.reservedTokens - used;
    if (refund > 0) {
      addTokensToDB(uid, refund);
      logBillingEvent(uid, { tokenDelta: refund, reason: `REFUND:${tid}` });
    }
    return;
  }

  const extra = used - r.reservedTokens;
  if (extra > 0) {
    const consumed = consumeTokensFromDB(uid, extra);
    if (consumed.ok && consumed.deducted > 0) logBillingEvent(uid, { tokenDelta: -consumed.deducted, reason });
    return;
  }
}
