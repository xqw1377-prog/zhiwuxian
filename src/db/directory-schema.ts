/**
 * WUXIAN · 【ZHI】固定与动态双轨认知目录
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getLearningDb } from '../../server/wuxian-learning-db';
import {
  detectSchoolPathway,
  directoryTitleAllowedForPathway,
  getPinnedDirectoryTemplates,
  isUsIntlDirectoryTitle,
  normalizeAnchorMajorName,
  normalizeAnchorSchoolName,
  pinnedSuffixesForPathway,
  pinnedSuffixesToDrop,
} from '../services/school-pathway';
import {
  generateDefaultDirectories,
  getSchoolAnchorProfile,
  listZhiDirectories,
  type ZhiNodeType,
} from './zhi-cloud-schema';

export type DirectoryType = 'STRATEGIC_GOAL' | 'ACADEMIC_SUBJECT' | 'ERROR_BANK' | 'CUSTOM';

export interface CognitiveDirectoryRow {
  directory_id: string;
  user_id: string;
  title: string;
  type: DirectoryType;
  is_pinned: number;
  parent_id: string | null;
  display_order: number;
  created_at: number;
}

export interface DirectoryItemDto {
  id: string;
  title: string;
  type: DirectoryType;
  isPinned: boolean;
  parentId: string | null;
  displayOrder: number;
}

let schemaReady = false;

export function initializeDirectorySchema(): void {
  if (schemaReady) return;
  const db = getLearningDb();
  try {
    const sqlPath = join(__dirname, '..', 'main', 'database', 'directory-schema.sql');
    db.exec(readFileSync(sqlPath, 'utf8'));
  } catch {
    db.exec(`
      CREATE TABLE IF NOT EXISTS zhi_cognitive_directory (
        directory_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        is_pinned INTEGER DEFAULT 0,
        parent_id TEXT,
        display_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_zhi_dir_user ON zhi_cognitive_directory(user_id);
    `);
  }
  schemaReady = true;
}

function dirIdForUser(userId: string, suffix: string): string {
  return `${userId}::${suffix}`;
}

function safeDirSeg(s: string): string {
  return s.replace(/[^\w\u4e00-\u9fff\-]+/g, '_').slice(0, 32) || 'X';
}

const CLOUD_COGNITIVE_MARK = '::CLOUD_MOUNT_';

export function anchorGoalDirectoryId(userId: string, school: string, major: string): string {
  const cleanSchool = normalizeAnchorSchoolName(school);
  const cleanMajor = normalizeAnchorMajorName(major);
  return dirIdForUser(userId.trim(), `DIR_GOAL_${safeDirSeg(cleanSchool)}_${safeDirSeg(cleanMajor)}`);
}

/** 删除与当前路径/航标冲突的 PINNED（含旧梦校 DIR_GOAL_*、托福/高考残留标题） */
function purgeIncompatiblePinnedDirectories(
  uid: string,
  pathway: ReturnType<typeof detectSchoolPathway>,
  keepGoalId: string | null,
): void {
  const db = getLearningDb();
  const stale = db
    .prepare(`SELECT directory_id, title FROM zhi_cognitive_directory WHERE user_id = ? AND is_pinned = 1`)
    .all(uid) as { directory_id: string; title: string }[];
  const del = db.prepare(`DELETE FROM zhi_cognitive_directory WHERE directory_id = ? AND user_id = ?`);
  for (const row of stale) {
    const isStaleGoal =
      row.directory_id.includes('::DIR_GOAL_') && (!keepGoalId || row.directory_id !== keepGoalId);
    const badTitle = !directoryTitleAllowedForPathway(row.title, pathway);
    const badUsTitle = pathway === 'domestic_cn' && isUsIntlDirectoryTitle(row.title);
    const staleCloudMount =
      row.directory_id.includes(CLOUD_COGNITIVE_MARK) && (badTitle || badUsTitle);
    if (isStaleGoal || badTitle || badUsTitle || staleCloudMount) {
      del.run(row.directory_id, uid);
    }
  }
  // 非 PINNED 但标题明显属于其他路径的云挂载残留
  const loose = db
    .prepare(`SELECT directory_id, title FROM zhi_cognitive_directory WHERE user_id = ? AND is_pinned = 0`)
    .all(uid) as { directory_id: string; title: string }[];
  for (const row of loose) {
    if (!row.directory_id.includes(CLOUD_COGNITIVE_MARK) && !directoryTitleAllowedForPathway(row.title, pathway)) {
      del.run(row.directory_id, uid);
    }
  }
}

