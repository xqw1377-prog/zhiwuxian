/**
 * WUXIAN · 工业级统一账本
 * 单一 user_wallet 表锁死 Warp / 订阅 / 支付 webhook 状态位
 */

import type Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';

export type SubscriptionStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

export const LIFETIME_ACTIVATION_CODES = (
  process.env.WUXIAN_LIFETIME_CODES ?? ''
).split(',').map(s => s.trim()).filter(Boolean);

export interface UnifiedWalletRow {
  user_id: string;
  available_warp_minutes: number;
  token_balance: number;
  subscription_status: SubscriptionStatus;
  subscription_expires_at: number;
  credits: number;
  tier: string;
  warp_unlimited_until: string | null;
  total_warp_purchased: number;
  is_lifetime_certified: number;
  encrypted_api_key: string | null;
  created_at: number;
  updated_at: number;
}

const MONTHLY_FREE_WARP = 60;

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some(c => c.name === column);
}

function addColumnIfMissing(db: Database.Database, table: string, ddl: string): void {
  const col = ddl.match(/ADD COLUMN (\w+)/i)?.[1];
  if (col && !tableHasColumn(db, table, col)) {
    db.exec(`ALTER TABLE ${table} ${ddl}`);
  }
}

function sessionTokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function migrateLegacySessions(db: Database.Database): void {
  const hasLegacy = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='user_sessions'`).get();
  const hasV2 = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='user_sessions_v2'`).get();
  if (!hasLegacy || !hasV2) return;

  const rows = db.prepare(`
    SELECT token, user_id, display_name, created_at, expires_at
    FROM user_sessions
  `).all() as {
    token: string;
    user_id: string;
    display_name: string | null;
    created_at: string;
    expires_at: string | null;
  }[];

  if (!rows.length) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO user_sessions_v2 (token_hash, token_prefix, user_id, display_name, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((batch: typeof rows) => {
    for (const r of batch) {
      const token = String(r.token ?? '');
      if (!token) continue;
      const hash = sessionTokenHash(token);
      insert.run(hash, token.slice(0, 8), r.user_id, r.display_name ?? null, r.created_at, r.expires_at ?? null);
    }
  });
  tx(rows);
}

function migrateLegacyBilling(db: Database.Database): void {
  const hasBilling = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='user_billing'`).get();
  if (!hasBilling) return;

  const rows = db.prepare(`SELECT * FROM user_billing`).all() as {
    user_id: string;
    available_warp_minutes: number;
    unlimited_until: string | null;
    total_warp_purchased: number;
  }[];

  for (const r of rows) {
    const exists = db.prepare(`SELECT user_id FROM user_wallet WHERE user_id = ?`).get(r.user_id);
    if (!exists) {
      db.prepare(`
        INSERT INTO user_wallet (user_id, warp_minutes, warp_unlimited_until, total_warp_purchased)
        VALUES (?, ?, ?, ?)
      `).run(r.user_id, r.available_warp_minutes, r.unlimited_until, r.total_warp_purchased);
    }
  }
}

function syncSubscriptionFields(db: Database.Database, userId: string): void {
  const row = db.prepare(`SELECT tier, tier_expires_at, warp_unlimited_until FROM user_wallet WHERE user_id = ?`).get(userId) as {
    tier: string;
    tier_expires_at: string | null;
    warp_unlimited_until: string | null;
  } | undefined;
  if (!row) return;

  const now = Math.floor(Date.now() / 1000);
  let status: SubscriptionStatus = 'INACTIVE';
  let expiresAt = 0;

  if (row.tier !== 'free' && row.tier_expires_at) {
    expiresAt = Math.floor(new Date(row.tier_expires_at).getTime() / 1000);
    status = expiresAt > now ? 'ACTIVE' : 'EXPIRED';
  } else if (row.warp_unlimited_until && new Date(row.warp_unlimited_until) > new Date()) {
    status = 'ACTIVE';
    expiresAt = Math.floor(new Date(row.warp_unlimited_until).getTime() / 1000);
  }

  db.prepare(`
    UPDATE user_wallet
    SET subscription_status = ?, subscription_expires_at = ?, updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(status, expiresAt, userId);
}

/**
 * 工业级统一账本初始化 — 启动即焊死，消灭重启丢失
 */
