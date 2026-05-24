/**
 * 教材指认 → 左侧学习目录挂载（与 zhi_textbook_catalog 联动）
 */

import {
  getTextbookById,
  listTextbooksForUser,
  parseTextbookOutline,
  type TextbookCatalogRow,
} from '../db/zhi-textbook-catalog-schema';
import {
  initializeDirectorySchema,
  type DirectoryItemDto,
} from '../db/directory-schema';
import { getLearningDb } from '../../server/wuxian-learning-db';

function rowToDto(row: {
  directory_id: string;
  title: string;
  type: string;
  is_pinned: number;
  parent_id: string | null;
  display_order: number;
}): DirectoryItemDto {
  return {
    id: row.directory_id,
    title: row.title,
    type: row.type as DirectoryItemDto['type'],
    isPinned: row.is_pinned === 1,
    parentId: row.parent_id,
    displayOrder: row.display_order,
  };
}

export function textbookDirectoryId(userId: string, catalogId: string): string {
  return `${userId.trim()}::BOOK_${catalogId}`;
}

export function parseCatalogIdFromDirectoryId(directoryId: string): string | null {
  const m = /::BOOK_(.+)$/.exec(directoryId);
  return m?.[1] ?? null;
}

export function upsertTextbookDirectory(userId: string, catalogId: string): DirectoryItemDto | null {
  const row = getTextbookById(catalogId);
  if (!row) return null;
  return upsertTextbookDirectoryFromRow(userId, row);
}

function upsertTextbookDirectoryFromRow(userId: string, row: TextbookCatalogRow): DirectoryItemDto {
  initializeDirectorySchema();
  const uid = userId.trim();
  const id = textbookDirectoryId(uid, row.id);
  const chapters = parseTextbookOutline(row);
  const total = chapters.length || 1;
  const prog = row.progress_chapter ?? 1;
  const pct = row.progress_pct ?? Math.round((prog / total) * 100);
  const title = `📚 ${row.subject ?? '综合'} · ${row.title.slice(0, 22)}`;
  const subtitle = `（${row.publisher} · ${prog}/${total}章 ${pct}%）`;

  const now = Date.now();
  getLearningDb()
    .prepare(
      `
    INSERT INTO zhi_cognitive_directory
      (directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at)
    VALUES (?, ?, ?, 'ACADEMIC_SUBJECT', 1, NULL, 15, ?)
    ON CONFLICT(directory_id) DO UPDATE SET
      title = excluded.title,
      display_order = excluded.display_order
  `,
    )
    .run(id, uid, `${title} ${subtitle}`, now);

  const saved = getLearningDb()
    .prepare(`SELECT * FROM zhi_cognitive_directory WHERE directory_id = ?`)
    .get(id) as {
    directory_id: string;
    title: string;
    type: string;
    is_pinned: number;
    parent_id: string | null;
    display_order: number;
  };
  return rowToDto(saved);
}

export function syncAllTextbookDirectories(userId: string): number {
  let n = 0;
  for (const row of listTextbooksForUser(userId)) {
    upsertTextbookDirectoryFromRow(userId, row);
    n += 1;
  }
  return n;
}
