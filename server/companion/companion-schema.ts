/** WUXIAN · 亲密陪伴账本 Schema 迁移 */

import type Database from 'better-sqlite3';

export function ensureCompanionSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_companion_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      report_date TEXT NOT NULL,
      knowledge_json TEXT DEFAULT '[]',
      slope_change REAL DEFAULT 0,
      school_distance REAL DEFAULT 0,
      zhi_comment TEXT DEFAULT '',
      effective_minutes INTEGER DEFAULT 0,
      escape_count INTEGER DEFAULT 0,
      reading_sessions INTEGER DEFAULT 0,
      listening_sessions INTEGER DEFAULT 0,
      speaking_sessions INTEGER DEFAULT 0,
      writing_sessions INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_companion_student_date
      ON student_companion_reports(student_id, report_date);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_companion_student_report_day
      ON student_companion_reports(student_id, report_date);

    CREATE INDEX IF NOT EXISTS idx_companion_goal
      ON student_companion_reports(goal_id);

    CREATE TABLE IF NOT EXISTS parent_cheer_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      parent_type TEXT NOT NULL DEFAULT 'WECHAT',
      message TEXT NOT NULL,
      fuel_bonus INTEGER NOT NULL DEFAULT 5,
      cheer_style TEXT NOT NULL DEFAULT 'FIRE',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cheer_student
      ON parent_cheer_log(student_id, created_at);

    CREATE TABLE IF NOT EXISTS weekly_recap (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      total_effective_minutes INTEGER DEFAULT 0,
      avg_slope_change REAL DEFAULT 0,
      school_distance_start REAL DEFAULT 0,
      school_distance_end REAL DEFAULT 0,
      reroute_count INTEGER DEFAULT 0,
      escape_count INTEGER DEFAULT 0,
      parent_cheer_count INTEGER DEFAULT 0,
      fuel_received INTEGER DEFAULT 0,
      top_knowledge TEXT DEFAULT '[]',
      zhi_weekly_review TEXT DEFAULT '',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_recap_student
      ON weekly_recap(student_id, week_start);

    CREATE TABLE IF NOT EXISTS student_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id TEXT NOT NULL,
      student_id TEXT NOT NULL DEFAULT '',
      sender TEXT NOT NULL DEFAULT 'PARENT',
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_student_messages_goal
      ON student_messages(goal_id, created_at);
  `);
}