/** 按梦校路径写入 PINNED 模板，并移除与当前路径冲突的旧模板 */
export function reconcilePinnedDirectoriesForPathway(
  userId: string,
  pathway: ReturnType<typeof detectSchoolPathway>,
  anchor?: { school?: string; major?: string },
): void {
  initializeDirectorySchema();
  const uid = userId.trim();
  const db = getLearningDb();
  const keepGoalId =
    anchor?.school?.trim() && anchor?.major?.trim()
      ? anchorGoalDirectoryId(uid, anchor.school, anchor.major)
      : null;
  for (const suffix of pinnedSuffixesToDrop(pathway)) {
    db.prepare(`DELETE FROM zhi_cognitive_directory WHERE directory_id = ? AND user_id = ?`).run(
      dirIdForUser(uid, suffix),
      uid,
    );
  }
  purgeIncompatiblePinnedDirectories(uid, pathway, keepGoalId);
  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO zhi_cognitive_directory
      (directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(directory_id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      is_pinned = 1,
      parent_id = excluded.parent_id,
      display_order = excluded.display_order
  `);
  for (const t of getPinnedDirectoryTemplates(pathway)) {
    const id = dirIdForUser(uid, t.suffix);
    const parentId = t.parentSuffix ? dirIdForUser(uid, t.parentSuffix) : null;
    insert.run(id, uid, t.title, t.type, parentId, t.displayOrder, now);
  }
}

export function seedPinnedDirectories(userId: string): void {
  const profile = getSchoolAnchorProfile(userId.trim());
  if (!profile?.school?.trim()) return;
  const pathway = detectSchoolPathway(profile.school, profile.major, {
    currentSchool: profile.currentSchool,
    currentRegion: profile.currentRegion,
    targetSchoolRegion: profile.targetSchoolRegion,
    currentGrade: profile.currentGrade,
  });
  reconcilePinnedDirectoriesForPathway(userId, pathway, {
    school: profile.school,
    major: profile.major,
  });
}

function pinnedRowsNeedFullCloudSync(
  uid: string,
  pathway: ReturnType<typeof detectSchoolPathway>,
  profile: { school: string; major: string },
): boolean {
  const goalId = anchorGoalDirectoryId(uid, profile.school, profile.major);
  const drop = pinnedSuffixesToDrop(pathway);
  const required = pinnedSuffixesForPathway(pathway);
  const rows = getLearningDb()
    .prepare(
      `SELECT directory_id, title, is_pinned FROM zhi_cognitive_directory WHERE user_id = ? AND is_pinned = 1`,
    )
    .all(uid) as { directory_id: string; title: string; is_pinned: number }[];

  if (!rows.some((r) => r.directory_id === goalId)) return true;
  for (const suffix of required) {
    const id = dirIdForUser(uid, suffix);
    if (!rows.some((r) => r.directory_id === id)) return true;
  }
  return rows.some((row) => {
    if (drop.some((suffix) => row.directory_id.endsWith(`::${suffix}`))) return true;
    if (row.directory_id.includes('::DIR_GOAL_') && row.directory_id !== goalId) return true;
    if (!directoryTitleAllowedForPathway(row.title, pathway)) return true;
    if (pathway === 'domestic_cn' && isUsIntlDirectoryTitle(row.title)) return true;
    if (
      row.directory_id.includes(CLOUD_COGNITIVE_MARK) &&
      !directoryTitleAllowedForPathway(row.title, pathway)
    ) {
      return true;
    }
    return false;
  });
}

/** 航标已入库：先清理 PINNED，再按需重算云节点并挂载到侧栏 */
export function ensureSidebarMatchesAnchor(userId: string): boolean {
  const profile = getSchoolAnchorProfile(userId.trim());
  if (!profile?.school?.trim()) return false;
  const uid = profile.userId;
  const school = normalizeAnchorSchoolName(profile.school);
  const major = normalizeAnchorMajorName(profile.major);
  const pathway = detectSchoolPathway(school, major, {
    currentSchool: profile.currentSchool,
    currentRegion: profile.currentRegion,
    targetSchoolRegion: profile.targetSchoolRegion,
    currentGrade: profile.currentGrade,
  });
  reconcilePinnedDirectoriesForPathway(uid, pathway, { school, major });
  if (!pinnedRowsNeedFullCloudSync(uid, pathway, { school, major })) return false;
  generateDefaultDirectories({
    userId: uid,
    school,
    major,
    currentGrade: profile.currentGrade,
    currentSchool: profile.currentSchool,
    currentRegion: profile.currentRegion,
    targetSchoolRegion: profile.targetSchoolRegion,
  });
  syncCognitiveDirectoriesFromCloud(uid, school, major, {
    currentGrade: profile.currentGrade,
    targetApplyAt: profile.targetApplyAt,
    currentSchool: profile.currentSchool,
    currentRegion: profile.currentRegion,
    targetSchoolRegion: profile.targetSchoolRegion,
  });
  return true;
}

/** @deprecated 使用 ensureSidebarMatchesAnchor */
export function alignCognitiveDirectoriesWithAnchor(userId: string): boolean {
  return ensureSidebarMatchesAnchor(userId);
}

function rowToDto(row: CognitiveDirectoryRow): DirectoryItemDto {
  return {
    id: row.directory_id,
    title: row.title,
    type: row.type as DirectoryType,
    isPinned: Boolean(row.is_pinned),
    parentId: row.parent_id,
    displayOrder: Number(row.display_order ?? 0),
  };
}

export type AnchorProfileDto = {
  school: string;
  major: string;
  currentGrade: string;
  targetApplyAt: string;
  currentSchool: string;
  currentRegion: string;
  targetSchoolRegion: string;
};

export function listUserDirectories(userId: string): {
  pinned: DirectoryItemDto[];
  custom: DirectoryItemDto[];
  anchorProfile: AnchorProfileDto | null;
} {
  initializeDirectorySchema();
  seedPinnedDirectories(userId);
  const uid = userId.trim();
  const rows = getLearningDb()
    .prepare(`
      SELECT directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at
      FROM zhi_cognitive_directory
      WHERE user_id = ?
      ORDER BY is_pinned DESC, display_order ASC, created_at ASC
    `)
    .all(uid) as CognitiveDirectoryRow[];

  const profile = getSchoolAnchorProfile(uid);
  if (profile?.school?.trim()) {
    reconcilePinnedDirectoriesForPathway(
      uid,
      detectSchoolPathway(profile.school, profile.major, {
        currentSchool: profile.currentSchool,
        currentRegion: profile.currentRegion,
        targetSchoolRegion: profile.targetSchoolRegion,
        currentGrade: profile.currentGrade,
      }),
      { school: profile.school, major: profile.major },
    );
    ensureSidebarMatchesAnchor(uid);
  }
  const refreshed = getLearningDb()
    .prepare(`
      SELECT directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at
      FROM zhi_cognitive_directory
      WHERE user_id = ?
      ORDER BY is_pinned DESC, display_order ASC, created_at ASC
    `)
    .all(uid) as CognitiveDirectoryRow[];
  const all = refreshed.map(rowToDto);
  let pinned = all.filter((d) => d.isPinned);
  let custom = all.filter((d) => !d.isPinned);
  if (profile) {
    const pathway = detectSchoolPathway(profile.school, profile.major, {
      currentSchool: profile.currentSchool,
      currentRegion: profile.currentRegion,
      targetSchoolRegion: profile.targetSchoolRegion,
      currentGrade: profile.currentGrade,
    });
    const drop = pinnedSuffixesToDrop(pathway);
    const activeGoalId = anchorGoalDirectoryId(uid, profile.school, profile.major);
    const allow = (d: DirectoryItemDto) => directoryTitleAllowedForPathway(d.title, pathway);
    pinned = pinned
      .filter((d) => !drop.some((suffix) => d.id.endsWith(`::${suffix}`)))
      .filter((d) => !d.id.includes('::DIR_GOAL_') || d.id === activeGoalId)
      .filter(allow);
    custom = custom.filter(allow);
  }
  const anchorProfile = profile
    ? {
        school: profile.school,
        major: profile.major,
        currentGrade: profile.currentGrade,
        targetApplyAt: profile.targetApplyAt,
        currentSchool: profile.currentSchool,
        currentRegion: profile.currentRegion,
        targetSchoolRegion: profile.targetSchoolRegion,
      }
    : null;
  return {
    pinned,
    custom,
    anchorProfile,
  };
}

export function createCustomDirectory(userId: string, title: string): DirectoryItemDto {
  initializeDirectorySchema();
  seedPinnedDirectories(userId);
  const uid = userId.trim();
  const clean = title.trim();
  if (!clean) throw new Error('目录名称不能为空');

  const id = `${uid}::CUSTOM_${Date.now()}`;
  const now = Date.now();
  const maxOrder =
    (getLearningDb()
      .prepare(`SELECT COALESCE(MAX(display_order), 0) AS m FROM zhi_cognitive_directory WHERE user_id = ? AND is_pinned = 0`)
      .get(uid) as { m: number })?.m ?? 0;

  getLearningDb()
    .prepare(`
      INSERT INTO zhi_cognitive_directory
        (directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at)
      VALUES (?, ?, ?, 'CUSTOM', 0, NULL, ?, ?)
    `)
    .run(id, uid, clean.startsWith('📂') ? clean : `📂 ${clean}`, maxOrder + 1, now);

  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_cognitive_directory WHERE directory_id = ?`)
    .get(id) as CognitiveDirectoryRow;
  return rowToDto(row);
}

export function deleteCustomDirectory(userId: string, directoryId: string): boolean {
  initializeDirectorySchema();
  const uid = userId.trim();
  const result = getLearningDb()
    .prepare(`DELETE FROM zhi_cognitive_directory WHERE directory_id = ? AND user_id = ? AND is_pinned = 0`)
    .run(directoryId, uid);
  return result.changes > 0;
}

export function getDirectoryById(userId: string, directoryId: string): DirectoryItemDto | null {
  initializeDirectorySchema();
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_cognitive_directory WHERE directory_id = ? AND user_id = ?`)
    .get(directoryId, userId.trim()) as CognitiveDirectoryRow | undefined;
  return row ? rowToDto(row) : null;
}

function cloudNodeToDirectoryType(nodeType: ZhiNodeType): DirectoryType {
  if (nodeType === 'ERROR_BANK') return 'ERROR_BANK';
  if (nodeType === 'MATERIAL') return 'ACADEMIC_SUBJECT';
  if (nodeType === 'ESSAY_ESSENTIAL') return 'STRATEGIC_GOAL';
  return 'STRATEGIC_GOAL';
}

function formatTargetApplyLabel(targetApplyAt: string): string {
  const raw = targetApplyAt.trim();
  if (!raw) return '';
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (m) return `${m[1]}年${Number(m[2])}月入学`;
  return raw;
}

/** 云锚点坍缩后：在左侧认知目录挂载梦校战略轨（与 zhi_cloud_directories 对齐） */
export function upsertSchoolAnchorDirectory(
  userId: string,
  school: string,
  major: string,
  meta?: {
    currentGrade?: string;
    targetApplyAt?: string;
    currentSchool?: string;
    currentRegion?: string;
    targetSchoolRegion?: string;
  },
): DirectoryItemDto {
  initializeDirectorySchema();
  seedPinnedDirectories(userId);
  const uid = userId.trim();
  const cleanSchool = school.trim();
  const cleanMajor = major.trim();
  const grade = meta?.currentGrade?.trim() ?? '';
  const applyLabel = formatTargetApplyLabel(meta?.targetApplyAt ?? '');
  const id = anchorGoalDirectoryId(uid, cleanSchool, cleanMajor);
  const parts = [`🎯 目标：${cleanSchool} · ${cleanMajor}`];
  if (grade) parts.push(grade);
  if (applyLabel) parts.push(applyLabel);
  const title = parts.join(' · ');
  const now = Date.now();

  getLearningDb()
    .prepare(`
      INSERT INTO zhi_cognitive_directory
        (directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at)
      VALUES (?, ?, ?, 'STRATEGIC_GOAL', 1, NULL, 0, ?)
      ON CONFLICT(directory_id) DO UPDATE SET
        title = excluded.title,
        display_order = 0
    `)
    .run(id, uid, title, now);

  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_cognitive_directory WHERE directory_id = ?`)
    .get(id) as CognitiveDirectoryRow;
  return rowToDto(row);
}