export function initializeUnifiedWalletSystem(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_wallet (
      user_id TEXT PRIMARY KEY,
      credits REAL DEFAULT 30,
      daily_free_credits REAL DEFAULT 30,
      credits_reset_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      tier TEXT DEFAULT 'free',
      tier_expires_at TEXT,
      warp_minutes REAL DEFAULT 60,
      token_balance INTEGER DEFAULT 0,
      warp_unlimited_until TEXT,
      warp_monthly_reset_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_warp_purchased REAL DEFAULT 0,
      daily_goal_deconstructs INTEGER DEFAULT 0,
      daily_audio_minutes INTEGER DEFAULT 0,
      daily_correction_calls INTEGER DEFAULT 0,
      usage_reset_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      subscription_status TEXT DEFAULT 'INACTIVE',
      subscription_expires_at INTEGER DEFAULT 0,
      is_lifetime_certified INTEGER DEFAULT 0,
      encrypted_api_key TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_type TEXT NOT NULL,
      product_id TEXT NOT NULL,
      amount_cny REAL NOT NULL,
      amount_cents INTEGER,
      currency TEXT DEFAULT 'CNY',
      status TEXT DEFAULT 'PENDING',
      payment_provider TEXT DEFAULT 'simulate',
      payment_ref TEXT,
      third_party_tx_id TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME,
      FOREIGN KEY(user_id) REFERENCES user_wallet(user_id)
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      display_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS user_sessions_v2 (
      token_hash TEXT PRIMARY KEY,
      token_prefix TEXT,
      user_id TEXT NOT NULL,
      display_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user ON payment_orders(user_id, status);
  `);

  addColumnIfMissing(db, 'user_wallet', 'ADD COLUMN subscription_status TEXT DEFAULT \'INACTIVE\'');
  addColumnIfMissing(db, 'user_wallet', 'ADD COLUMN subscription_expires_at INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'payment_orders', 'ADD COLUMN amount_cents INTEGER');
  addColumnIfMissing(db, 'payment_orders', 'ADD COLUMN third_party_tx_id TEXT');
  addColumnIfMissing(db, 'user_wallet', 'ADD COLUMN is_lifetime_certified INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'user_wallet', 'ADD COLUMN encrypted_api_key TEXT');
  addColumnIfMissing(db, 'user_wallet', 'ADD COLUMN token_balance INTEGER DEFAULT 0');

  upgradeWalletSystemForLifetime(db);

  if (tableHasColumn(db, 'payment_orders', 'third_party_tx_id')) {
    try {
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tx_unique ON payment_orders(third_party_tx_id)`);
    } catch {
      /* 索引已存在 */
    }
  }

  migrateLegacySessions(db);
  migrateLegacyBilling(db);
}

/** 终身认证与私有 API Key 槽位升级 */
export function upgradeWalletSystemForLifetime(db?: Database.Database): void {
  const conn = db ?? getLearningDb();
  addColumnIfMissing(conn, 'user_wallet', 'ADD COLUMN is_lifetime_certified INTEGER DEFAULT 0');
  addColumnIfMissing(conn, 'user_wallet', 'ADD COLUMN encrypted_api_key TEXT');
}

export function ensureWalletRow(userId: string): UnifiedWalletRow {
  initializeUnifiedWalletSystem();
  const db = getLearningDb();

  let row = db.prepare(`SELECT * FROM user_wallet WHERE user_id = ?`).get(userId);
  if (!row) {
    db.prepare(`
      INSERT INTO user_wallet (user_id, credits, warp_minutes)
      VALUES (?, 30, ?)
    `).run(userId, MONTHLY_FREE_WARP);
    row = db.prepare(`SELECT * FROM user_wallet WHERE user_id = ?`).get(userId);
  }

  syncSubscriptionFields(db, userId);
  const synced = db.prepare(`SELECT * FROM user_wallet WHERE user_id = ?`).get(userId) as Record<string, unknown>;

  return {
    user_id: String(synced.user_id),
    available_warp_minutes: Number(synced.warp_minutes ?? MONTHLY_FREE_WARP),
    token_balance: Number(synced.token_balance ?? 0),
    subscription_status: (synced.subscription_status as SubscriptionStatus) ?? 'INACTIVE',
    subscription_expires_at: Number(synced.subscription_expires_at ?? 0),
    credits: Number(synced.credits ?? 30),
    tier: String(synced.tier ?? 'free'),
    warp_unlimited_until: (synced.warp_unlimited_until as string | null) ?? null,
    total_warp_purchased: Number(synced.total_warp_purchased ?? 0),
    is_lifetime_certified: Number(synced.is_lifetime_certified ?? 0),
    encrypted_api_key: (synced.encrypted_api_key as string | null) ?? null,
    created_at: Number(synced.created_at ?? 0),
    updated_at: Number(synced.updated_at ?? 0),
  };
}

