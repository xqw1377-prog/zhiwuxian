/** WUXIAN · LLM 成本日志持久化 Schema */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.WUXIAN_DATA_DIR || './data';

function getDb(): Database.Database {
  const p = path.join(DATA_DIR, 'llm_cost.db');
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cost_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      warp_cost REAL DEFAULT 0,
      feature TEXT DEFAULT '',
      error TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cost_log_user ON cost_log(user_id, created_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cost_log_created ON cost_log(created_at)
  `);
  return db;
}

export interface CostLogEntry {
  traceId: string;
  userId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  warpCost: number;
  feature?: string;
  error?: string;
}

export function insertCostLog(entry: CostLogEntry): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO cost_log (trace_id, user_id, provider, model, input_tokens, output_tokens, duration_ms, warp_cost, feature, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.traceId, entry.userId || '', entry.provider, entry.model,
      entry.inputTokens, entry.outputTokens, entry.durationMs,
      entry.warpCost, entry.feature || '', entry.error || '',
    );
  } catch (e) {
    console.warn('[CostLog] 写入失败:', e);
  }
}

export function queryCostLog(options: {
  userId?: string;
  provider?: string;
  model?: string;
  days?: number;
  limit?: number;
  offset?: number;
}): { rows: Record<string, unknown>[]; total: number } {
  const db = getDb();
  const { userId, provider, model, days = 7, limit = 100, offset = 0 } = options;
  const wheres: string[] = ['created_at > datetime(\'now\', ?)'];
  const params: unknown[] = [`-${days} days`];
  if (userId) { wheres.push('user_id = ?'); params.push(userId); }
  if (provider) { wheres.push('provider = ?'); params.push(provider); }
  if (model) { wheres.push('model = ?'); params.push(model); }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as count FROM cost_log ${where}`).get(...params) as { count: number }).count;
  const rows = db
    .prepare(`SELECT * FROM cost_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Record<string, unknown>[];
  return { rows, total };
}

export function queryCostAggregation(days: number = 30): Record<string, unknown>[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      date(created_at) as day,
      provider,
      model,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(warp_cost) as total_warp_cost,
      COUNT(*) as request_count
    FROM cost_log
    WHERE created_at > datetime('now', ?)
    GROUP BY date(created_at), provider, model
    ORDER BY day DESC
  `).all(`-${days} days`) as Record<string, unknown>[];
}

export function queryUserCostSummary(days: number = 30): Record<string, unknown>[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      user_id,
      SUM(input_tokens + output_tokens) as total_tokens,
      SUM(warp_cost) as total_warp_cost,
      COUNT(*) as request_count
    FROM cost_log
    WHERE created_at > datetime('now', ?) AND user_id != ''
    GROUP BY user_id
    ORDER BY total_warp_cost DESC
    LIMIT 50
  `).all(`-${days} days`) as Record<string, unknown>[];
}

export function queryUserWarpSpend(userId: string, days: number = 7): {
  totalWarpCost: number;
  requestCount: number;
  totalTokens: number;
} {
  const db = getDb();
  const uid = userId.trim();
  if (!uid) return { totalWarpCost: 0, requestCount: 0, totalTokens: 0 };
  const d = Math.min(365, Math.max(1, Math.floor(days)));
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(warp_cost), 0) as total_warp_cost,
      COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
      COUNT(*) as request_count
    FROM cost_log
    WHERE user_id = ? AND created_at > datetime('now', ?)
  `).get(uid, `-${d} days`) as { total_warp_cost: number; total_tokens: number; request_count: number } | undefined;
  return {
    totalWarpCost: Number(row?.total_warp_cost ?? 0),
    requestCount: Number(row?.request_count ?? 0),
    totalTokens: Number(row?.total_tokens ?? 0),
  };
}
