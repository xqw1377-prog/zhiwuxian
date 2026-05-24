/**
 * WUXIAN · 持久化存储层
 * 文件型 JSON 存储（零依赖，可平滑迁移至 PostgreSQL）
 *
 * 核心表：users / goal_sessions / atom_tasks / reroute_logs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import type { DreamSpace } from '../core/types';
import type { PatrolState } from '../core/night-patrol';
import type { LifeMemory } from '../core/life-behavior';
import type { PersonaId } from '../core/persona-switcher';

const DATA_DIR = join(__dirname, '..', '..', 'data');
const DB_FILE = join(DATA_DIR, 'wuxian-store.json');

export interface UserRecord {
  id: string;
  displayName?: string;
  emotionalTolerance: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoalSessionRecord {
  id: string;
  userId: string;
  goal: string;
  totalDays: number;
  isDeadlineFixed: boolean;
  driveWhy: string;
  primaryPersona: PersonaId;
  personaName: string;
  archetype: 'clearance' | 'endurance' | 'creation';
  dreamSpace: DreamSpace;
  patrol: PatrolState;
  life: LifeMemory;
  status: 'active' | 'paused' | 'completed' | 'downgraded';
  createdAt: string;
  updatedAt: string;
}

export interface AtomTaskRecord {
  id: string;
  sessionId: string;
  taskId: string;
  description: string;
  durationMinutes: number;
  scheduledDay: number;
  completed: boolean;
  source: 'deconstruct' | 'reroute' | 'patrol';
  difficultyWeight: number;
  createdAt: string;
}

export type RerouteTrigger = 'manual' | 'night_patrol' | 'task_too_hard' | 'completion';

export interface RerouteLogRecord {
  id: string;
  sessionId: string;
  trigger: RerouteTrigger;
  stage: string;
  strategy: string;
  consecutiveMissDays: number;
  slopeBefore: number;
  slopeAfter: number;
  daysBefore: number;
  daysAfter: number;
  userSignal?: string;
  message: string;
  silent: boolean;
  createdAt: string;
}

interface StoreSchema {
  users: UserRecord[];
  goalSessions: GoalSessionRecord[];
  atomTasks: AtomTaskRecord[];
  rerouteLogs: RerouteLogRecord[];
  version: number;
}

function emptyStore(): StoreSchema {
  return { users: [], goalSessions: [], atomTasks: [], rerouteLogs: [], version: 1 };
}

function loadStore(): StoreSchema {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    const store = emptyStore();
    writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8');
    return store;
  }
  try {
    return JSON.parse(readFileSync(DB_FILE, 'utf-8')) as StoreSchema;
  } catch {
    return emptyStore();
  }
}

function saveStore(store: StoreSchema): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
  renameSync(tmp, DB_FILE);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export class WuxianPersistence {
  private store: StoreSchema;

  constructor() {
    this.store = loadStore();
  }

  ensureUser(userId: string, displayName?: string): UserRecord {
    let user = this.store.users.find(u => u.id === userId);
    if (!user) {
      user = {
        id: userId,
        displayName,
        emotionalTolerance: 0.7,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.store.users.push(user);
      saveStore(this.store);
    }
    return user;
  }

  createSession(record: Omit<GoalSessionRecord, 'createdAt' | 'updatedAt' | 'status'>): GoalSessionRecord {
    const now = new Date().toISOString();
    const session: GoalSessionRecord = {
      ...record,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.store.goalSessions.push(session);
    saveStore(this.store);
    return session;
  }

  getSession(sessionId: string): GoalSessionRecord | undefined {
    return this.store.goalSessions.find(s => s.id === sessionId);
  }

  updateSession(sessionId: string, patch: Partial<GoalSessionRecord>): GoalSessionRecord | undefined {
    const idx = this.store.goalSessions.findIndex(s => s.id === sessionId);
    if (idx < 0) return undefined;
    this.store.goalSessions[idx] = {
      ...this.store.goalSessions[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    saveStore(this.store);
    return this.store.goalSessions[idx];
  }

  listSessionsByUser(userId: string): GoalSessionRecord[] {
    return this.store.goalSessions
      .filter(s => s.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  saveTasks(sessionId: string, tasks: Omit<AtomTaskRecord, 'id' | 'sessionId' | 'createdAt'>[]): AtomTaskRecord[] {
    const created: AtomTaskRecord[] = tasks.map(t => ({
      ...t,
      id: uid('task'),
      sessionId,
      createdAt: new Date().toISOString(),
    }));
    this.store.atomTasks.push(...created);
    saveStore(this.store);
    return created;
  }

  getTasksForDay(sessionId: string, day: number): AtomTaskRecord[] {
    return this.store.atomTasks.filter(t => t.sessionId === sessionId && t.scheduledDay === day);
  }

  markTaskCompleted(sessionId: string, taskId: string): void {
    const task = this.store.atomTasks.find(t => t.sessionId === sessionId && t.taskId === taskId);
    if (task) {
      task.completed = true;
      saveStore(this.store);
    }
  }

  appendRerouteLog(entry: Omit<RerouteLogRecord, 'id' | 'createdAt'>): RerouteLogRecord {
    const log: RerouteLogRecord = {
      ...entry,
      id: uid('reroute'),
      createdAt: new Date().toISOString(),
    };
    this.store.rerouteLogs.push(log);
    saveStore(this.store);
    return log;
  }

  listRerouteLogs(sessionId: string, limit = 20): RerouteLogRecord[] {
    return this.store.rerouteLogs
      .filter(l => l.sessionId === sessionId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  getStats(): { users: number; sessions: number; tasks: number; reroutes: number } {
    return {
      users: this.store.users.length,
      sessions: this.store.goalSessions.length,
      tasks: this.store.atomTasks.length,
      reroutes: this.store.rerouteLogs.length,
    };
  }
}

let globalPersistence: WuxianPersistence | null = null;

export function getPersistence(): WuxianPersistence {
  if (!globalPersistence) globalPersistence = new WuxianPersistence();
  return globalPersistence;
}
