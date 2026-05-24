/**
 * WUXIAN · 工业级数据仓库
 * goals / tasks / reroute_logs 三表规范化存储
 * 文件实现，接口与 schema.sql 一一对应，可零改动迁移 PostgreSQL
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(__dirname, '..', '..', 'data');
const DB_FILE = join(DATA_DIR, 'industrial.db.json');

export type GoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DOWNGRADED' | 'RISK_ALERT';
export type PersonaType = 'COACH' | 'BUDDY' | 'MENTOR';
export type TaskStatus = 'TODO' | 'DONE' | 'FAILED' | 'DROPPED';
export type RerouteAction =
  | 'NO_CHANGES'
  | 'SMOOTH_SHARING'
  | 'TASK_DEGRADATION'
  | 'CRITICAL_INTERVENTION'
  | 'TIME_EXHAUSTED'
  | 'MAINTAIN';

export interface GoalRecord {
  id: string;
  userId: string;
  title: string;
  durationDays: number;
  remainingDays: number;
  driveForce: string;
  totalEnergy: number;
  currentSlope: number;
  status: GoalStatus;
  personaType: PersonaType;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  goalId: string;
  sequenceDate: string;
  content: string;
  energyCost: number;
  status: TaskStatus;
  failReason?: string;
  updatedAt: string;
}

export interface IndustrialRerouteLog {
  id: string;
  goalId: string;
  triggerType: string;
  oldSlope: number;
  newSlope: number;
  actionTaken: RerouteAction;
  personaFeedback: string;
  createdAt: string;
}

interface IndustrialSchema {
  goals: GoalRecord[];
  tasks: TaskRecord[];
  rerouteLogs: IndustrialRerouteLog[];
  version: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): IndustrialSchema {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    const s: IndustrialSchema = { goals: [], tasks: [], rerouteLogs: [], version: 2 };
    writeFileSync(DB_FILE, JSON.stringify(s, null, 2));
    return s;
  }
  try {
    return JSON.parse(readFileSync(DB_FILE, 'utf-8')) as IndustrialSchema;
  } catch {
    return { goals: [], tasks: [], rerouteLogs: [], version: 2 };
  }
}

function save(store: IndustrialSchema): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(store, null, 2));
  renameSync(tmp, DB_FILE);
}

export class IndustrialStore {
  private store: IndustrialSchema;

  constructor() {
    this.store = load();
  }

  // ── goals ──

  createGoal(g: Omit<GoalRecord, 'createdAt' | 'updatedAt'>): GoalRecord {
    const now = new Date().toISOString();
    const goal: GoalRecord = { ...g, createdAt: now, updatedAt: now };
    this.store.goals.push(goal);
    save(this.store);
    return goal;
  }

  findGoalById(id: string): GoalRecord | undefined {
    return this.store.goals.find(g => g.id === id);
  }

  updateGoal(id: string, patch: Partial<GoalRecord>): GoalRecord | undefined {
    const idx = this.store.goals.findIndex(g => g.id === id);
    if (idx < 0) return undefined;
    this.store.goals[idx] = { ...this.store.goals[idx], ...patch, updatedAt: new Date().toISOString() };
    save(this.store);
    return this.store.goals[idx];
  }

  updateSlope(id: string, slope: number): GoalRecord | undefined {
    return this.updateGoal(id, { currentSlope: slope });
  }

  getSlope(id: string): number {
    return this.findGoalById(id)?.currentSlope ?? 0;
  }

  listActiveGoals(): GoalRecord[] {
    return this.store.goals.filter(g => g.status === 'ACTIVE' || g.status === 'RISK_ALERT');
  }

  // ── tasks ──

  createTask(t: Omit<TaskRecord, 'id' | 'updatedAt'>): TaskRecord {
    const task: TaskRecord = { ...t, id: uid('task'), updatedAt: new Date().toISOString() };
    this.store.tasks.push(task);
    save(this.store);
    return task;
  }

  createTasks(tasks: Omit<TaskRecord, 'id' | 'updatedAt'>[]): TaskRecord[] {
    return tasks.map(t => this.createTask(t));
  }

  findTasks(query: {
    goalId: string;
    status?: TaskStatus | TaskStatus[];
    beforeDate?: string;
    onDate?: string;
  }): TaskRecord[] {
    return this.store.tasks.filter(t => {
      if (t.goalId !== query.goalId) return false;
      if (query.onDate && t.sequenceDate !== query.onDate) return false;
      if (query.beforeDate && t.sequenceDate >= query.beforeDate) return false;
      if (query.status) {
        const statuses = Array.isArray(query.status) ? query.status : [query.status];
        if (!statuses.includes(t.status)) return false;
      }
      return true;
    });
  }

  markTask(id: string, status: TaskStatus, failReason?: string): TaskRecord | undefined {
    const task = this.store.tasks.find(t => t.id === id);
    if (!task) return undefined;
    task.status = status;
    task.failReason = failReason;
    task.updatedAt = new Date().toISOString();
    save(this.store);
    return task;
  }

  markTasksByGoalDate(goalId: string, date: string, status: TaskStatus, failReason?: string): void {
    this.store.tasks
      .filter(t => t.goalId === goalId && t.sequenceDate === date && t.status === 'TODO')
      .forEach(t => {
        t.status = status;
        t.failReason = failReason;
        t.updatedAt = new Date().toISOString();
      });
    save(this.store);
  }

  getTomorrowTasks(goalId: string, currentDate: string): TaskRecord[] {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    const tomorrow = d.toISOString().slice(0, 10);
    return this.findTasks({ goalId, onDate: tomorrow, status: 'TODO' });
  }

  getTodayTasks(goalId: string, currentDate?: string): TaskRecord[] {
    return this.findTasks({ goalId, onDate: currentDate ?? todayISO(), status: ['TODO', 'DONE', 'FAILED'] });
  }

  // ── reroute_logs ──

  createRerouteLog(entry: Omit<IndustrialRerouteLog, 'id' | 'createdAt'>): IndustrialRerouteLog {
    const log: IndustrialRerouteLog = { ...entry, id: uid('rlog'), createdAt: new Date().toISOString() };
    this.store.rerouteLogs.push(log);
    save(this.store);
    return log;
  }

  listRerouteLogs(goalId: string, limit = 30): IndustrialRerouteLog[] {
    return this.store.rerouteLogs
      .filter(l => l.goalId === goalId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  getCompletionRate(goalId: string, windowDays = 14): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const recent = this.store.tasks.filter(
      t => t.goalId === goalId && t.sequenceDate >= cutoffStr && (t.status === 'DONE' || t.status === 'FAILED'),
    );
    if (recent.length === 0) return 1;
    return recent.filter(t => t.status === 'DONE').length / recent.length;
  }
}

let globalIndustrial: IndustrialStore | null = null;

export function getIndustrialStore(): IndustrialStore | import('./sqlite-industrial').SqliteIndustrialStore {
  if (!globalIndustrial) {
    try {
      const { getSqliteIndustrialStore } = require('./sqlite-industrial') as typeof import('./sqlite-industrial');
      globalIndustrial = getSqliteIndustrialStore() as unknown as IndustrialStore;
      console.log('[WUXIAN] Storage: SQLite (data/wuxian.db)');
    } catch (e) {
      globalIndustrial = new IndustrialStore();
      console.log('[WUXIAN] Storage: JSON fallback (data/industrial.db.json)');
    }
  }
  return globalIndustrial;
}

export function calculateContinuousFails(failedTasks: TaskRecord[], upToDate?: string): number {
  const failDates = new Set(
    failedTasks.filter(t => t.status === 'FAILED').map(t => t.sequenceDate),
  );
  if (failDates.size === 0) return 0;

  let streak = 0;
  const cursor = new Date(upToDate ?? dateToISO());
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < 30; i++) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (failDates.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (streak > 0) {
      break;
    } else {
      cursor.setDate(cursor.getDate() - 1);
    }
  }
  return streak;
}

export function dateToISO(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function nextDateISO(current: string): string {
  const d = new Date(current);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
