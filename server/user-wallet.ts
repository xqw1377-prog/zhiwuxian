/**
 * WUXIAN · 统一用户钱包（SQLite 持久化）
 * P0-3：委托 src/db/wallet-schema 单一账本
 */

import { getLearningDb, learningUid } from './wuxian-learning-db';
import { createHash } from 'crypto';
import { MONTHLY_FREE_WARP_MINUTES } from './billing-api';
import {
  initializeUnifiedWalletSystem,
  ensureWalletRow,
  consumeWarpPowerFromDB,
  addWarpMinutesToDB,
  addTokensToDB,
  consumeTokensFromDB,
  setSubscriptionInDB,
  type SubscriptionStatus,
} from '../src/db/wallet-schema';
import { hasAnyUserLlmKey } from '../src/db/user-llm-config-schema';

export type SubscriptionTier = 'free' | 'growth' | 'pro';

export interface WalletRow {
  user_id: string;
  credits: number;
  daily_free_credits: number;
  credits_reset_at: string;
  tier: SubscriptionTier;
  tier_expires_at: string | null;
  warp_minutes: number;
  token_balance: number;
  warp_unlimited_until: string | null;
  warp_monthly_reset_at: string;
  total_warp_purchased: number;
  daily_goal_deconstructs: number;
  daily_audio_minutes: number;
  daily_correction_calls: number;
  usage_reset_at: string;
  created_at: string;
  updated_at: string;
}

function initWalletSchema(): void {
  initializeUnifiedWalletSystem();
}

function migrateFromLegacyBilling(_db: ReturnType<typeof getLearningDb>): void {
  // 迁移逻辑已收敛至 wallet-schema
}

let schemaReady = false;

export function ensureWalletSchema(): void {
  if (!schemaReady) {
    initWalletSchema();
    schemaReady = true;
  }
}

export function ensureWallet(userId: string): WalletRow {
  ensureWalletSchema();
  ensureWalletRow(userId);
  const db = getLearningDb();
  applyResets(userId, db.prepare(`SELECT * FROM user_wallet WHERE user_id = ?`).get(userId) as WalletRow);
  return db.prepare(`SELECT * FROM user_wallet WHERE user_id = ?`).get(userId) as WalletRow;
}

function applyResets(userId: string, row: WalletRow): void {
  const db = getLearningDb();
  const now = new Date();

  const creditsReset = new Date(row.credits_reset_at);
  if (creditsReset.toDateString() !== now.toDateString()) {
    db.prepare(`
      UPDATE user_wallet SET credits = daily_free_credits, credits_reset_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(userId);
  }

  const usageReset = new Date(row.usage_reset_at);
  if (usageReset.toDateString() !== now.toDateString()) {
    db.prepare(`
      UPDATE user_wallet SET
        daily_goal_deconstructs = 0, daily_audio_minutes = 0, daily_correction_calls = 0,
        usage_reset_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(userId);
  }

  const warpReset = new Date(row.warp_monthly_reset_at);
  if (warpReset.getMonth() !== now.getMonth() || warpReset.getFullYear() !== now.getFullYear()) {
    db.prepare(`
      UPDATE user_wallet SET warp_minutes = warp_minutes + ?, warp_monthly_reset_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(MONTHLY_FREE_WARP_MINUTES, userId);
  }

  if (row.tier !== 'free' && row.tier_expires_at && new Date(row.tier_expires_at) < now) {
    db.prepare(`
      UPDATE user_wallet SET tier = 'free', tier_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).run(userId);
  }
}

export function getWalletSummary(userId: string) {
  const w = ensureWallet(userId);
  const db = getLearningDb();
  const cert = db.prepare(`
    SELECT is_lifetime_certified, encrypted_api_key FROM user_wallet WHERE user_id = ?
  `).get(userId) as { is_lifetime_certified: number; encrypted_api_key: string | null } | undefined;
  const hasKey = Boolean(cert?.encrypted_api_key) || hasAnyUserLlmKey(userId);

  return {
    userId: w.user_id,
    credits: w.credits,
    dailyFreeCredits: w.daily_free_credits,
    tier: w.tier,
    tierExpiresAt: w.tier_expires_at,
    availableWarpMinutes: w.warp_minutes,
    tokenBalance: Number(w.token_balance ?? 0),
    unlimitedUntil: w.warp_unlimited_until,
    totalWarpPurchased: w.total_warp_purchased,
    isLifetimeCertified: (cert?.is_lifetime_certified ?? 0) === 1,
    hasPrivateApiKey: hasKey,
    dailyUsage: {
      goalDeconstructs: w.daily_goal_deconstructs,
      audioMinutes: w.daily_audio_minutes,
      correctionCalls: w.daily_correction_calls,
    },
    wormholeEnabled: w.tier === 'growth' || w.tier === 'pro' || (cert?.is_lifetime_certified ?? 0) === 1,
  };
}

export function addCredits(userId: string, amount: number): number {
  ensureWallet(userId);
  getLearningDb().prepare(`
    UPDATE user_wallet SET credits = credits + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).run(amount, userId);
  return ensureWallet(userId).credits;
}

export function consumeCredits(userId: string, cost: number): { ok: boolean; remaining: number } {
  const w = ensureWallet(userId);
  if (w.credits < cost) return { ok: false, remaining: w.credits };
  getLearningDb().prepare(`
    UPDATE user_wallet SET credits = credits - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).run(cost, userId);
  return { ok: true, remaining: ensureWallet(userId).credits };
}

export function setSubscriptionTier(userId: string, tier: SubscriptionTier, days = 30): void {
  ensureWallet(userId);
  const expires = tier === 'free' ? null : new Date(Date.now() + days * 86400000).toISOString();
  getLearningDb().prepare(`
    UPDATE user_wallet SET tier = ?, tier_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).run(tier, expires, userId);
  if (tier === 'pro') {
    const until = new Date();
    until.setDate(until.getDate() + days);
    getLearningDb().prepare(`
      UPDATE user_wallet SET warp_unlimited_until = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).run(until.toISOString(), userId);
  }
  const status: SubscriptionStatus = tier === 'free' ? 'INACTIVE' : 'ACTIVE';
  const expiresUnix = expires ? Math.floor(new Date(expires).getTime() / 1000) : 0;
  setSubscriptionInDB(userId, status, expiresUnix);
}

