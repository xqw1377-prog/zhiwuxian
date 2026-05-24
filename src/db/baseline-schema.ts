import { getLearningDb } from '../../server/wuxian-learning-db';

export type BaselineStatusRow = {
  user_id: string;
  current_scores_json: string | null;
  weak_subjects_json: string | null;
  estimated_hours_per_day: number | null;
  updated_at: number;
};

export function initializeBaselineSchema(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_baseline_status (
      user_id TEXT PRIMARY KEY,
      current_scores_json TEXT,
      weak_subjects_json TEXT,
      estimated_hours_per_day REAL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_baseline_updated ON user_baseline_status(updated_at);
  `);
}

export function upsertBaselineStatus(input: {
  userId: string;
  currentScores: Record<string, string>;
  weakSubjects: string[];
  estimatedHoursPerDay?: number | null;
}): void {
  initializeBaselineSchema();
  const db = getLearningDb();
  const hours = input.estimatedHoursPerDay;
  db.prepare(`
    INSERT INTO user_baseline_status
      (user_id, current_scores_json, weak_subjects_json, estimated_hours_per_day, updated_at)
    VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(user_id) DO UPDATE SET
      current_scores_json = excluded.current_scores_json,
      weak_subjects_json = excluded.weak_subjects_json,
      estimated_hours_per_day = excluded.estimated_hours_per_day,
      updated_at = excluded.updated_at
  `).run(
    input.userId,
    JSON.stringify(input.currentScores ?? {}),
    JSON.stringify(input.weakSubjects ?? []),
    Number.isFinite(Number(hours)) ? Number(hours) : null,
  );
}

export function getBaselineStatus(userId: string): BaselineStatusRow | null {
  initializeBaselineSchema();
  const row = getLearningDb().prepare(`SELECT * FROM user_baseline_status WHERE user_id = ?`).get(userId) as
    | BaselineStatusRow
    | undefined;
  return row ?? null;
}

export function parseBaseline(row: BaselineStatusRow): {
  currentScores: Record<string, string>;
  weakSubjects: string[];
  estimatedHoursPerDay: number | null;
} {
  const scores = (() => {
    try {
      const v = JSON.parse(row.current_scores_json ?? '{}') as unknown;
      if (!v || typeof v !== 'object') return {};
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[String(k)] = String(val ?? '');
      }
      return out;
    } catch {
      return {};
    }
  })();

  const weak = (() => {
    try {
      const v = JSON.parse(row.weak_subjects_json ?? '[]') as unknown;
      if (!Array.isArray(v)) return [];
      return v.map((x) => String(x ?? '')).filter(Boolean).slice(0, 32);
    } catch {
      return [];
    }
  })();

  return {
    currentScores: scores,
    weakSubjects: weak,
    estimatedHoursPerDay: row.estimated_hours_per_day === null || row.estimated_hours_per_day === undefined
      ? null
      : Number(row.estimated_hours_per_day),
  };
}

