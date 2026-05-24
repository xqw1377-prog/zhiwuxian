/**
 * WUXIAN · 学习图谱持久化层
 * wuxian_learning.db — 知识节点指针 + 认知遥测 + 用户水位
 * 迁移系统：schema_migrations 版本表（与 wuxian_core.db 一致）
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { KnowledgeCell } from '../engine/core/video-assimilation-brain';
import { getDataDir, getLearningDbPath } from './data-path';

let dbInstance: Database.Database | null = null;

/** Vitest：切换 WUXIAN_DATA_DIR 后重置连接 */
export function resetLearningDbForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function getLearningDb(): Database.Database {
  if (!dbInstance) {
    const dataDir = getDataDir();
    const dbPath = getLearningDbPath();
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    initBaseSchema(dbInstance);
    runPendingMigrations(dbInstance);
    seedDemoCourses(dbInstance);
    if (process.env.VITEST !== 'true') {
      console.log(`[WUXIAN Learning] SQLite → ${dbPath}`);
    }
  }
  return dbInstance;
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some(c => c.name === column);
}

const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_add_course_active_version',
    sql: `ALTER TABLE courses ADD COLUMN active_version_id TEXT`,
  },
  {
    id: '002_add_knowledge_node_version',
    sql: `ALTER TABLE knowledge_nodes ADD COLUMN version_id TEXT`,
  },
  {
    id: '003_add_knowledge_node_version_indexes',
    sql: [
      `CREATE INDEX IF NOT EXISTS idx_nodes_course_version ON knowledge_nodes(course_id, version_id, node_index)`,
      `CREATE INDEX IF NOT EXISTS idx_nodes_course_version_time ON knowledge_nodes(course_id, version_id, video_timestamp_start)`,
    ].join(';'),
  },
  {
    id: '004_create_webrtc_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS webrtc_sessions (
        session_id TEXT PRIMARY KEY,
        offer TEXT,
        answer TEXT,
        user_id TEXT DEFAULT '',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_webrtc_sessions_updated ON webrtc_sessions(updated_at);
    `,
  },
  {
    id: '005_seed_demo_data',
    sql: `INSERT OR IGNORE INTO courses (id, title) VALUES ('course-webrtc-v3', 'WebRTC 伴生通信通道')`,
  },
  {
    id: '006_add_tutor_source_type',
    sql: `ALTER TABLE zhi_tutor_lessons ADD COLUMN source_type TEXT DEFAULT ''`,
  },
  {
    id: '007_add_tutor_source_id',
    sql: `ALTER TABLE zhi_tutor_lessons ADD COLUMN source_id TEXT DEFAULT ''`,
  },
  {
    id: '008_add_tutor_checkpoint_passed',
    sql: `ALTER TABLE zhi_tutor_lessons ADD COLUMN checkpoint_passed INTEGER DEFAULT 0`,
  },
  {
    id: '009_add_tutor_checkpoint_answered_at',
    sql: `ALTER TABLE zhi_tutor_lessons ADD COLUMN checkpoint_answered_at TEXT`,
  },
  {
    id: '010_add_exam_time_limit',
    sql: `ALTER TABLE zhi_exams ADD COLUMN time_limit_minutes INTEGER DEFAULT 0`,
  },
];

function runPendingMigrations(db: Database.Database): void {
  const applied = new Set(
    db.prepare(`SELECT version FROM schema_migrations`).all()
      .map((r: unknown) => (r as { version: string }).version),
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    try {
      if (m.id === '001_add_course_active_version' && columnExists(db, 'courses', 'active_version_id')) {
        db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run(m.id);
        continue;
      }
      if (m.id === '002_add_knowledge_node_version' && columnExists(db, 'knowledge_nodes', 'version_id')) {
        db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run(m.id);
        continue;
      }
      if (m.id === '003_add_knowledge_node_version_indexes' && !columnExists(db, 'knowledge_nodes', 'version_id')) {
        db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run(m.id);
        continue;
      }
      db.exec(m.sql);
      db.prepare(`INSERT INTO schema_migrations (version) VALUES (?)`).run(m.id);
      console.log(`  [Learning DB Migration] ${m.id} applied`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate column name|non-constant default/i.test(msg)) {
        db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run(m.id);
        console.warn(`  [Learning DB Migration] ${m.id} skipped (${msg})`);
        continue;
      }
      throw err;
    }
  }
}

function initBaseSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_url TEXT,
      video_id TEXT,
      total_duration_sec INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_nodes (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      node_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      video_timestamp_start INTEGER NOT NULL,
      video_timestamp_end INTEGER NOT NULL,
      cognitive_load REAL NOT NULL,
      core_concept_hash TEXT NOT NULL,
      FOREIGN KEY(course_id) REFERENCES courses(id)
    );

    CREATE TABLE IF NOT EXISTS cognitive_telemetry (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      play_speed REAL DEFAULT 1.0,
      skip_count INTEGER DEFAULT 0,
      quiz_score REAL,
      interaction_latency REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(node_id) REFERENCES knowledge_nodes(id)
    );

    CREATE TABLE IF NOT EXISTS user_cognitive_waterline (
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      current_node_id TEXT,
      il REAL DEFAULT 0,
      ps REAL DEFAULT 0,
      assimilation_rate REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, course_id),
      FOREIGN KEY(course_id) REFERENCES courses(id)
    );

    CREATE TABLE IF NOT EXISTS wormhole_leap_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      from_node_id TEXT,
      to_node_id TEXT,
      skipped_titles TEXT,
      il REAL NOT NULL,
      ps REAL NOT NULL,
      assimilation_rate REAL NOT NULL,
      old_slope REAL NOT NULL,
      new_slope REAL NOT NULL,
      persona_feedback TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_course ON knowledge_nodes(course_id, node_index);
    CREATE INDEX IF NOT EXISTS idx_nodes_course_time ON knowledge_nodes(course_id, video_timestamp_start);
    CREATE INDEX IF NOT EXISTS idx_telemetry_user ON cognitive_telemetry(user_id, node_id);

    CREATE TABLE IF NOT EXISTS user_billing (
      user_id TEXT PRIMARY KEY,
      available_warp_minutes REAL DEFAULT 60.0,
      total_warp_purchased REAL DEFAULT 0,
      unlimited_until TEXT,
      last_monthly_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cognitive_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      goal_id TEXT,
      course_id TEXT,
      il_peak REAL NOT NULL,
      ps_peak REAL NOT NULL,
      resilience_density REAL NOT NULL,
      is_unlocked INTEGER DEFAULT 0,
      share_token TEXT,
      share_url TEXT,
      summary_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS warp_consumption_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_id TEXT,
      minutes_consumed REAL NOT NULL,
      remaining_after REAL NOT NULL,
      unlimited_flag INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_reports_user ON cognitive_reports(user_id);

    CREATE TABLE IF NOT EXISTS user_pulse (
      user_id TEXT PRIMARY KEY,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      consecutive_absent_days INTEGER DEFAULT 0,
      active_goal_id TEXT
    );

    CREATE TABLE IF NOT EXISTS edge_utterances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT,
      text TEXT NOT NULL,
      fatigue REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_edge_utterances_user ON edge_utterances(user_id, created_at);

    CREATE TABLE IF NOT EXISTS behavioral_telemetry_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT,
      event_type TEXT NOT NULL,
      payload TEXT,
      ts DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_behavioral_telemetry_user_ts ON behavioral_telemetry_events(user_id, ts);

    CREATE TABLE IF NOT EXISTS zhi_autonomous_plans (
      user_id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'uninitialized',
      target_school TEXT DEFAULT '',
      target_major TEXT DEFAULT '',
      exam_date TEXT,
      current_ability_label TEXT DEFAULT 'unknown',
      data_gaps_json TEXT DEFAULT '[]',
      active_request_json TEXT,
      plan_json TEXT,
      plan_version INTEGER DEFAULT 0,
      generated_at TEXT,
      last_adjusted_at TEXT,
      current_phase_index INTEGER DEFAULT 0,
      total_phases INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_planned_knowledge (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      directory_id TEXT,
      subject TEXT NOT NULL,
      node_title TEXT NOT NULL,
      prerequisites_json TEXT DEFAULT '[]',
      estimated_minutes INTEGER DEFAULT 30,
      mastery_target REAL DEFAULT 0.8,
      current_mastery REAL DEFAULT 0,
      status TEXT DEFAULT 'locked',
      seq_order INTEGER DEFAULT 0,
      scheduled_date TEXT,
      completed_at TEXT,
      assessment_type TEXT DEFAULT 'none',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_planned_slots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_date TEXT NOT NULL,
      slot_hour INTEGER,
      subject TEXT,
      activity TEXT,
      knowledge_node_id TEXT,
      duration_minutes INTEGER DEFAULT 30,
      energy_level TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'planned',
      actual_minutes INTEGER,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_assessment_schedule (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      knowledge_node_id TEXT,
      subject TEXT NOT NULL,
      scheduled_date TEXT,
      assessment_type TEXT,
      status TEXT DEFAULT 'pending',
      paper_id TEXT,
      score_pct REAL,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_zhi_planned_knowledge_user ON zhi_planned_knowledge(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_zhi_planned_slots_user_date ON zhi_planned_slots(user_id, plan_date);
    CREATE INDEX IF NOT EXISTS idx_zhi_assessment_schedule_user ON zhi_assessment_schedule(user_id, status);

    CREATE TABLE IF NOT EXISTS zhi_mistake_bank (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      knowledge_node TEXT,
      source TEXT DEFAULT 'assessment',
      source_id TEXT,
      question_text TEXT NOT NULL,
      user_answer TEXT,
      correct_answer TEXT,
      mistake_type TEXT DEFAULT 'unknown',
      difficulty TEXT DEFAULT 'medium',
      mastery_status TEXT DEFAULT 'needs_review',
      review_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      last_reviewed_at TEXT,
      next_review_at TEXT,
      tags_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_learning_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT,
      knowledge_node_id TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_seconds INTEGER DEFAULT 0,
      session_type TEXT DEFAULT 'study',
      status TEXT DEFAULT 'in_progress',
      energy_level TEXT DEFAULT 'medium',
      mood TEXT,
      notes TEXT,
      slot_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT '🏆',
      unlocked_at TEXT,
      progress_current INTEGER DEFAULT 0,
      progress_target INTEGER DEFAULT 1,
      status TEXT DEFAULT 'locked',
      category TEXT DEFAULT 'general',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_study_stats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      stat_date TEXT NOT NULL,
      total_seconds INTEGER DEFAULT 0,
      slots_completed INTEGER DEFAULT 0,
      slots_total INTEGER DEFAULT 0,
      assessments_taken INTEGER DEFAULT 0,
      mistakes_reviewed INTEGER DEFAULT 0,
      knowledge_mastered INTEGER DEFAULT 0,
      energy_avg TEXT,
      streak_day INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_video_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT,
      video_title TEXT,
      timestamp_sec INTEGER DEFAULT 0,
      note_text TEXT NOT NULL,
      knowledge_node_id TEXT,
      tags_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_spaced_review (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT,
      content_title TEXT NOT NULL,
      content_summary TEXT,
      question_text TEXT,
      answer_text TEXT,
      review_interval_days INTEGER DEFAULT 1,
      next_review_at TEXT NOT NULL,
      last_reviewed_at TEXT,
      review_count INTEGER DEFAULT 0,
      ease_factor REAL DEFAULT 2.5,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_vocabulary (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      word TEXT NOT NULL,
      definition TEXT,
      example_sentence TEXT,
      subject TEXT DEFAULT '英语',
      source TEXT,
      mastery_level INTEGER DEFAULT 0,
      next_review_at TEXT,
      review_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_zhi_mistake_bank_user ON zhi_mistake_bank(user_id, subject, mastery_status);
    CREATE INDEX IF NOT EXISTS idx_zhi_learning_sessions_user ON zhi_learning_sessions(user_id, start_time);
    CREATE INDEX IF NOT EXISTS idx_zhi_achievements_user ON zhi_achievements(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_zhi_study_stats_user_date ON zhi_study_stats(user_id, stat_date);
    CREATE INDEX IF NOT EXISTS idx_zhi_spaced_review_user ON zhi_spaced_review(user_id, next_review_at);
    CREATE INDEX IF NOT EXISTS idx_zhi_vocabulary_user ON zhi_vocabulary(user_id, next_review_at);
    CREATE INDEX IF NOT EXISTS idx_zhi_video_notes_user ON zhi_video_notes(user_id, course_id);

    CREATE TABLE IF NOT EXISTS zhi_tutor_lessons (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      knowledge_point TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      prerequisite_check TEXT DEFAULT '',
      core_teaching TEXT NOT NULL,
      analogy TEXT DEFAULT '',
      common_mistakes TEXT DEFAULT '',
      checkpoint_question TEXT DEFAULT '',
      checkpoint_answer TEXT DEFAULT '',
      checkpoint_options TEXT DEFAULT '',
      estimated_minutes INTEGER DEFAULT 10,
      source_type TEXT DEFAULT '',
      source_id TEXT DEFAULT '',
      checkpoint_passed INTEGER DEFAULT 0,
      checkpoint_answered_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_tutor_lessons_user ON zhi_tutor_lessons(user_id, knowledge_point);

    CREATE TABLE IF NOT EXISTS zhi_textbook_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      catalog_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      lesson_id TEXT,
      checkpoint_passed INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_textbook_progress_user ON zhi_textbook_progress(user_id, catalog_id, chapter_index);

    CREATE TABLE IF NOT EXISTS zhi_exams (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT,
      question_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      score_pct REAL DEFAULT 0,
      status TEXT DEFAULT 'generated',
      source_summary TEXT DEFAULT '',
      weak_areas_json TEXT DEFAULT '[]',
      recommendations TEXT,
      time_limit_minutes INTEGER DEFAULT 0,
      generated_at TEXT DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS zhi_exam_questions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      question_index INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      options_json TEXT DEFAULT '[]',
      correct_answer TEXT NOT NULL,
      source_type TEXT,
      source_id TEXT,
      user_answer TEXT,
      is_correct INTEGER DEFAULT 0,
      is_answered INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_zhi_exams_user ON zhi_exams(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_zhi_exam_questions_exam ON zhi_exam_questions(exam_id, question_index);
  `);
}

