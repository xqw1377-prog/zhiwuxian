/**
 * WUXIAN 2.0 · 分布式算力网络账本（节点路由 + Warp 燃料清算）
 */

import { randomUUID, createHash } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { ensureWalletRow } from './wallet-schema';
import { decryptApiKey, encryptApiKey } from './wallet-crypto';

export const INITIAL_WARP_POINTS = 100;
export const WARP_VISION_RELAY_COST = 5;
export const REFERRAL_WARP_BONUS = 50;

export const RELAY_CIRCUIT_FREEZE_SEC = 3600;

export interface RelayNodeRow {
  node_id: string;
  user_id: string;
  encrypted_api_key: string;
  base_url: string | null;
  relay_status: number;
  total_served_tokens: number;
  circuit_break_until: number;
  updated_at: number;
}

export interface WarpLedgerRow {
  user_id: string;
  available_warp_points: number;
  accumulated_contributed_tokens: number;
  invitation_code: string;
}

function inviteCodeFor(userId: string): string {
  const slug = createHash('sha256').update(userId).digest('hex').slice(0, 6).toUpperCase();
  return `WUXIAN-${slug}`;
}

/**
 * 部署 2.0 分布式算力网络账本
 */
export function initializeRelayNetworkSystem(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS relay_nodes (
      node_id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      encrypted_api_key TEXT NOT NULL,
      base_url TEXT,
      relay_status INTEGER DEFAULT 1,
      total_served_tokens INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS warp_ledger (
      user_id TEXT PRIMARY KEY,
      available_warp_points INTEGER DEFAULT 100,
      accumulated_contributed_tokens INTEGER DEFAULT 0,
      invitation_code TEXT UNIQUE
    );

    CREATE INDEX IF NOT EXISTS idx_relay_nodes_status ON relay_nodes(relay_status, total_served_tokens);
  `);

  const cols = db.prepare(`PRAGMA table_info(relay_nodes)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'circuit_break_until')) {
    db.exec(`ALTER TABLE relay_nodes ADD COLUMN circuit_break_until INTEGER DEFAULT 0`);
  }
}

/** 解冻已过冷却期的节点（供调度器在选路前调用） */
export function thawExpiredRelayCircuits(): number {
  initializeRelayNetworkSystem();
  const result = getLearningDb().prepare(`
    UPDATE relay_nodes
    SET relay_status = 1, circuit_break_until = 0, updated_at = strftime('%s', 'now')
    WHERE relay_status = 0
      AND circuit_break_until > 0
      AND circuit_break_until <= strftime('%s', 'now')
  `).run();
  return result.changes;
}

export function tripRelayCircuitBreaker(nodeId: string, freezeSeconds = RELAY_CIRCUIT_FREEZE_SEC): void {
  initializeRelayNetworkSystem();
  const until = Math.floor(Date.now() / 1000) + freezeSeconds;
  getLearningDb().prepare(`
    UPDATE relay_nodes
    SET relay_status = 0, circuit_break_until = ?, updated_at = strftime('%s', 'now')
    WHERE node_id = ?
  `).run(until, nodeId);
}

export function ensureWarpLedger(userId: string): WarpLedgerRow {
  initializeRelayNetworkSystem();
  ensureWalletRow(userId);
  const db = getLearningDb();
  let row = db.prepare(`SELECT * FROM warp_ledger WHERE user_id = ?`).get(userId) as WarpLedgerRow | undefined;
  if (!row) {
    const code = inviteCodeFor(userId);
    db.prepare(`
      INSERT INTO warp_ledger (user_id, available_warp_points, accumulated_contributed_tokens, invitation_code)
      VALUES (?, ?, 0, ?)
    `).run(userId, INITIAL_WARP_POINTS, code);
    row = db.prepare(`SELECT * FROM warp_ledger WHERE user_id = ?`).get(userId) as WarpLedgerRow;
  }
  return row;
}

export function getWarpLedger(userId: string): WarpLedgerRow {
  return ensureWarpLedger(userId);
}

export function deductWarpPoints(userId: string, amount: number): number {
  ensureWarpLedger(userId);
  const db = getLearningDb();
  db.prepare(`
    UPDATE warp_ledger SET available_warp_points = MAX(0, available_warp_points - ?) WHERE user_id = ?
  `).run(amount, userId);
  const row = db.prepare(`SELECT available_warp_points FROM warp_ledger WHERE user_id = ?`).get(userId) as {
    available_warp_points: number;
  };
  return Number(row.available_warp_points);
}

export function grantWarpPoints(userId: string, amount: number): number {
  ensureWarpLedger(userId);
  const db = getLearningDb();
  db.prepare(`
    UPDATE warp_ledger SET available_warp_points = available_warp_points + ? WHERE user_id = ?
  `).run(amount, userId);
  const row = db.prepare(`SELECT available_warp_points FROM warp_ledger WHERE user_id = ?`).get(userId) as {
    available_warp_points: number;
  };
  return Number(row.available_warp_points);
}

