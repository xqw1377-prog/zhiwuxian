/**
 * WUXIAN · 智无限双核 Token 物理账本
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getLearningDb } from '../../server/wuxian-learning-db';

export type TargetBattle = 'AP_KNOWLEDGE_FORGE' | 'TOEFL_LANGUAGE_MATRIX' | 'VIDEO_LEARN' | 'EVOLUTION_MATRIX';
export type TokenTypeUsed = 'CORE_LOGIC' | 'DEEP_REASONING';

export interface LifeMatrixLedger {
  user_id: string;
  core_logic_tokens: number;
  deep_reasoning_tokens: number;
  frozen_punish_tokens: number;
  last_breath_time: number;
}

export interface EnergyFlowRow {
  flow_id: string;
  user_id: string;
  target_battle: TargetBattle;
  token_type_used: TokenTypeUsed;
  amount_changed: number;
  action_description: string;
  timestamp: number;
}

const DEFAULT_CORE = 100_000;
const DEFAULT_DEEP = 5_000;

let schemaReady = false;

export function initializeLifeLedgerSchema(): void {
  if (schemaReady) return;
  const db = getLearningDb();
  try {
    const sqlPath = join(__dirname, '..', 'main', 'database', 'life-ledger.sql');
    db.exec(readFileSync(sqlPath, 'utf8'));
  } catch {
    db.exec(`
      CREATE TABLE IF NOT EXISTS zhi_life_matrix_ledger (
        user_id TEXT NOT NULL,
        core_logic_tokens INTEGER DEFAULT 100000,
        deep_reasoning_tokens INTEGER DEFAULT 5000,
        frozen_punish_tokens INTEGER DEFAULT 0,
        last_breath_time INTEGER NOT NULL,
        PRIMARY KEY (user_id)
      );
      CREATE TABLE IF NOT EXISTS zhi_energy_flow_history (
        flow_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        target_battle TEXT NOT NULL,
        token_type_used TEXT NOT NULL,
        amount_changed INTEGER NOT NULL,
        action_description TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_zhi_energy_flow_user ON zhi_energy_flow_history(user_id);
    `);
  }
  schemaReady = true;
}

export function ensureLifeLedger(userId: string): LifeMatrixLedger {
  initializeLifeLedgerSchema();
  const db = getLearningDb();
  const uid = userId.trim();
  let row = db
    .prepare(`SELECT * FROM zhi_life_matrix_ledger WHERE user_id = ?`)
    .get(uid) as LifeMatrixLedger | undefined;

  if (!row) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO zhi_life_matrix_ledger (user_id, core_logic_tokens, deep_reasoning_tokens, frozen_punish_tokens, last_breath_time)
      VALUES (?, ?, ?, 0, ?)
    `).run(uid, DEFAULT_CORE, DEFAULT_DEEP, now);
    row = db
      .prepare(`SELECT * FROM zhi_life_matrix_ledger WHERE user_id = ?`)
      .get(uid) as LifeMatrixLedger;
  }

  return {
    user_id: row.user_id,
    core_logic_tokens: Number(row.core_logic_tokens ?? DEFAULT_CORE),
    deep_reasoning_tokens: Number(row.deep_reasoning_tokens ?? DEFAULT_DEEP),
    frozen_punish_tokens: Number(row.frozen_punish_tokens ?? 0),
    last_breath_time: Number(row.last_breath_time ?? Date.now()),
  };
}

export function listEnergyFlowHistory(userId: string, limit = 12): EnergyFlowRow[] {
  initializeLifeLedgerSchema();
  ensureLifeLedger(userId);
  const rows = getLearningDb()
    .prepare(`
      SELECT flow_id, user_id, target_battle, token_type_used, amount_changed, action_description, timestamp
      FROM zhi_energy_flow_history
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `)
    .all(userId.trim(), Math.min(50, Math.max(1, limit))) as EnergyFlowRow[];
  return rows;
}

export function appendEnergyFlowEvent(input: {
  userId: string;
  battle: TargetBattle;
  tokenTypeUsed?: TokenTypeUsed;
  amountChanged: number;
  actionDescription: string;
}): EnergyFlowRow {
  initializeLifeLedgerSchema();
  ensureLifeLedger(input.userId);
  const flow_id = `FLOW_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const now = Date.now();
  getLearningDb()
    .prepare(
      `
    INSERT INTO zhi_energy_flow_history
      (flow_id, user_id, target_battle, token_type_used, amount_changed, action_description, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      flow_id,
      input.userId.trim(),
      input.battle,
      input.tokenTypeUsed ?? 'CORE_LOGIC',
      Math.round(input.amountChanged),
      input.actionDescription.slice(0, 200),
      now,
    );
  return {
    flow_id,
    user_id: input.userId.trim(),
    target_battle: input.battle,
    token_type_used: input.tokenTypeUsed ?? 'CORE_LOGIC',
    amount_changed: Math.round(input.amountChanged),
    action_description: input.actionDescription.slice(0, 200),
    timestamp: now,
  };
}

export function topUpLifeTokens(
  userId: string,
  coreDelta = 0,
  deepDelta = 0,
): LifeMatrixLedger {
  initializeLifeLedgerSchema();
  const ledger = ensureLifeLedger(userId);
  const db = getLearningDb();
  const core = Math.max(0, ledger.core_logic_tokens + Math.round(coreDelta));
  const deep = Math.max(0, ledger.deep_reasoning_tokens + Math.round(deepDelta));
  db.prepare(`
    UPDATE zhi_life_matrix_ledger
    SET core_logic_tokens = ?, deep_reasoning_tokens = ?, last_breath_time = ?
    WHERE user_id = ?
  `).run(core, deep, Date.now(), userId.trim());
  return ensureLifeLedger(userId);
}
