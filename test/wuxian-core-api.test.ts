import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const TEST_DB_DIR = path.join(__dirname, '..', '.tmp', 'test-core-api');

describe('wuxian-core-api', () => {
  let db: Database.Database;

  beforeEach(() => {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    db = new Database(path.join(TEST_DB_DIR, 'wuxian_core.db'));
    db.pragma('journal_mode = WAL');
    // Create minimal schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT);
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY, title TEXT, duration_days INTEGER, remaining_days INTEGER,
        drive_force TEXT, total_energy REAL, current_slope REAL, status TEXT,
        persona_type TEXT, warp_power_consumed REAL, goal_type TEXT,
        user_id TEXT, directory_id TEXT, created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, goal_id TEXT, sequence_date TEXT, content TEXT,
        energy_cost REAL, status TEXT, fail_reason TEXT,
        created_at TEXT, updated_at TEXT, completed_at TEXT, failed_at TEXT,
        source TEXT, parent_task_id TEXT, attempt_count INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS reroute_logs (
        id TEXT PRIMARY KEY, goal_id TEXT, trigger_type TEXT,
        old_slope REAL, new_slope REAL, action_taken TEXT,
        persona_feedback TEXT, timestamp TEXT
      );
    `);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  });

  it('database can insert and query goals', () => {
    const stmt = db.prepare(
      'INSERT INTO goals (id, title, duration_days, remaining_days, status, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run('g-test-1', '学习微积分', 90, 90, 'ACTIVE', 'u-test', new Date().toISOString());

    const row = db.prepare('SELECT * FROM goals WHERE id = ?').get('g-test-1') as Record<string, unknown>;
    expect(row.title).toBe('学习微积分');
    expect(row.status).toBe('ACTIVE');
  });

  it('goals have energy model fields', () => {
    const stmt = db.prepare(
      'INSERT INTO goals (id, title, duration_days, total_energy, current_slope, status, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run('g-test-2', '托福90', 60, 6000, 100, 'ACTIVE', 'u-test', new Date().toISOString());

    const row = db.prepare('SELECT * FROM goals WHERE id = ?').get('g-test-2') as Record<string, unknown>;
    expect(row.total_energy).toBe(6000);
    expect(row.current_slope).toBe(100);
  });

  it('tasks can be linked to goals and queried by status', () => {
    const goalId = 'g-test-3';
    db.prepare('INSERT INTO goals (id, title, duration_days, status, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(goalId, '雅思7分', 45, 'ACTIVE', 'u-test', new Date().toISOString());

    const insertTask = db.prepare(
      'INSERT INTO tasks (id, goal_id, sequence_date, content, energy_cost, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insertTask.run('t-1', goalId, '2026-05-22', '背单词100个', 50, 'TODO', new Date().toISOString());
    insertTask.run('t-2', goalId, '2026-05-22', '听力练习30分钟', 30, 'DONE', new Date().toISOString());
    insertTask.run('t-3', goalId, '2026-05-23', '写作练习', 40, 'FAILED', new Date().toISOString());

    const todoCount = db.prepare('SELECT COUNT(*) as cnt FROM tasks WHERE goal_id = ? AND status = ?')
      .get(goalId, 'TODO') as { cnt: number };
    expect(todoCount.cnt).toBe(1);

    const doneCount = db.prepare('SELECT COUNT(*) as cnt FROM tasks WHERE goal_id = ? AND status = ?')
      .get(goalId, 'DONE') as { cnt: number };
    expect(doneCount.cnt).toBe(1);
  });

  it('reroute logs capture slope changes', () => {
    const goalId = 'g-test-4';
    db.prepare('INSERT INTO goals (id, title, duration_days, status, user_id, current_slope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(goalId, '考研数学', 120, 'ACTIVE', 'u-test', 100, new Date().toISOString());

    db.prepare(
      'INSERT INTO reroute_logs (id, goal_id, trigger_type, old_slope, new_slope, action_taken, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('rl-1', goalId, 'TASK_FAILED', 100, 85, '降低斜率15%', new Date().toISOString());

    const logs = db.prepare('SELECT * FROM reroute_logs WHERE goal_id = ?').all(goalId) as Record<string, unknown>[];
    expect(logs.length).toBe(1);
    expect(logs[0].new_slope).toBe(85);
    expect(logs[0].trigger_type).toBe('TASK_FAILED');
  });

  it('tasks track attempt counts', () => {
    const goalId = 'g-test-5';
    db.prepare('INSERT INTO goals (id, title, duration_days, status, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(goalId, 'GRE备考', 90, 'ACTIVE', 'u-test', new Date().toISOString());

    db.prepare(
      'INSERT INTO tasks (id, goal_id, content, status, attempt_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('t-retry', goalId, '填空练习', 'FAILED', 2, new Date().toISOString());

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('t-retry') as Record<string, unknown>;
    expect(task.attempt_count).toBe(2);
  });
});