export function addTokensToDB(userId: string, tokens: number): number {
  const amount = Math.max(0, Math.floor(tokens));
  initializeUnifiedWalletSystem();
  ensureWalletRow(userId);
  if (amount <= 0) {
    const row = getLearningDb().prepare(`SELECT token_balance FROM user_wallet WHERE user_id = ?`).get(userId) as { token_balance: number } | undefined;
    return Number(row?.token_balance ?? 0);
  }
  getLearningDb().prepare(`
    UPDATE user_wallet
    SET token_balance = token_balance + ?, updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(amount, userId);
  const after = getLearningDb().prepare(`SELECT token_balance FROM user_wallet WHERE user_id = ?`).get(userId) as { token_balance: number } | undefined;
  return Number(after?.token_balance ?? 0);
}

export function consumeTokensFromDB(userId: string, tokens: number): { ok: boolean; remaining: number; deducted: number } {
  const amount = Math.max(0, Math.floor(tokens));
  initializeUnifiedWalletSystem();
  ensureWalletRow(userId);
  const db = getLearningDb();
  const tx = db.transaction((uid: string, cost: number) => {
    const row = db.prepare(`SELECT token_balance FROM user_wallet WHERE user_id = ?`).get(uid) as { token_balance: number } | undefined;
    const before = Number(row?.token_balance ?? 0);
    if (cost <= 0) return { ok: true as const, remaining: before, deducted: 0 };
    if (before < cost) return { ok: false as const, remaining: before, deducted: 0 };
    db.prepare(`
      UPDATE user_wallet
      SET token_balance = token_balance - ?, updated_at = strftime('%s', 'now')
      WHERE user_id = ?
    `).run(cost, uid);
    const afterRow = db.prepare(`SELECT token_balance FROM user_wallet WHERE user_id = ?`).get(uid) as { token_balance: number } | undefined;
    return { ok: true as const, remaining: Number(afterRow?.token_balance ?? 0), deducted: cost };
  });
  return tx(userId, amount);
}

/**
 * 真实扣减算力账本原子操作（含无限月卡穿透）
 */
export function consumeWarpPowerFromDB(userId: string, minutes: number): boolean {
  if (!minutes || minutes <= 0) return false;

  initializeUnifiedWalletSystem();
  ensureWalletRow(userId);

  const db = getLearningDb();
  const consume = db.transaction((uid: string, mins: number) => {
    const wallet = db.prepare(`
      SELECT warp_minutes, tier, tier_expires_at, warp_unlimited_until, subscription_status
      FROM user_wallet WHERE user_id = ?
    `).get(uid) as {
      warp_minutes: number;
      tier: string;
      tier_expires_at: string | null;
      warp_unlimited_until: string | null;
      subscription_status: SubscriptionStatus;
    } | undefined;

    if (!wallet) return false;

    const unlimited = (wallet.tier === 'pro' && wallet.tier_expires_at && new Date(wallet.tier_expires_at) > new Date())
      || (wallet.warp_unlimited_until && new Date(wallet.warp_unlimited_until) > new Date());

    if (unlimited) return true;
    if (wallet.warp_minutes < mins) return false;

    db.prepare(`
      UPDATE user_wallet
      SET warp_minutes = warp_minutes - ?, updated_at = strftime('%s', 'now')
      WHERE user_id = ?
    `).run(mins, uid);

    return true;
  });

  return consume(userId, minutes);
}

export function addWarpMinutesToDB(userId: string, minutes: number): void {
  initializeUnifiedWalletSystem();
  ensureWalletRow(userId);
  getLearningDb().prepare(`
    UPDATE user_wallet
    SET warp_minutes = warp_minutes + ?, total_warp_purchased = total_warp_purchased + ?, updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(minutes, minutes, userId);
}

export function setSubscriptionInDB(userId: string, status: SubscriptionStatus, expiresAtUnix: number): void {
  initializeUnifiedWalletSystem();
  ensureWalletRow(userId);
  getLearningDb().prepare(`
    UPDATE user_wallet
    SET subscription_status = ?, subscription_expires_at = ?, updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(status, expiresAtUnix, userId);
}
