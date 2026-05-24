import { getLearningDb } from '../../server/wuxian-learning-db';

export interface GoalReversingMatrixRow {
  user_id: string;
  target_destination: string | null;
  current_baseline_score: number | null;
  target_deadline_timestamp: number | null;
  total_cognitive_units: number;
  completed_cognitive_units: number;
  updated_at: number;
}

function hasColumn(db: ReturnType<typeof getLearningDb>, table: string, col: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === col);
}

export function initializeReversingMatrixSystem(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_reversing_matrix (
      user_id TEXT PRIMARY KEY,
      target_destination TEXT,
      current_baseline_score REAL,
      target_deadline_timestamp INTEGER,
      total_cognitive_units INTEGER DEFAULT 100,
      completed_cognitive_units INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_goal_reversing_deadline ON goal_reversing_matrix(target_deadline_timestamp);
  `);

  if (!hasColumn(db, 'goal_reversing_matrix', 'time_slope_weight')) {
    db.exec(`ALTER TABLE goal_reversing_matrix ADD COLUMN time_slope_weight REAL DEFAULT 1`);
  }
  if (!hasColumn(db, 'goal_reversing_matrix', 'gravity_relay_stars')) {
    db.exec(`ALTER TABLE goal_reversing_matrix ADD COLUMN gravity_relay_stars INTEGER DEFAULT 0`);
  }
  if (!hasColumn(db, 'goal_reversing_matrix', 'difficulty_index')) {
    db.exec(`ALTER TABLE goal_reversing_matrix ADD COLUMN difficulty_index INTEGER DEFAULT 0`);
  }
}

export function upsertReversingMatrix(input: {
  userId: string;
  targetDestination: string;
  baselineScore?: number;
  deadlineTimestamp: number;
  totalUnits: number;
  completedUnits: number;
}): void {
  initializeReversingMatrixSystem();
  const db = getLearningDb();
  const baseline = Number.isFinite(input.baselineScore) ? input.baselineScore! : 50;
  db.prepare(`
    INSERT INTO goal_reversing_matrix
      (user_id, target_destination, current_baseline_score, target_deadline_timestamp, total_cognitive_units, completed_cognitive_units, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(user_id) DO UPDATE SET
      target_destination = excluded.target_destination,
      current_baseline_score = excluded.current_baseline_score,
      target_deadline_timestamp = excluded.target_deadline_timestamp,
      total_cognitive_units = excluded.total_cognitive_units,
      completed_cognitive_units = excluded.completed_cognitive_units,
      updated_at = excluded.updated_at
  `).run(
    input.userId,
    input.targetDestination,
    baseline,
    input.deadlineTimestamp,
    input.totalUnits,
    input.completedUnits,
  );
}

export function getReversingMatrixRow(userId: string): GoalReversingMatrixRow | null {
  initializeReversingMatrixSystem();
  const db = getLearningDb();
  const row = db.prepare(`SELECT * FROM goal_reversing_matrix WHERE user_id = ?`).get(userId) as GoalReversingMatrixRow | undefined;
  return row ?? null;
}

export function bumpReversingMatrixProgress(userId: string, delta = 1): void {
  initializeReversingMatrixSystem();
  const db = getLearningDb();
  const row = getReversingMatrixRow(userId);
  if (!row) {
    const now = Math.floor(Date.now() / 1000);
    upsertReversingMatrix({
      userId,
      targetDestination: '探索中航道',
      deadlineTimestamp: now + 99 * 24 * 60 * 60,
      totalUnits: 100,
      completedUnits: Math.max(1, delta),
    });
    return;
  }
  const total = Math.max(1, Number(row.total_cognitive_units ?? 100));
  const completed = Math.max(0, Number(row.completed_cognitive_units ?? 0));
  const next = Math.min(total, completed + Math.max(1, delta));
  db.prepare(`
    UPDATE goal_reversing_matrix
    SET completed_cognitive_units = ?, updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(next, userId);
}

export function advanceReversingUnits(userId: string, delta = 1) {
  bumpReversingMatrixProgress(userId, delta);
  return getReversingMetrics(userId);
}

export function ensureMatrixForGoal(userId: string, goalTitle: string, days: number): void {
  const existing = getReversingMatrixRow(userId);
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + Math.max(1, days) * 24 * 60 * 60;
  if (!existing?.target_destination) {
    upsertReversingMatrix({
      userId,
      targetDestination: goalTitle,
      deadlineTimestamp: deadline,
      totalUnits: 100,
      completedUnits: 1,
      baselineScore: 50,
    });
    return;
  }
  dbTouchDestination(userId, goalTitle, deadline);
}

function dbTouchDestination(userId: string, goalTitle: string, deadline: number): void {
  const db = getLearningDb();
  db.prepare(`
    UPDATE goal_reversing_matrix
    SET target_destination = ?, target_deadline_timestamp = ?, updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `).run(goalTitle, deadline, userId);
}

export function getReversingMetrics(userId: string): null | {
  targetDestination: string;
  daysLeft: number;
  progressPercentage: number;
  completedUnits: number;
  totalUnits: number;
  baselineScore: number;
  deadlineTimestamp: number;
  updatedAt: number;
  timeSlopeWeight: number;
  gravityRelayStars: number;
} {
  const row = getReversingMatrixRow(userId);
  if (!row || !row.target_deadline_timestamp || !row.target_destination) return null;

  const now = Math.floor(Date.now() / 1000);
  const timeLeftSeconds = row.target_deadline_timestamp - now;
  const daysLeft = Math.max(0, Math.ceil(timeLeftSeconds / (24 * 60 * 60)));

  const total = Math.max(1, Number(row.total_cognitive_units ?? 100));
  const completed = Math.max(0, Math.min(total, Number(row.completed_cognitive_units ?? 0)));
  const progressPercentage = Math.min(100, Math.round((completed / total) * 100));

  return {
    targetDestination: row.target_destination,
    daysLeft,
    progressPercentage,
    completedUnits: completed,
    totalUnits: total,
    baselineScore: Number(row.current_baseline_score ?? 50),
    deadlineTimestamp: Number(row.target_deadline_timestamp),
    updatedAt: Number(row.updated_at ?? 0),
    timeSlopeWeight: Number((row as { time_slope_weight?: number }).time_slope_weight ?? 1),
    gravityRelayStars: Number((row as { gravity_relay_stars?: number }).gravity_relay_stars ?? 0),
  };
}