export function conceptHash(title: string): string {
  return createHash('sha256').update(title).digest('hex').slice(0, 16);
}

export function learningUid(): string {
  return crypto.randomUUID();
}

export interface KnowledgeNodeRow {
  id: string;
  course_id: string;
  version_id?: string | null;
  node_index: number;
  title: string;
  video_timestamp_start: number;
  video_timestamp_end: number;
  cognitive_load: number;
  core_concept_hash: string;
}

export interface CourseRow {
  id: string;
  title: string;
  source_url: string | null;
  video_id: string | null;
  total_duration_sec: number;
  active_version_id?: string | null;
}

function getCourseActiveVersion(courseId: string): string | null {
  const row = getLearningDb().prepare(`SELECT active_version_id FROM courses WHERE id = ?`).get(courseId) as {
    active_version_id: string | null;
  } | undefined;
  return row?.active_version_id ?? null;
}

export function findNodeByTimestamp(courseId: string, timestampSec: number): KnowledgeNodeRow | undefined {
  const db = getLearningDb();
  const versionId = getCourseActiveVersion(courseId);
  if (!versionId) {
    return db.prepare(`
      SELECT * FROM knowledge_nodes
      WHERE course_id = ? AND version_id IS NULL AND ? >= video_timestamp_start AND ? <= video_timestamp_end
      ORDER BY node_index ASC
      LIMIT 1
    `).get(courseId, timestampSec, timestampSec) as KnowledgeNodeRow | undefined;
  }
  return db.prepare(`
    SELECT * FROM knowledge_nodes
    WHERE course_id = ? AND version_id = ? AND ? >= video_timestamp_start AND ? <= video_timestamp_end
    ORDER BY node_index ASC
    LIMIT 1
  `).get(courseId, versionId, timestampSec, timestampSec) as KnowledgeNodeRow | undefined;
}

