import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { detectSchoolPathway, getDefaultCloudNodes } from '../services/school-pathway';

export type ZhiNodeType = 'STRATEGY' | 'ESSAY_ESSENTIAL' | 'ERROR_BANK' | 'MATERIAL';
export type CloudSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export type ZhiCloudDirectory = {
  dirId: string;
  userId: string;
  targetSchool: string;
  targetMajor: string;
  nodeName: string;
  nodeType: ZhiNodeType;
  cloudSyncStatus: CloudSyncStatus;
  storageUrl: string | null;
  updatedAt: number;
};

export type ZhiCloudArtifact = {
  artifactId: string;
  userId: string;
  dirId: string;
  fileTitle: string;
  versionTag: string;
  storageProvider: string;
  cloudKey: string;
  cdnUrl: string | null;
  cloudSyncStatus: CloudSyncStatus;
  syncTimestamp: number;
};

export type SchoolAnchorProfile = {
  userId: string;
  school: string;
  major: string;
  currentGrade: string;
  targetApplyAt: string;
  currentSchool: string;
  currentRegion: string;
  targetSchoolRegion: string;
  updatedAt: number;
};

function ensureAnchorColumns(): void {
  const db = getLearningDb();
  const cols = new Set(
    (db.prepare(`PRAGMA table_info(zhi_school_anchor)`).all() as { name: string }[]).map((r) => r.name),
  );
  const add = (name: string) => {
    if (!cols.has(name)) db.exec(`ALTER TABLE zhi_school_anchor ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
  };
  add('current_school');
  add('current_region');
  add('target_school_region');
}

export function initializeZhiCloudSchema(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS zhi_school_anchor (
      user_id TEXT PRIMARY KEY,
      target_school TEXT NOT NULL,
      target_major TEXT NOT NULL,
      current_grade TEXT NOT NULL,
      target_apply_at TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS zhi_cloud_directories (
      dir_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      target_school TEXT NOT NULL,
      target_major TEXT NOT NULL,
      node_name TEXT NOT NULL,
      node_type TEXT CHECK(node_type IN ('STRATEGY', 'ESSAY_ESSENTIAL', 'ERROR_BANK', 'MATERIAL')),
      cloud_sync_status TEXT DEFAULT 'PENDING' CHECK(cloud_sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
      storage_url TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_cloud_directories_user ON zhi_cloud_directories(user_id);
    CREATE INDEX IF NOT EXISTS idx_zhi_cloud_directories_target ON zhi_cloud_directories(user_id, target_school, target_major);

    CREATE TABLE IF NOT EXISTS zhi_cloud_artifacts (
      artifact_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      dir_id TEXT NOT NULL,
      file_title TEXT NOT NULL,
      version_tag TEXT NOT NULL,
      storage_provider TEXT DEFAULT 'S3_COMPATIBLE',
      cloud_key TEXT NOT NULL,
      cdn_url TEXT,
      cloud_sync_status TEXT DEFAULT 'PENDING' CHECK(cloud_sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
      sync_timestamp INTEGER NOT NULL,
      FOREIGN KEY(dir_id) REFERENCES zhi_cloud_directories(dir_id)
    );
    CREATE INDEX IF NOT EXISTS idx_zhi_cloud_artifacts_user_dir ON zhi_cloud_artifacts(user_id, dir_id);
    CREATE INDEX IF NOT EXISTS idx_zhi_cloud_artifacts_user ON zhi_cloud_artifacts(user_id);
  `);
  ensureAnchorColumns();
}

function toDirRow(r: any): ZhiCloudDirectory {
  return {
    dirId: String(r.dir_id),
    userId: String(r.user_id),
    targetSchool: String(r.target_school),
    targetMajor: String(r.target_major),
    nodeName: String(r.node_name),
    nodeType: String(r.node_type) as ZhiNodeType,
    cloudSyncStatus: String(r.cloud_sync_status) as CloudSyncStatus,
    storageUrl: r.storage_url ? String(r.storage_url) : null,
    updatedAt: Number(r.updated_at),
  };
}

function toArtifactRow(r: any): ZhiCloudArtifact {
  return {
    artifactId: String(r.artifact_id),
    userId: String(r.user_id),
    dirId: String(r.dir_id),
    fileTitle: String(r.file_title),
    versionTag: String(r.version_tag),
    storageProvider: String(r.storage_provider ?? 'S3_COMPATIBLE'),
    cloudKey: String(r.cloud_key),
    cdnUrl: r.cdn_url ? String(r.cdn_url) : null,
    cloudSyncStatus: String(r.cloud_sync_status) as CloudSyncStatus,
    syncTimestamp: Number(r.sync_timestamp),
  };
}

export function listZhiDirectories(userId: string, school?: string, major?: string): ZhiCloudDirectory[] {
  initializeZhiCloudSchema();
  const db = getLearningDb();
  const uid = userId.trim();
  if (!uid) return [];
  if (school && major) {
    const rows = db
      .prepare(
        `SELECT * FROM zhi_cloud_directories WHERE user_id = ? AND target_school = ? AND target_major = ? ORDER BY updated_at DESC`,
      )
      .all(uid, school, major) as any[];
    return rows.map(toDirRow);
  }
  const rows = db
    .prepare(`SELECT * FROM zhi_cloud_directories WHERE user_id = ? ORDER BY updated_at DESC`)
    .all(uid) as any[];
  return rows.map(toDirRow);
}

export function listZhiArtifacts(userId: string, dirId?: string): ZhiCloudArtifact[] {
  initializeZhiCloudSchema();
  const db = getLearningDb();
  const uid = userId.trim();
  if (!uid) return [];
  const rows = dirId
    ? (db
        .prepare(
          `SELECT * FROM zhi_cloud_artifacts WHERE user_id = ? AND dir_id = ? ORDER BY sync_timestamp DESC`,
        )
        .all(uid, dirId) as any[])
    : (db.prepare(`SELECT * FROM zhi_cloud_artifacts WHERE user_id = ? ORDER BY sync_timestamp DESC`).all(uid) as any[]);
  return rows.map(toArtifactRow);
}

export function getZhiArtifact(userId: string, artifactId: string): ZhiCloudArtifact | null {
  initializeZhiCloudSchema();
  const db = getLearningDb();
  const row = db
    .prepare(`SELECT * FROM zhi_cloud_artifacts WHERE user_id = ? AND artifact_id = ?`)
    .get(userId.trim(), artifactId.trim()) as any;
  return row ? toArtifactRow(row) : null;
}

export function updateDirectorySyncStatus(userId: string, dirId: string, status: CloudSyncStatus, storageUrl?: string | null): void {
  initializeZhiCloudSchema();
  const db = getLearningDb();
  db.prepare(
    `UPDATE zhi_cloud_directories SET cloud_sync_status = ?, storage_url = COALESCE(?, storage_url), updated_at = ? WHERE user_id = ? AND dir_id = ?`,
  ).run(status, storageUrl ?? null, Date.now(), userId.trim(), dirId.trim());
}

export function upsertArtifact(rec: ZhiCloudArtifact): void {
  initializeZhiCloudSchema();
  const db = getLearningDb();
  db.prepare(
    `INSERT INTO zhi_cloud_artifacts (artifact_id, user_id, dir_id, file_title, version_tag, storage_provider, cloud_key, cdn_url, cloud_sync_status, sync_timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(artifact_id) DO UPDATE SET
       file_title = excluded.file_title,
       version_tag = excluded.version_tag,
       storage_provider = excluded.storage_provider,
       cloud_key = excluded.cloud_key,
       cdn_url = excluded.cdn_url,
       cloud_sync_status = excluded.cloud_sync_status,
       sync_timestamp = excluded.sync_timestamp`,
  ).run(
    rec.artifactId,
    rec.userId,
    rec.dirId,
    rec.fileTitle,
    rec.versionTag,
    rec.storageProvider,
    rec.cloudKey,
    rec.cdnUrl,
    rec.cloudSyncStatus,
    rec.syncTimestamp,
  );
}

export function saveSchoolAnchorProfile(input: {
  userId: string;
  school: string;
  major: string;
  currentGrade: string;
  targetApplyAt: string;
  currentSchool?: string;
  currentRegion?: string;
  targetSchoolRegion?: string;
}): SchoolAnchorProfile {
  initializeZhiCloudSchema();
  const uid = input.userId.trim();
  const now = Date.now();
  const row: SchoolAnchorProfile = {
    userId: uid,
    school: input.school.trim(),
    major: input.major.trim(),
    currentGrade: input.currentGrade.trim(),
    targetApplyAt: input.targetApplyAt.trim(),
    currentSchool: input.currentSchool?.trim() ?? '',
    currentRegion: input.currentRegion?.trim() ?? '',
    targetSchoolRegion: input.targetSchoolRegion?.trim() ?? '',
    updatedAt: now,
  };
  getLearningDb()
    .prepare(
      `INSERT INTO zhi_school_anchor (user_id, target_school, target_major, current_grade, target_apply_at, current_school, current_region, target_school_region, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         target_school = excluded.target_school,
         target_major = excluded.target_major,
         current_grade = excluded.current_grade,
         target_apply_at = excluded.target_apply_at,
         current_school = excluded.current_school,
         current_region = excluded.current_region,
         target_school_region = excluded.target_school_region,
         updated_at = excluded.updated_at`,
    )
    .run(
      uid,
      row.school,
      row.major,
      row.currentGrade,
      row.targetApplyAt,
      row.currentSchool,
      row.currentRegion,
      row.targetSchoolRegion,
      now,
    );
  return row;
}

export function getSchoolAnchorProfile(userId: string): SchoolAnchorProfile | null {
  initializeZhiCloudSchema();
  const uid = userId.trim();
  if (!uid) return null;
  const row = getLearningDb()
    .prepare(`SELECT * FROM zhi_school_anchor WHERE user_id = ?`)
    .get(uid) as
    | {
        user_id: string;
        target_school: string;
        target_major: string;
        current_grade: string;
        target_apply_at: string;
        updated_at: number;
      }
    | undefined;
  if (!row) return null;
  return {
    userId: String(row.user_id),
    school: String(row.target_school),
    major: String(row.target_major),
    currentGrade: String(row.current_grade),
    targetApplyAt: String(row.target_apply_at),
    currentSchool: String((row as { current_school?: string }).current_school ?? ''),
    currentRegion: String((row as { current_region?: string }).current_region ?? ''),
    targetSchoolRegion: String((row as { target_school_region?: string }).target_school_region ?? ''),
    updatedAt: Number(row.updated_at),
  };
}

export function anchorGeoContext(profile: SchoolAnchorProfile | null): {
  currentSchool: string;
  currentRegion: string;
  targetSchoolRegion: string;
} {
  if (!profile) return { currentSchool: '', currentRegion: '', targetSchoolRegion: '' };
  return {
    currentSchool: profile.currentSchool,
    currentRegion: profile.currentRegion,
    targetSchoolRegion: profile.targetSchoolRegion,
  };
}

export function generateDefaultDirectories(input: {
  userId: string;
  school: string;
  major: string;
  currentGrade?: string;
  currentSchool?: string;
  currentRegion?: string;
  targetSchoolRegion?: string;
}): ZhiCloudDirectory[] {
  initializeZhiCloudSchema();
  const db = getLearningDb();
  const now = Date.now();

  const userId = input.userId.trim();
  const school = input.school.trim();
  const major = input.major.trim();
  const schoolSeg = safeSeg(school);
  const majorSeg = safeSeg(major);

  const pathway = detectSchoolPathway(school, major, {
    currentSchool: input.currentSchool,
    currentRegion: input.currentRegion,
    targetSchoolRegion: input.targetSchoolRegion,
    currentGrade: input.currentGrade,
  });
  const nodes = getDefaultCloudNodes(school, major, pathway);

  // 同一账号切换梦校/校内目标时，清掉旧 target 的云节点，避免侧栏与云状态混杂
  const staleCloud = db
    .prepare(
      `SELECT dir_id FROM zhi_cloud_directories WHERE user_id = ? AND (target_school != ? OR target_major != ?)`,
    )
    .all(userId, school, major) as { dir_id: string }[];
  if (staleCloud.length) {
    const delArt = db.prepare(`DELETE FROM zhi_cloud_artifacts WHERE user_id = ? AND dir_id = ?`);
    const delDir = db.prepare(
      `DELETE FROM zhi_cloud_directories WHERE user_id = ? AND dir_id = ?`,
    );
    db.transaction(() => {
      for (const row of staleCloud) {
        delArt.run(userId, row.dir_id);
        delDir.run(userId, row.dir_id);
      }
    })();
  }

  const insert = db.prepare(
    `INSERT OR REPLACE INTO zhi_cloud_directories (dir_id, user_id, target_school, target_major, node_name, node_type, cloud_sync_status, storage_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NULL, ?)`,
  );

  const dirRoot = path.join(process.cwd(), 'data', 'zhi_cloud', userId, schoolSeg, majorSeg);
  ensureDir(dirRoot);
  for (const n of nodes) ensureDir(path.join(dirRoot, n.type));

  db.transaction(() => {
    for (const n of nodes) {
      const dirId = `${userId}::CLOUD_${schoolSeg}_${majorSeg}_${safeSeg(n.name)}`;
      insert.run(dirId, userId, school, major, n.name, n.type, now);
    }
  })();

  return listZhiDirectories(userId, school, major);
}

function safeSeg(s: string): string {
  const t = s.trim();
  if (!t) return 'X';
  const ascii = t.replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '');
  if (ascii.length >= 2) return ascii.slice(0, 32);
  return createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 12);
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

