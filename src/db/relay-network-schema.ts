/**
 * WUXIAN 2.0 · 分布式自学中继站 + 星盟裂变
 */

import { getLearningDb } from '../../server/wuxian-learning-db';
import { ensureWalletRow } from './wallet-schema';
import {
  applyReferralWarpBonus,
  ensureWarpLedger,
  initializeRelayNetworkSystem,
  REFERRAL_WARP_BONUS,
  setRelayNodeFromWallet,
} from './relay-schema';

export function initializeRelayNetwork(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS relay_compute_sessions (
      id TEXT PRIMARY KEY,
      consumer_user_id TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      warp_spent REAL NOT NULL,
      status TEXT DEFAULT 'SETTLED',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS star_alliance_referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_user_id TEXT NOT NULL,
      invitee_user_id TEXT NOT NULL,
      invite_token TEXT,
      warp_granted REAL DEFAULT 15,
      relay_star_lit INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(referrer_user_id, invitee_user_id)
    );

    CREATE TABLE IF NOT EXISTS star_medal_registry (
      medal_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      poster_path TEXT,
      verify_hash TEXT NOT NULL,
      issued_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_relay_provider ON relay_compute_sessions(provider_user_id);
    CREATE INDEX IF NOT EXISTS idx_referral_referrer ON star_alliance_referrals(referrer_user_id);
  `);

  const cols = db.prepare(`PRAGMA table_info(user_wallet)`).all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('share_relay_enabled')) {
    db.exec(`ALTER TABLE user_wallet ADD COLUMN share_relay_enabled INTEGER DEFAULT 0`);
  }
  if (!names.has('relay_warp_earned')) {
    db.exec(`ALTER TABLE user_wallet ADD COLUMN relay_warp_earned REAL DEFAULT 0`);
  }
  if (!names.has('relay_sessions_served')) {
    db.exec(`ALTER TABLE user_wallet ADD COLUMN relay_sessions_served INTEGER DEFAULT 0`);
  }
}

export interface RelayProvider {
  userId: string;
  relaySessionsServed: number;
  isLifetime: boolean;
}

export function setRelaySharing(userId: string, enabled: boolean): void {
  initializeRelayNetwork();
  initializeRelayNetworkSystem();
  ensureWalletRow(userId);
  getLearningDb().prepare(`
    UPDATE user_wallet SET share_relay_enabled = ?, updated_at = strftime('%s', 'now') WHERE user_id = ?
  `).run(enabled ? 1 : 0, userId);
  if (enabled) {
    setRelayNodeFromWallet(userId, true);
  } else {
    getLearningDb().prepare(`
      UPDATE relay_nodes SET relay_status = 0, updated_at = strftime('%s', 'now') WHERE user_id = ?
    `).run(userId);
  }
}

export function listRelayProviders(limit = 20): RelayProvider[] {
  initializeRelayNetwork();
  const db = getLearningDb();
  return db.prepare(`
    SELECT user_id, relay_sessions_served, is_lifetime_certified
    FROM user_wallet
    WHERE share_relay_enabled = 1 AND is_lifetime_certified = 1 AND encrypted_api_key IS NOT NULL
    ORDER BY relay_sessions_served DESC
    LIMIT ?
  `).all(limit) as RelayProvider[];
}

export function settleRelayCompute(input: {
  consumerUserId: string;
  providerUserId: string;
  warpCost: number;
}): { sessionId: string; providerEarned: number } {
  initializeRelayNetwork();
  const db = getLearningDb();
  const cost = Math.max(1, Math.min(60, input.warpCost));
  const providerEarned = Math.round(cost * 0.35 * 10) / 10;
  const sessionId = `relay-${Date.now().toString(36)}`;

  const consumer = db.prepare(`SELECT warp_minutes FROM user_wallet WHERE user_id = ?`).get(input.consumerUserId) as
    | { warp_minutes: number }
    | undefined;
  if (!consumer || consumer.warp_minutes < cost) {
    throw new Error('Warp 积分不足，无法调用中继算力');
  }

  db.prepare(`UPDATE user_wallet SET warp_minutes = warp_minutes - ? WHERE user_id = ?`).run(cost, input.consumerUserId);
  db.prepare(`
    UPDATE user_wallet
    SET relay_warp_earned = relay_warp_earned + ?,
        relay_sessions_served = relay_sessions_served + 1,
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(providerEarned, input.providerUserId);

  db.prepare(`
    INSERT INTO relay_compute_sessions (id, consumer_user_id, provider_user_id, warp_spent)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, input.consumerUserId, input.providerUserId, cost);

  return { sessionId, providerEarned };
}

export function recordStarAllianceReferral(input: {
  referrerUserId: string;
  inviteeUserId: string;
  inviteToken?: string;
}): {
  warpGranted: number;
  relayStars: number;
  referrerWarpPoints: number;
  inviteeWarpPoints: number;
} {
  initializeRelayNetwork();
  initializeRelayNetworkSystem();
  const db = getLearningDb();
  const warpGranted = REFERRAL_WARP_BONUS;

  const exists = db.prepare(`
    SELECT id FROM star_alliance_referrals WHERE referrer_user_id = ? AND invitee_user_id = ?
  `).get(input.referrerUserId, input.inviteeUserId);
  if (exists) {
    const stars = db.prepare(`
      SELECT gravity_relay_stars FROM goal_reversing_matrix WHERE user_id = ?
    `).get(input.referrerUserId) as { gravity_relay_stars?: number } | undefined;
    const ledger = ensureWarpLedger(input.referrerUserId);
    return {
      warpGranted: 0,
      relayStars: Number(stars?.gravity_relay_stars ?? 0),
      referrerWarpPoints: ledger.available_warp_points,
      inviteeWarpPoints: ensureWarpLedger(input.inviteeUserId).available_warp_points,
    };
  }

  db.prepare(`
    INSERT INTO star_alliance_referrals (referrer_user_id, invitee_user_id, invite_token, warp_granted)
    VALUES (?, ?, ?, ?)
  `).run(input.referrerUserId, input.inviteeUserId, input.inviteToken ?? null, warpGranted);

  const bonus = applyReferralWarpBonus(input.referrerUserId, input.inviteeUserId);
  db.prepare(`
    UPDATE user_wallet SET warp_minutes = warp_minutes + ? WHERE user_id = ?
  `).run(warpGranted, input.referrerUserId);
  db.prepare(`
    UPDATE user_wallet SET warp_minutes = warp_minutes + ? WHERE user_id = ?
  `).run(warpGranted, input.inviteeUserId);

  db.prepare(`
    UPDATE goal_reversing_matrix
    SET gravity_relay_stars = COALESCE(gravity_relay_stars, 0) + 1,
        updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(input.referrerUserId);

  const stars = db.prepare(`
    SELECT gravity_relay_stars FROM goal_reversing_matrix WHERE user_id = ?
  `).get(input.referrerUserId) as { gravity_relay_stars?: number };

  return {
    warpGranted,
    relayStars: Number(stars?.gravity_relay_stars ?? 1),
    referrerWarpPoints: bonus.referrerPoints,
    inviteeWarpPoints: bonus.inviteePoints,
  };
}

export function registerStarMedal(userId: string, posterPath: string): { medalId: string; verifyUrl: string } {
  initializeRelayNetwork();
  const db = getLearningDb();
  const medalId = `medal-${userId}-${Date.now().toString(36)}`;
  const verifyHash = Buffer.from(`${medalId}:${posterPath}:${Date.now()}`).toString('base64url').slice(0, 32);

  db.prepare(`
    INSERT INTO star_medal_registry (medal_id, user_id, poster_path, verify_hash)
    VALUES (?, ?, ?, ?)
  `).run(medalId, userId, posterPath, verifyHash);

  const base = process.env.WUXIAN_SHARE_BASE_URL?.trim() || 'https://wuxian.app';
  return { medalId, verifyUrl: `${base}/v/medal/${medalId}?h=${verifyHash}` };
}

export function verifyStarMedal(medalId: string, hash: string): boolean {
  initializeRelayNetwork();
  const row = getLearningDb().prepare(`
    SELECT verify_hash FROM star_medal_registry WHERE medal_id = ?
  `).get(medalId) as { verify_hash: string } | undefined;
  return Boolean(row && row.verify_hash === hash);
}