export function getNodeById(nodeId: string): KnowledgeNodeRow | undefined {
  return getLearningDb().prepare(`SELECT * FROM knowledge_nodes WHERE id = ?`).get(nodeId) as KnowledgeNodeRow | undefined;
}

export function getNextNodes(courseId: string, afterIndex: number, limit = 3): KnowledgeNodeRow[] {
  const db = getLearningDb();
  const versionId = getCourseActiveVersion(courseId);
  if (!versionId) {
    return db.prepare(`
      SELECT * FROM knowledge_nodes
      WHERE course_id = ? AND version_id IS NULL AND node_index > ?
      ORDER BY node_index ASC LIMIT ?
    `).all(courseId, afterIndex, limit) as KnowledgeNodeRow[];
  }
  return db.prepare(`
    SELECT * FROM knowledge_nodes
    WHERE course_id = ? AND version_id = ? AND node_index > ?
    ORDER BY node_index ASC LIMIT ?
  `).all(courseId, versionId, afterIndex, limit) as KnowledgeNodeRow[];
}

export function listCourseNodes(courseId: string): KnowledgeNodeRow[] {
  const db = getLearningDb();
  const versionId = getCourseActiveVersion(courseId);
  if (!versionId) {
    return db.prepare(`
      SELECT * FROM knowledge_nodes WHERE course_id = ? AND version_id IS NULL ORDER BY node_index ASC
    `).all(courseId) as KnowledgeNodeRow[];
  }
  return db.prepare(`
    SELECT * FROM knowledge_nodes WHERE course_id = ? AND version_id = ? ORDER BY node_index ASC
  `).all(courseId, versionId) as KnowledgeNodeRow[];
}

