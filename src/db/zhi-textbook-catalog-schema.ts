/**
 * ZHI · 用户教材指认目录（书名+出版社 → 章节与知识点，无需逐页拍照）
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';

export type TextbookChapterOutline = {
  index: number;
  title: string;
  knowledgePoints: string[];
};

export type TextbookCatalogRow = {
  id: string;
  user_id: string;
  title: string;
  publisher: string;
  subject: string | null;
  edition: string | null;
  outline_json: string;
  progress_chapter: number | null;
  progress_pct: number | null;
  knowledge_summary: string | null;
  created_at: number;
  updated_at: number;
};

export function initializeZhiTextbookCatalogSchema(): void {
  getLearningDb().exec(`
    CREATE TABLE IF NOT EXISTS zhi_textbook_catalog (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      publisher TEXT NOT NULL,
      subject TEXT,
      edition TEXT,
      outline_json TEXT NOT NULL,
      progress_chapter INTEGER,
      progress_pct REAL,
      knowledge_summary TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_textbook_user ON zhi_textbook_catalog(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_zhi_textbook_user_title
      ON zhi_textbook_catalog(user_id, title, publisher);
  `);
}

export function upsertTextbookCatalog(input: {
  userId: string;
  title: string;
  publisher: string;
  subject?: string;
  edition?: string;
  chapters: TextbookChapterOutline[];
  progressChapter?: number;
  progressPct?: number;
  knowledgeSummary?: string;
}): TextbookCatalogRow {
  initializeZhiTextbookCatalogSchema();
  const uid = input.userId.trim();
  const title = input.title.trim();
  const publisher = input.publisher.trim();
  const existing = getLearningDb()
    .prepare(
      `SELECT id FROM zhi_textbook_catalog WHERE user_id = ? AND title = ? AND publisher = ?`,
    )
    .get(uid, title, publisher) as { id: string } | undefined;

  const id = existing?.id ?? randomUUID();
  const outlineJson = JSON.stringify(input.chapters);
  const progressChapter =
    input.progressChapter != null && Number.isFinite(input.progressChapter)
      ? Math.max(0, Math.floor(input.progressChapter))
      : null;
  const progressPct =
    input.progressPct != null && Number.isFinite(input.progressPct)
      ? Math.min(100, Math.max(0, input.progressPct))
      : null;

  getLearningDb()
    .prepare(
      `
    INSERT INTO zhi_textbook_catalog (
      id, user_id, title, publisher, subject, edition,
      outline_json, progress_chapter, progress_pct, knowledge_summary, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(id) DO UPDATE SET
      subject = excluded.subject,
      edition = excluded.edition,
      outline_json = excluded.outline_json,
      progress_chapter = excluded.progress_chapter,
      progress_pct = excluded.progress_pct,
      knowledge_summary = excluded.knowledge_summary,
      updated_at = excluded.updated_at
  `,
    )
    .run(
      id,
      uid,
      title,
      publisher,
      input.subject?.trim() || null,
      input.edition?.trim() || null,
      outlineJson,
      progressChapter,
      progressPct,
      input.knowledgeSummary?.trim() || null,
    );

  return getTextbookById(id)!;
}

export function getTextbookById(id: string): TextbookCatalogRow | null {
  initializeZhiTextbookCatalogSchema();
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_textbook_catalog WHERE id = ?`)
    .get(id) as TextbookCatalogRow | undefined;
  return row ?? null;
}

export function listTextbooksForUser(userId: string): TextbookCatalogRow[] {
  initializeZhiTextbookCatalogSchema();
  return getLearningDb()
    .prepare(
      `SELECT * FROM zhi_textbook_catalog WHERE user_id = ? ORDER BY updated_at DESC LIMIT 24`,
    )
    .all(userId.trim()) as TextbookCatalogRow[];
}

export function parseTextbookOutline(row: TextbookCatalogRow): TextbookChapterOutline[] {
  try {
    const v = JSON.parse(row.outline_json) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .map((ch, i) => {
        const o = ch as Record<string, unknown>;
        const index = Number(o.index ?? i + 1);
        const title = String(o.title ?? `第${index}章`);
        const kp = Array.isArray(o.knowledgePoints)
          ? o.knowledgePoints.map((x) => String(x ?? '').trim()).filter(Boolean)
          : [];
        return { index, title, knowledgePoints: kp.slice(0, 24) };
      })
      .filter((c) => c.title);
  } catch {
    return [];
  }
}
