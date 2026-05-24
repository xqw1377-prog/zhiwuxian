/**
 * WUXIAN · SQLite 工业级存储
 * goals / tasks / reroute_logs 三表 · 与 schema.sql 对齐
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  GoalRecord,
  GoalStatus,
  IndustrialRerouteLog,
  PersonaType,
  RerouteAction,
  TaskRecord,
  TaskStatus,
} from './industrial-store';

const DATA_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DATA_DIR, 'wuxian.db');

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      remaining_days INTEGER NOT NULL,
      drive_force TEXT NOT NULL DEFAULT '',
      total_energy REAL NOT NULL,
      current_slope REAL NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      persona_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES goals(id),
      sequence_date TEXT NOT NULL,
      content TEXT NOT NULL,
      energy_cost REAL NOT NULL,
      status TEXT DEFAULT 'TODO',
      fail_reason TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reroute_logs (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES goals(id),
      trigger_type TEXT NOT NULL,
      old_slope REAL NOT NULL,
      new_slope REAL NOT NULL,
      action_taken TEXT NOT NULL,
      persona_feedback TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_goal_date ON tasks(goal_id, sequence_date);
    CREATE INDEX IF NOT EXISTS idx_reroute_goal ON reroute_logs(goal_id, created_at);
  `);
}

export class SqliteIndustrialStore {
  private db: Database.Database;

  constructor() {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    initSchema(this.db);
    this.migrateFromJsonIfEmpty();
  }

  private migrateFromJsonIfEmpty(): void {
    const count = this.db.prepare('SELECT COUNT(*) as c FROM goals').get() as { c: number };
    if (count.c > 0) return;

    const jsonPath = join(DATA_DIR, 'industrial.db.json');
    if (!existsSync(jsonPath)) return;

    try {
      const raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) as {
        goals: GoalRecord[];
        tasks: TaskRecord[];
        rerouteLogs: IndustrialRerouteLog[];
      };
      const insertGoal = this.db.prepare(`
        INSERT OR IGNORE INTO goals (id,user_id,title,duration_days,remaining_days,drive_force,total_energy,current_slope,status,persona_type,created_at,updated_at)
        VALUES (@id,@userId,@title,@durationDays,@remainingDays,@driveForce,@totalEnergy,@currentSlope,@status,@personaType,@createdAt,@updatedAt)
      `);
      const insertTask = this.db.prepare(`
        INSERT OR IGNORE INTO tasks (id,goal_id,sequence_date,content,energy_cost,status,fail_reason,updated_at)
        VALUES (@id,@goalId,@sequenceDate,@content,@energyCost,@status,@failReason,@updatedAt)
      `);
      const insertLog = this.db.prepare(`
        INSERT OR IGNORE INTO reroute_logs (id,goal_id,trigger_type,old_slope,new_slope,action_taken,persona_feedback,created_at)
        VALUES (@id,@goalId,@triggerType,@oldSlope,@newSlope,@actionTaken,@personaFeedback,@createdAt)
      `);

      const tx = this.db.transaction(() => {
        for (const g of raw.goals ?? []) insertGoal.run(g);
        for (const t of raw.tasks ?? []) insertTask.run({
          id: t.id, goalId: t.goalId, sequenceDate: t.sequenceDate,
          content: t.content, energyCost: t.energyCost, status: t.status,
          failReason: t.failReason ?? null, updatedAt: t.updatedAt,
        });
        for (const l of raw.rerouteLogs ?? []) insertLog.run({
          id: l.id, goalId: l.goalId, triggerType: l.triggerType,
          oldSlope: l.oldSlope, newSlope: l.newSlope, actionTaken: l.actionTaken,
          personaFeedback: l.personaFeedback, createdAt: l.createdAt,
        });
      });
      tx();
      console.log('[WUXIAN SQLite] Migrated JSON → wuxian.db');
    } catch (e) {
      console.warn('[WUXIAN SQLite] JSON migration skipped:', e);
    }
  }

  createGoal(g: Omit<GoalRecord, 'createdAt' | 'updatedAt'>): GoalRecord {
    const now = new Date().toISOString();
    const goal: GoalRecord = { ...g, createdAt: now, updatedAt: now };
    this.db.prepare(`
      INSERT INTO goals (id,user_id,title,duration_days,remaining_days,drive_force,total_energy,current_slope,status,persona_type,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(goal.id, goal.userId, goal.title, goal.durationDays, goal.remainingDays,
      goal.driveForce, goal.totalEnergy, goal.currentSlope, goal.status, goal.personaType, now, now);
    return goal;
  }

  findGoalById(id: string): GoalRecord | undefined {
    const row = this.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToGoal(row) : undefined;
  }

  updateGoal(id: string, patch: Partial<GoalRecord>): GoalRecord | undefined {
    const existing = this.findGoalById(id);
    if (!existing) return undefined;
    const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.db.prepare(`
      UPDATE goals SET title=?, remaining_days=?, drive_force=?, total_energy=?, current_slope=?, status=?, persona_type=?, updated_at=?
      WHERE id=?
    `).run(merged.title, merged.remainingDays, merged.driveForce, merged.totalEnergy,
      merged.currentSlope, merged.status, merged.personaType, merged.updatedAt, id);
    return merged;
  }

  updateSlope(id: string, slope: number): GoalRecord | undefined {
    return this.updateGoal(id, { currentSlope: slope });
  }

  getSlope(id: string): number {
    return this.findGoalById(id)?.currentSlope ?? 0;
  }

  listActiveGoals(): GoalRecord[] {
    const rows = this.db.prepare(`SELECT * FROM goals WHERE status IN ('ACTIVE','RISK_ALERT')`).all() as Record<string, unknown>[];
    return rows.map(r => this.rowToGoal(r));
  }

  createTask(t: Omit<TaskRecord, 'id' | 'updatedAt'>): TaskRecord {
    const task: TaskRecord = { ...t, id: uid('task'), updatedAt: new Date().toISOString() };
    this.db.prepare(`
      INSERT INTO tasks (id,goal_id,sequence_date,content,energy_cost,status,fail_reason,updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(task.id, task.goalId, task.sequenceDate, task.content, task.energyCost, task.status, task.failReason ?? null, task.updatedAt);
    return task;
  }

  createTasks(tasks: Omit<TaskRecord, 'id' | 'updatedAt'>[]): TaskRecord[] {
    return tasks.map(t => this.createTask(t));
  }

  findTasks(query: { goalId: string; status?: TaskStatus | TaskStatus[]; beforeDate?: string; onDate?: string }): TaskRecord[] {
    let sql = 'SELECT * FROM tasks WHERE goal_id = ?';
    const params: unknown[] = [query.goalId];
    if (query.onDate) { sql += ' AND sequence_date = ?'; params.push(query.onDate); }
    if (query.beforeDate) { sql += ' AND sequence_date < ?'; params.push(query.beforeDate); }
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(r => this.rowToTask(r));
  }

  markTasksByGoalDate(goalId: string, date: string, status: TaskStatus, failReason?: string): void {
    this.db.prepare(`
      UPDATE tasks SET status=?, fail_reason=?, updated_at=? WHERE goal_id=? AND sequence_date=? AND status='TODO'
    `).run(status, failReason ?? null, new Date().toISOString(), goalId, date);
  }

  getTomorrowTasks(goalId: string, _currentDate: string): TaskRecord[] {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return this.findTasks({ goalId, onDate: d.toISOString().slice(0, 10), status: 'TODO' });
  }

  getTodayTasks(goalId: string, currentDate?: string): TaskRecord[] {
    return this.findTasks({ goalId, onDate: currentDate ?? todayISO(), status: ['TODO', 'DONE', 'FAILED'] });
  }

  createRerouteLog(entry: Omit<IndustrialRerouteLog, 'id' | 'createdAt'>): IndustrialRerouteLog {
    const log: IndustrialRerouteLog = { ...entry, id: uid('rlog'), createdAt: new Date().toISOString() };
    this.db.prepare(`
      INSERT INTO reroute_logs (id,goal_id,trigger_type,old_slope,new_slope,action_taken,persona_feedback,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(log.id, log.goalId, log.triggerType, log.oldSlope, log.newSlope, log.actionTaken, log.personaFeedback, log.createdAt);
    return log;
  }

  listRerouteLogs(goalId: string, limit = 30): IndustrialRerouteLog[] {
    const rows = this.db.prepare(
      'SELECT * FROM reroute_logs WHERE goal_id = ? ORDER BY created_at DESC LIMIT ?',
    ).all(goalId, limit) as Record<string, unknown>[];
    return rows.map(r => this.rowToLog(r));
  }

  getCompletionRate(goalId: string, windowDays = 14): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const rows = this.db.prepare(`
      SELECT status FROM tasks WHERE goal_id=? AND sequence_date>=? AND status IN ('DONE','FAILED')
    `).all(goalId, cutoffStr) as { status: string }[];
    if (rows.length === 0) return 1;
    return rows.filter(r => r.status === 'DONE').length / rows.length;
  }

  getStorageType(): 'sqlite' {
    return 'sqlite';
  }

  private rowToGoal(row: Record<string, unknown>): GoalRecord {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      title: row.title as string,
      durationDays: row.duration_days as number,
      remainingDays: row.remaining_days as number,
      driveForce: row.drive_force as string,
      totalEnergy: row.total_energy as number,
      currentSlope: row.current_slope as number,
      status: row.status as GoalStatus,
      personaType: row.persona_type as PersonaType,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private rowToTask(row: Record<string, unknown>): TaskRecord {
    return {
      id: row.id as string,
      goalId: row.goal_id as string,
      sequenceDate: row.sequence_date as string,
      content: row.content as string,
      energyCost: row.energy_cost as number,
      status: row.status as TaskStatus,
      failReason: row.fail_reason as string | undefined,
      updatedAt: row.updated_at as string,
    };
  }

  private rowToLog(row: Record<string, unknown>): IndustrialRerouteLog {
    return {
      id: row.id as string,
      goalId: row.goal_id as string,
      triggerType: row.trigger_type as string,
      oldSlope: row.old_slope as number,
      newSlope: row.new_slope as number,
      actionTaken: row.action_taken as RerouteAction,
      personaFeedback: row.persona_feedback as string,
      createdAt: row.created_at as string,
    };
  }
}

let globalSqlite: SqliteIndustrialStore | null = null;

export function getSqliteIndustrialStore(): SqliteIndustrialStore {
  if (!globalSqlite) globalSqlite = new SqliteIndustrialStore();
  return globalSqlite;
}