export function pickActiveRelayNode(
  excludeUserId: string,
  excludeNodeIds: string[] = [],
): RelayNodeRow | null {
  initializeRelayNetworkSystem();
  thawExpiredRelayCircuits();
  const db = getLearningDb();
  const now = Math.floor(Date.now() / 1000);

  if (excludeNodeIds.length === 0) {
    const row = db.prepare(`
      SELECT * FROM relay_nodes
      WHERE relay_status = 1
        AND user_id != ?
        AND (circuit_break_until IS NULL OR circuit_break_until <= ?)
      ORDER BY total_served_tokens ASC
      LIMIT 1
    `).get(excludeUserId, now) as RelayNodeRow | undefined;
    return row ?? null;
  }

  const placeholders = excludeNodeIds.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT * FROM relay_nodes
    WHERE relay_status = 1
      AND user_id != ?
      AND node_id NOT IN (${placeholders})
      AND (circuit_break_until IS NULL OR circuit_break_until <= ?)
    ORDER BY total_served_tokens ASC
    LIMIT 1
  `).get(excludeUserId, ...excludeNodeIds, now) as RelayNodeRow | undefined;
  return row ?? null;
}

export function upsertRelayNode(input: {
  userId: string;
  apiKey: string;
  baseUrl?: string | null;
  active: boolean;
}): RelayNodeRow {
  initializeRelayNetworkSystem();
  const db = getLearningDb();
  const encrypted = encryptApiKey(input.apiKey.trim());
  const existing = db.prepare(`SELECT node_id FROM relay_nodes WHERE user_id = ?`).get(input.userId) as
    | { node_id: string }
    | undefined;

  if (existing) {
    db.prepare(`
      UPDATE relay_nodes
      SET encrypted_api_key = ?, base_url = ?, relay_status = ?, updated_at = strftime('%s', 'now')
      WHERE user_id = ?
    `).run(encrypted, input.baseUrl ?? null, input.active ? 1 : 0, input.userId);
  } else {
    const nodeId = `relay_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    db.prepare(`
      INSERT INTO relay_nodes (node_id, user_id, encrypted_api_key, base_url, relay_status)
      VALUES (?, ?, ?, ?, ?)
    `).run(nodeId, input.userId, encrypted, input.baseUrl ?? null, input.active ? 1 : 0);
  }

  return db.prepare(`SELECT * FROM relay_nodes WHERE user_id = ?`).get(input.userId) as RelayNodeRow;
}

export function setRelayNodeFromWallet(userId: string, active: boolean): RelayNodeRow | null {
  ensureWalletRow(userId);
  const wallet = getLearningDb().prepare(`
    SELECT encrypted_api_key, is_lifetime_certified FROM user_wallet WHERE user_id = ?
  `).get(userId) as { encrypted_api_key: string | null; is_lifetime_certified: number } | undefined;

  if (!wallet?.encrypted_api_key || wallet.is_lifetime_certified !== 1) {
    throw new Error('仅终身认证且已配置私有 API Key 的极客可托管算力中继');
  }

  const apiKey = decryptApiKey(wallet.encrypted_api_key);
  const baseUrl = process.env.DEEPSEEK_BASE_URL?.trim() || undefined;
  return upsertRelayNode({ userId, apiKey, baseUrl, active });
}

export function getRelayNodeStatus(userId: string): {
  isSharingRelay: boolean;
  totalServedTokens: number;
  contributedTokens: number;
} {
  initializeRelayNetworkSystem();
  const ledger = ensureWarpLedger(userId);
  const node = getLearningDb().prepare(`SELECT relay_status, total_served_tokens FROM relay_nodes WHERE user_id = ?`).get(userId) as
    | { relay_status: number; total_served_tokens: number }
    | undefined;
  return {
    isSharingRelay: (node?.relay_status ?? 0) === 1,
    totalServedTokens: Number(node?.total_served_tokens ?? 0),
    contributedTokens: Number(ledger.accumulated_contributed_tokens),
  };
}

export function settleRelayVisionUsage(input: {
  consumerUserId: string;
  providerUserId: string;
  providerNodeId: string;
  tokensUsed: number;
  warpCost?: number;
}): { remainingWarpPoints: number } {
  const cost = input.warpCost ?? WARP_VISION_RELAY_COST;
  const db = getLearningDb();

  const settle = db.transaction(() => {
    deductWarpPoints(input.consumerUserId, cost);
    db.prepare(`
      UPDATE relay_nodes SET total_served_tokens = total_served_tokens + ?, updated_at = strftime('%s', 'now')
      WHERE node_id = ?
    `).run(input.tokensUsed, input.providerNodeId);
    db.prepare(`
      UPDATE warp_ledger SET accumulated_contributed_tokens = accumulated_contributed_tokens + ? WHERE user_id = ?
    `).run(input.tokensUsed, input.providerUserId);
    getLearningDb().prepare(`
      UPDATE user_wallet SET relay_sessions_served = relay_sessions_served + 1, relay_warp_earned = relay_warp_earned + ?
      WHERE user_id = ?
    `).run(cost * 0.35, input.providerUserId);
  });
  settle();

  const row = db.prepare(`SELECT available_warp_points FROM warp_ledger WHERE user_id = ?`).get(input.consumerUserId) as {
    available_warp_points: number;
  };
  return { remainingWarpPoints: Number(row.available_warp_points) };
}

export function applyReferralWarpBonus(referrerUserId: string, inviteeUserId: string): {
  referrerPoints: number;
  inviteePoints: number;
} {
  return {
    referrerPoints: grantWarpPoints(referrerUserId, REFERRAL_WARP_BONUS),
    inviteePoints: grantWarpPoints(inviteeUserId, REFERRAL_WARP_BONUS),
  };
}