export function incrementUsage(userId: string, field: 'daily_goal_deconstructs' | 'daily_audio_minutes' | 'daily_correction_calls', n = 1): void {
  ensureWallet(userId);
  getLearningDb().prepare(`
    UPDATE user_wallet SET ${field} = ${field} + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).run(n, userId);
}

export function addWarpMinutes(userId: string, minutes: number): void {
  addWarpMinutesToDB(userId, minutes);
}

export function addTokens(userId: string, tokens: number): number {
  return addTokensToDB(userId, tokens);
}

export function consumeTokens(userId: string, tokens: number): { ok: boolean; remaining: number; deducted: number } {
  return consumeTokensFromDB(userId, tokens);
}

export function setWarpUnlimited(userId: string, days: number): void {
  ensureWallet(userId);
  const until = new Date();
  until.setDate(until.getDate() + days);
  getLearningDb().prepare(`
    UPDATE user_wallet SET warp_unlimited_until = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).run(until.toISOString(), userId);
  setSubscriptionInDB(userId, 'ACTIVE', Math.floor(until.getTime() / 1000));
}

export function consumeWarpMinutes(userId: string, minutes: number): { ok: boolean; remaining: number; unlimited: boolean } {
  const w = ensureWallet(userId);
  const unlimited = (w.tier === 'pro' && w.tier_expires_at && new Date(w.tier_expires_at) > new Date())
    || (w.warp_unlimited_until && new Date(w.warp_unlimited_until) > new Date());
  if (unlimited) return { ok: true, remaining: w.warp_minutes, unlimited: true };

  const ok = consumeWarpPowerFromDB(userId, minutes);
  const refreshed = ensureWallet(userId);
  return { ok, remaining: refreshed.warp_minutes, unlimited: false };
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function revokeSession(token: string): void {
  ensureWalletSchema();
  const db = getLearningDb();
  const hashed = tokenHash(token);
  db.prepare(`DELETE FROM user_sessions_v2 WHERE token_hash = ?`).run(hashed);
  db.prepare(`DELETE FROM user_sessions WHERE token = ?`).run(token);
}

export function revokeAllSessions(userId: string): number {
  ensureWalletSchema();
  const db = getLearningDb();
  const v2 = db.prepare(`DELETE FROM user_sessions_v2 WHERE user_id = ?`).run(userId);
  const legacy = db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(userId);
  return Number(v2.changes ?? 0) + Number(legacy.changes ?? 0);
}

export function createSession(userId?: string, displayName?: string): { token: string; userId: string } {
  ensureWalletSchema();
  const uid = userId ?? `u-${learningUid().slice(0, 8)}`;
  ensureWallet(uid);
  const token = learningUid();
  const ttlDays = (() => {
    const raw = Number(process.env.WUXIAN_SESSION_TTL_DAYS);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return process.env.NODE_ENV === 'production' ? 30 : 90;
  })();
  const expires = new Date(Date.now() + ttlDays * 86400000).toISOString();
  getLearningDb().prepare(`
    INSERT INTO user_sessions_v2 (token_hash, token_prefix, user_id, display_name, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(tokenHash(token), token.slice(0, 8), uid, displayName ?? null, expires);
  return { token, userId: uid };
}

export function resolveSession(token: string): { userId: string; displayName: string | null } | null {
  ensureWalletSchema();
  const db = getLearningDb();
  const hashed = tokenHash(token);
  let row = db.prepare(`
    SELECT user_id, display_name, expires_at FROM user_sessions_v2 WHERE token_hash = ?
  `).get(hashed) as { user_id: string; display_name: string | null; expires_at: string } | undefined;

  if (!row) {
    const legacy = db.prepare(`
      SELECT user_id, display_name, expires_at, created_at FROM user_sessions WHERE token = ?
    `).get(token) as { user_id: string; display_name: string | null; expires_at: string; created_at: string } | undefined;
    if (!legacy) return null;
    try {
      db.prepare(`
        INSERT OR IGNORE INTO user_sessions_v2 (token_hash, token_prefix, user_id, display_name, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(hashed, token.slice(0, 8), legacy.user_id, legacy.display_name ?? null, legacy.created_at, legacy.expires_at ?? null);
    } catch {
      /* ignore */
    }
    row = legacy;
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  ensureWallet(row.user_id);
  return { userId: row.user_id, displayName: row.display_name };
}
