/**
 * WUXIAN · 核心持久化层
 * wuxian_core.db — 生命体记忆永不失忆
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getDataDir, getCoreDbPath } from './data-path';
import { ensureCompanionSchema } from './companion/companion-schema';

const DATA_DIR = getDataDir();
const DB_PATH = getCoreDbPath();

let dbInstance: Database.Database | null = null;

export function getCoreDb(): Database.Database {
  if (!dbInstance) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    initSchema(dbInstance);
    ensureCompanionSchema(dbInstance);
    console.log(`[WUXIAN Core] SQLite → ${DB_PATH}`);
  }
  return dbInstance;
}

const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_add_warp_power',
    sql: `ALTER TABLE goals ADD COLUMN warp_power_consumed REAL DEFAULT 0`,
  },
  {
    id: '002_add_goal_columns',
    sql: `ALTER TABLE goals ADD COLUMN goal_type TEXT DEFAULT 'GENERIC'`,
  },
  {
    id: '003_add_user_id',
    sql: `ALTER TABLE goals ADD COLUMN user_id TEXT DEFAULT ''`,
  },
  {
    id: '004_add_goal_directory_id',
    sql: `ALTER TABLE goals ADD COLUMN directory_id TEXT DEFAULT ''`,
  },
  {
    id: '005_add_task_timestamps',
    sql: [
      `ALTER TABLE tasks ADD COLUMN created_at TEXT`,
      `ALTER TABLE tasks ADD COLUMN updated_at TEXT`,
      `ALTER TABLE tasks ADD COLUMN completed_at TEXT`,
      `ALTER TABLE tasks ADD COLUMN failed_at TEXT`,
      `ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'manual'`,
      `ALTER TABLE tasks ADD COLUMN parent_task_id TEXT`,
      `ALTER TABLE tasks ADD COLUMN attempt_count INTEGER DEFAULT 1`,
    ].join(';'),
  },
  {
    id: '006_goal_pathway_track',
    sql: [
      `ALTER TABLE goals ADD COLUMN track_type TEXT DEFAULT ''`,
      `ALTER TABLE goals ADD COLUMN target_school TEXT DEFAULT ''`,
    ].join(';'),
  },
];

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      remaining_days INTEGER NOT NULL,
      drive_force TEXT NOT NULL,
      total_energy REAL NOT NULL,
      current_slope REAL NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      persona_type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      goal_id TEXT,
      sequence_date TEXT NOT NULL,
      content TEXT NOT NULL,
      energy_cost REAL NOT NULL,
      status TEXT DEFAULT 'TODO',
      fail_reason TEXT,
      FOREIGN KEY(goal_id) REFERENCES goals(id)
    );

    CREATE TABLE IF NOT EXISTS reroute_logs (
      id TEXT PRIMARY KEY,
      goal_id TEXT,
      trigger_type TEXT NOT NULL,
      old_slope REAL NOT NULL,
      new_slope REAL NOT NULL,
      action_taken TEXT NOT NULL,
      persona_feedback TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_goal_date ON tasks(goal_id, sequence_date);
    CREATE INDEX IF NOT EXISTS idx_reroute_goal ON reroute_logs(goal_id);
  `);
  runPendingMigrations(db);
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function runPendingMigrations(db: Database.Database): void {
  const applied = new Set(
    db.prepare(`SELECT version FROM schema_migrations`).all()
      .map((r: unknown) => (r as { version: string }).version),
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    try {
      if (m.id === '001_add_warp_power' && columnExists(db, 'goals', 'warp_power_consumed')) {
        db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run(m.id);
        continue;
      }
      if (m.id === '005_add_task_timestamps' && columnExists(db, 'tasks', 'created_at')) {
        db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run(m.id);
        continue;
      }
      if (m.id === '006_goal_pathway_track' && columnExists(db, 'goals', 'track_type')) {
        db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run(m.id);
        continue;
      }
      db.exec(m.sql);
      db.prepare(`INSERT INTO schema_migrations (version) VALUES (?)`).run(m.id);
      console.log(`  [DB Migration] ${m.id} applied`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate column name|non-constant default/i.test(msg)) {
        db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run(m.id);
        console.warn(`  [DB Migration] ${m.id} skipped (${msg})`);
        continue;
      }
      throw err;
    }
  }
}

export function uid(): string {
  return crypto.randomUUID();
}

export function todayStr(): string {
  return localDateStr(0);
}

export function tomorrowStr(): string {
  return localDateStr(1);
}

/** 中国时区日历日，避免 UTC 跨日导致「今日任务」错位 */
function localDateStr(dayOffset: number): string {
  const d = new Date();
  if (dayOffset) d.setDate(d.getDate() + dayOffset);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export interface GoalRow {
  id: string;
  title: string;
  duration_days: number;
  remaining_days: number;
  drive_force: string;
  total_energy: number;
  current_slope: number;
  status: string;
  persona_type: string;
  goal_type?: string;
  user_id?: string;
  warp_power_consumed?: number;
}

export interface TaskRow {
  id: string;
  goal_id: string;
  sequence_date: string;
  content: string;
  energy_cost: number;
  status: string;
  fail_reason: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  failed_at?: string;
  source?: string;
  parent_task_id?: string;
  attempt_count?: number;
}