export function insertTelemetry(input: {
  userId: string;
  nodeId: string;
  playSpeed: number;
  skipCount: number;
  quizScore: number;
  interactionLatency: number;
}): string {
  const id = learningUid();
  getLearningDb().prepare(`
    INSERT INTO cognitive_telemetry (id, user_id, node_id, play_speed, skip_count, quiz_score, interaction_latency)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.userId, input.nodeId, input.playSpeed, input.skipCount, input.quizScore, input.interactionLatency);
  return id;
}

export function insertBehavioralTelemetryEvents(input: {
  userId: string;
  sessionId?: string;
  events: Array<{ ts: string; type: string; payload?: unknown }>;
}): number {
  const db = getLearningDb();
  const insert = db.prepare(`
    INSERT INTO behavioral_telemetry_events (id, user_id, session_id, event_type, payload, ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((events: typeof input.events) => {
    for (const e of events) {
      insert.run(
        learningUid(),
        input.userId,
        input.sessionId ?? null,
        e.type,
        e.payload ? JSON.stringify(e.payload) : null,
        e.ts,
      );
    }
  });
  tx(input.events);
  return input.events.length;
}

export function listBehavioralTelemetryEvents(userId: string, fromIso: string, toIso: string): Array<{
  userId: string;
  sessionId?: string;
  ts: string;
  type: string;
  payload?: unknown;
}> {
  const rows = getLearningDb().prepare(`
    SELECT user_id, session_id, event_type, payload, ts
    FROM behavioral_telemetry_events
    WHERE user_id = ? AND ts >= ? AND ts <= ?
    ORDER BY ts ASC
  `).all(userId, fromIso, toIso) as Array<{
    user_id: string;
    session_id: string | null;
    event_type: string;
    payload: string | null;
    ts: string;
  }>;

  return rows.map(r => ({
    userId: r.user_id,
    sessionId: r.session_id ?? undefined,
    ts: r.ts,
    type: r.event_type,
    payload: r.payload ? JSON.parse(r.payload) : undefined,
  }));
}

export function upsertWaterline(input: {
  userId: string;
  courseId: string;
  nodeId: string;
  il: number;
  ps: number;
  assimilationRate: number;
}): void {
  getLearningDb().prepare(`
    INSERT INTO user_cognitive_waterline (user_id, course_id, current_node_id, il, ps, assimilation_rate, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, course_id) DO UPDATE SET
      current_node_id = excluded.current_node_id,
      il = excluded.il,
      ps = excluded.ps,
      assimilation_rate = excluded.assimilation_rate,
      updated_at = CURRENT_TIMESTAMP
  `).run(input.userId, input.courseId, input.nodeId, input.il, input.ps, input.assimilationRate);
}

export function insertWormholeLeapLog(input: {
  userId: string;
  courseId: string;
  fromNodeId: string;
  toNodeId: string;
  skippedTitles: string[];
  il: number;
  ps: number;
  assimilationRate: number;
  oldSlope: number;
  newSlope: number;
  personaFeedback: string;
}): string {
  const id = learningUid();
  getLearningDb().prepare(`
    INSERT INTO wormhole_leap_logs
      (id, user_id, course_id, from_node_id, to_node_id, skipped_titles, il, ps, assimilation_rate, old_slope, new_slope, persona_feedback)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.userId, input.courseId, input.fromNodeId, input.toNodeId,
    JSON.stringify(input.skippedTitles), input.il, input.ps, input.assimilationRate,
    input.oldSlope, input.newSlope, input.personaFeedback,
  );
  return id;
}

export function insertEdgeUtterance(input: { userId: string; sessionId?: string; text: string; fatigue?: number }): string {
  const id = learningUid();
  const fatigue = typeof input.fatigue === 'number' ? input.fatigue : 0;
  getLearningDb().prepare(`
    INSERT INTO edge_utterances (id, user_id, session_id, text, fatigue)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, input.userId, input.sessionId ?? null, input.text, fatigue);
  return id;
}

/** 视频同化后：将 KnowledgeCell 写入零存储指针图谱 */
export function persistKnowledgeGraph(input: {
  courseId: string;
  title: string;
  sourceUrl?: string;
  videoId: string;
  totalDurationSec: number;
  cells: KnowledgeCell[];
}): { courseId: string; nodeCount: number } {
  const db = getLearningDb();
  const versionId = learningUid().slice(0, 12);

  db.prepare(`
    INSERT INTO courses (id, title, source_url, video_id, total_duration_sec, active_version_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      source_url = excluded.source_url,
      video_id = excluded.video_id,
      total_duration_sec = excluded.total_duration_sec,
      active_version_id = excluded.active_version_id
  `).run(input.courseId, input.title, input.sourceUrl ?? null, input.videoId, input.totalDurationSec, versionId);

  const insert = db.prepare(`
    INSERT INTO knowledge_nodes
      (id, course_id, version_id, node_index, title, video_timestamp_start, video_timestamp_end, cognitive_load, core_concept_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      course_id = excluded.course_id,
      version_id = excluded.version_id,
      node_index = excluded.node_index,
      title = excluded.title,
      video_timestamp_start = excluded.video_timestamp_start,
      video_timestamp_end = excluded.video_timestamp_end,
      cognitive_load = excluded.cognitive_load,
      core_concept_hash = excluded.core_concept_hash
  `);

  const tx = db.transaction((cells: KnowledgeCell[]) => {
    cells.forEach((cell, i) => {
      const nodeId = `${input.courseId}:${versionId}:${cell.id}`;
      insert.run(
        nodeId,
        input.courseId,
        versionId,
        i + 1,
        cell.name,
        cell.timestampStart,
        cell.timestampEnd,
        Math.max(1, Math.min(10, cell.densityScore * 10)),
        conceptHash(cell.name),
      );
    });
  });

  tx(input.cells);
  return { courseId: input.courseId, nodeCount: input.cells.length };
}

// ── WebRTC 会话持久化 ──

export function upsertWebrtcSession(sessionId: string, offer?: string, answer?: string): void {
  const db = getLearningDb();
  const existing = db.prepare(`SELECT session_id FROM webrtc_sessions WHERE session_id = ?`).get(sessionId) as { session_id: string } | undefined;
  if (existing) {
    const updates: string[] = [];
    const params: unknown[] = [];
    if (offer !== undefined) { updates.push('offer = ?'); params.push(offer); }
    if (answer !== undefined) { updates.push('answer = ?'); params.push(answer); }
    updates.push("updated_at = strftime('%s', 'now')");
    params.push(sessionId);
    db.prepare(`UPDATE webrtc_sessions SET ${updates.join(', ')} WHERE session_id = ?`).run(...params);
  } else {
    db.prepare(`
      INSERT INTO webrtc_sessions (session_id, offer, answer, updated_at)
      VALUES (?, ?, ?, strftime('%s', 'now'))
    `).run(sessionId, offer ?? null, answer ?? null);
  }
}

export function getWebrtcSession(sessionId: string): { session_id: string; offer?: string; answer?: string; updated_at: number } | undefined {
  return getLearningDb().prepare(`SELECT * FROM webrtc_sessions WHERE session_id = ?`).get(sessionId) as { session_id: string; offer?: string; answer?: string; updated_at: number } | undefined;
}

export function deleteExpiredWebrtcSessions(maxAgeSec = 86400): number {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeSec;
  const result = getLearningDb().prepare(`DELETE FROM webrtc_sessions WHERE updated_at < ?`).run(cutoff);
  return result.changes;
}

function seedDemoCourses(db: Database.Database): void {
  const courseId = 'course-python-adv-001';
  const exists = db.prepare(`SELECT id FROM courses WHERE id = ?`).get(courseId);
  if (exists) return;

  db.prepare(`
    INSERT INTO courses (id, title, source_url, video_id, total_duration_sec)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    courseId,
    'Python 进阶与统计学基础 · 长视频加速器演示',
    'https://www.bilibili.com/video/demo-python-stats',
    'bvid-python-stats-demo',
    5400,
  );

  const nodes: Omit<KnowledgeNodeRow, 'id'>[] = [
    { course_id: courseId, node_index: 1, title: '变量类型与内存模型', video_timestamp_start: 0, video_timestamp_end: 600, cognitive_load: 2.0, core_concept_hash: conceptHash('变量类型与内存模型') },
    { course_id: courseId, node_index: 2, title: '控制流与迭代器协议', video_timestamp_start: 601, video_timestamp_end: 1200, cognitive_load: 3.0, core_concept_hash: conceptHash('控制流与迭代器协议') },
    { course_id: courseId, node_index: 3, title: '函数闭包与递归基', video_timestamp_start: 1201, video_timestamp_end: 1800, cognitive_load: 4.0, core_concept_hash: conceptHash('函数闭包与递归基') },
    { course_id: courseId, node_index: 4, title: '指针语义与对象引用', video_timestamp_start: 1801, video_timestamp_end: 2400, cognitive_load: 5.5, core_concept_hash: conceptHash('指针语义与对象引用') },
    { course_id: courseId, node_index: 5, title: '特征向量与方差分解', video_timestamp_start: 2700, video_timestamp_end: 3600, cognitive_load: 8.5, core_concept_hash: conceptHash('特征向量与方差分解') },
    { course_id: courseId, node_index: 6, title: '贝叶斯推断与假设检验', video_timestamp_start: 3601, video_timestamp_end: 4500, cognitive_load: 9.2, core_concept_hash: conceptHash('贝叶斯推断与假设检验') },
  ];

  const insert = db.prepare(`
    INSERT INTO knowledge_nodes
      (id, course_id, node_index, title, video_timestamp_start, video_timestamp_end, cognitive_load, core_concept_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  nodes.forEach((n) => {
    insert.run(
      `${courseId}-node-${n.node_index}`,
      n.course_id, n.node_index, n.title,
      n.video_timestamp_start, n.video_timestamp_end,
      n.cognitive_load, n.core_concept_hash,
    );
  });
}