/** 将云目录节点同步到左侧固定战略轨清单 */
export function syncCognitiveDirectoriesFromCloud(
  userId: string,
  school: string,
  major: string,
  meta: {
    currentGrade: string;
    targetApplyAt: string;
    currentSchool?: string;
    currentRegion?: string;
    targetSchoolRegion?: string;
  },
): DirectoryItemDto {
  initializeDirectorySchema();
  const uid = userId.trim();
  const db = getLearningDb();
  const pathway = detectSchoolPathway(school, major, { ...meta, currentGrade: meta.currentGrade });
  reconcilePinnedDirectoriesForPathway(uid, pathway, { school, major });
  const anchor = upsertSchoolAnchorDirectory(uid, school, major, meta);
  const cloudDirs = listZhiDirectories(uid, school, major);

  db.prepare(
    `DELETE FROM zhi_cognitive_directory WHERE user_id = ? AND directory_id LIKE ?`,
  ).run(uid, `%${CLOUD_COGNITIVE_MARK}%`);

  const insert = db.prepare(`
    INSERT INTO zhi_cognitive_directory
      (directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(directory_id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      parent_id = excluded.parent_id,
      display_order = excluded.display_order
  `);

  let order = 1;
  const now = Date.now();
  for (const c of cloudDirs) {
    if (c.nodeType === 'STRATEGY') continue;
    if (!directoryTitleAllowedForPathway(c.nodeName, pathway)) continue;
    const id = `${uid}${CLOUD_COGNITIVE_MARK}${c.dirId}`;
    insert.run(
      id,
      uid,
      c.nodeName,
      cloudNodeToDirectoryType(c.nodeType),
      anchor.id,
      order++,
      now,
    );
  }

  return anchor;
}
