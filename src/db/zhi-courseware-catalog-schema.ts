/**
 * ZHI · 课件目录（标签体系 + 质量维度 + 知识点树）
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';

export type CoursewareQualityGrade = 'S' | 'A' | 'B' | 'C';

export type CoursewareKnowledgePoint = {
  id: string;
  name: string;
  chapterHint?: string;
  timestampSec?: number;
};

export type CoursewareCatalogRow = {
  id: string;
  title: string;
  instructor: string | null;
  platform: string;
  source_url: string;
  duration_min: number | null;
  subject: string;
  difficulty: string | null;
  quality_grade: string;
  logic_score: number;
  intuition_score: number;
  rigor_score: number;
  production_score: number;
  completeness_score: number;
  topic_tags_json: string;
  knowledge_points_json: string;
  school_align_json: string;
  exam_align_json: string;
  audience_json: string;
  wormhole_value: number;
  recommended_sec: number;
  summary: string | null;
  status: string;
  created_at: number;
  updated_at: number;
};

export type CoursewareCatalogInput = {
  title: string;
  instructor?: string;
  platform: string;
  sourceUrl: string;
  durationMin?: number;
  subject: string;
  difficulty?: string;
  qualityGrade: CoursewareQualityGrade;
  logicScore?: number;
  intuitionScore?: number;
  rigorScore?: number;
  productionScore?: number;
  completenessScore?: number;
  topicTags: string[];
  knowledgePoints: CoursewareKnowledgePoint[];
  schoolAlign?: string[];
  examAlign?: string[];
  audience?: string[];
  wormholeValue?: number;
  recommendedSec?: number;
  summary?: string;
};

export function initializeZhiCoursewareCatalogSchema(): void {
  getLearningDb().exec(`
    CREATE TABLE IF NOT EXISTS zhi_courseware_catalog (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      instructor TEXT,
      platform TEXT NOT NULL,
      source_url TEXT NOT NULL UNIQUE,
      duration_min INTEGER,
      subject TEXT NOT NULL,
      difficulty TEXT,
      quality_grade TEXT NOT NULL DEFAULT 'B',
      logic_score REAL NOT NULL DEFAULT 0.7,
      intuition_score REAL NOT NULL DEFAULT 0.7,
      rigor_score REAL NOT NULL DEFAULT 0.7,
      production_score REAL NOT NULL DEFAULT 0.7,
      completeness_score REAL NOT NULL DEFAULT 0.7,
      topic_tags_json TEXT NOT NULL DEFAULT '[]',
      knowledge_points_json TEXT NOT NULL DEFAULT '[]',
      school_align_json TEXT NOT NULL DEFAULT '[]',
      exam_align_json TEXT NOT NULL DEFAULT '[]',
      audience_json TEXT NOT NULL DEFAULT '[]',
      wormhole_value REAL NOT NULL DEFAULT 0.5,
      recommended_sec INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_courseware_subject ON zhi_courseware_catalog(subject, quality_grade);
    CREATE INDEX IF NOT EXISTS idx_courseware_status ON zhi_courseware_catalog(status);
  `);
}

export function upsertCourseware(input: CoursewareCatalogInput): CoursewareCatalogRow {
  initializeZhiCoursewareCatalogSchema();
  const url = input.sourceUrl.trim();
  const existing = getLearningDb()
    .prepare(`SELECT id FROM zhi_courseware_catalog WHERE source_url = ?`)
    .get(url) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();

  getLearningDb()
    .prepare(
      `
    INSERT INTO zhi_courseware_catalog (
      id, title, instructor, platform, source_url, duration_min, subject, difficulty,
      quality_grade, logic_score, intuition_score, rigor_score, production_score, completeness_score,
      topic_tags_json, knowledge_points_json, school_align_json, exam_align_json, audience_json,
      wormhole_value, recommended_sec, summary, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', strftime('%s', 'now'))
    ON CONFLICT(source_url) DO UPDATE SET
      title = excluded.title,
      instructor = excluded.instructor,
      platform = excluded.platform,
      duration_min = excluded.duration_min,
      subject = excluded.subject,
      difficulty = excluded.difficulty,
      quality_grade = excluded.quality_grade,
      logic_score = excluded.logic_score,
      intuition_score = excluded.intuition_score,
      rigor_score = excluded.rigor_score,
      production_score = excluded.production_score,
      completeness_score = excluded.completeness_score,
      topic_tags_json = excluded.topic_tags_json,
      knowledge_points_json = excluded.knowledge_points_json,
      school_align_json = excluded.school_align_json,
      exam_align_json = excluded.exam_align_json,
      audience_json = excluded.audience_json,
      wormhole_value = excluded.wormhole_value,
      recommended_sec = excluded.recommended_sec,
      summary = excluded.summary,
      updated_at = excluded.updated_at
  `,
    )
    .run(
      id,
      input.title.slice(0, 300),
      input.instructor?.slice(0, 120) ?? null,
      input.platform,
      url,
      input.durationMin ?? null,
      input.subject,
      input.difficulty ?? null,
      input.qualityGrade,
      input.logicScore ?? 0.75,
      input.intuitionScore ?? 0.75,
      input.rigorScore ?? 0.75,
      input.productionScore ?? 0.7,
      input.completenessScore ?? 0.7,
      JSON.stringify(input.topicTags.slice(0, 24)),
      JSON.stringify(input.knowledgePoints.slice(0, 40)),
      JSON.stringify(input.schoolAlign ?? []),
      JSON.stringify(input.examAlign ?? []),
      JSON.stringify(input.audience ?? ['high_school']),
      input.wormholeValue ?? 0.75,
      input.recommendedSec ?? 0,
      input.summary?.slice(0, 500) ?? null,
    );

  return getCoursewareById(id)!;
}

export function getCoursewareById(id: string): CoursewareCatalogRow | null {
  initializeZhiCoursewareCatalogSchema();
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_courseware_catalog WHERE id = ?`)
    .get(id) as CoursewareCatalogRow | undefined;
  return row ?? null;
}

export function getCoursewareBySourceUrl(url: string): CoursewareCatalogRow | null {
  initializeZhiCoursewareCatalogSchema();
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_courseware_catalog WHERE source_url = ?`)
    .get(url.trim()) as CoursewareCatalogRow | undefined;
  return row ?? null;
}

export function listActiveCourseware(subject?: string): CoursewareCatalogRow[] {
  initializeZhiCoursewareCatalogSchema();
  if (subject) {
    return getLearningDb()
      .prepare(
        `SELECT * FROM zhi_courseware_catalog WHERE status = 'active' AND subject = ? ORDER BY quality_grade, wormhole_value DESC`,
      )
      .all(subject) as CoursewareCatalogRow[];
  }
  return getLearningDb()
    .prepare(`SELECT * FROM zhi_courseware_catalog WHERE status = 'active' ORDER BY quality_grade, wormhole_value DESC`)
    .all() as CoursewareCatalogRow[];
}

export function listCoursewareCatalog(opts?: {
  grade?: CoursewareQualityGrade;
  status?: string;
  limit?: number;
  pendingReviewOnly?: boolean;
}): CoursewareCatalogRow[] {
  initializeZhiCoursewareCatalogSchema();
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 50));
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (opts?.pendingReviewOnly) {
    clauses.push(`quality_grade = 'B'`);
  } else if (opts?.grade) {
    clauses.push(`quality_grade = ?`);
    params.push(opts.grade);
  }
  if (opts?.status) {
    clauses.push(`status = ?`);
    params.push(opts.status);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);
  return getLearningDb()
    .prepare(
      `SELECT * FROM zhi_courseware_catalog ${where} ORDER BY updated_at DESC, quality_grade LIMIT ?`,
    )
    .all(...params) as CoursewareCatalogRow[];
}

export function reviewCoursewareGrade(
  id: string,
  input: { qualityGrade: CoursewareQualityGrade; status?: string },
): CoursewareCatalogRow | null {
  initializeZhiCoursewareCatalogSchema();
  const row = getCoursewareById(id);
  if (!row) return null;
  const status = input.status ?? row.status;
  getLearningDb()
    .prepare(
      `UPDATE zhi_courseware_catalog
       SET quality_grade = ?, status = ?, updated_at = strftime('%s', 'now')
       WHERE id = ?`,
    )
    .run(input.qualityGrade, status, id);
  return getCoursewareById(id);
}

export function parseCoursewareRow(row: CoursewareCatalogRow) {
  return {
    id: row.id,
    title: row.title,
    instructor: row.instructor,
    platform: row.platform,
    sourceUrl: row.source_url,
    durationMin: row.duration_min,
    subject: row.subject,
    difficulty: row.difficulty,
    qualityGrade: row.quality_grade as CoursewareQualityGrade,
    quality: {
      logic: row.logic_score,
      intuition: row.intuition_score,
      rigor: row.rigor_score,
      production: row.production_score,
      completeness: row.completeness_score,
      composite: Math.round(
        (row.logic_score * 0.3 +
          row.intuition_score * 0.25 +
          row.rigor_score * 0.25 +
          row.production_score * 0.1 +
          row.completeness_score * 0.1) *
          100,
      ),
    },
    topicTags: JSON.parse(row.topic_tags_json) as string[],
    knowledgePoints: JSON.parse(row.knowledge_points_json) as CoursewareKnowledgePoint[],
    schoolAlign: JSON.parse(row.school_align_json) as string[],
    examAlign: JSON.parse(row.exam_align_json) as string[],
    audience: JSON.parse(row.audience_json) as string[],
    wormholeValue: row.wormhole_value,
    recommendedSec: row.recommended_sec,
    summary: row.summary,
  };
}
