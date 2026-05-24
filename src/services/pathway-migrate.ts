/**
 * 按梦校航标重算 PINNED 目录（清理错误路径下的托福/AP 等）
 */

import { getLearningDb } from '../../server/wuxian-learning-db';
import { ensureSidebarMatchesAnchor } from '../db/directory-schema';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import {
  detectSchoolPathway,
  normalizeAnchorMajorName,
  normalizeAnchorSchoolName,
  pinnedSuffixesToDrop,
  PATHWAY_LABEL,
  type SchoolPathway,
} from './school-pathway';

export type PathwayMigrateResult = {
  userId: string;
  pathway: SchoolPathway;
  pathwayLabel: string;
  droppedSuffixes: readonly string[];
  school: string;
  major: string;
};

export function listAnchorUserIds(): string[] {
  const rows = getLearningDb()
    .prepare(
      `SELECT user_id FROM zhi_school_anchor WHERE trim(target_school) != '' ORDER BY updated_at DESC`,
    )
    .all() as { user_id: string }[];
  return rows.map((r) => String(r.user_id).trim()).filter(Boolean);
}

export function migrateUserPathway(userId: string): PathwayMigrateResult | null {
  const uid = userId.trim();
  const anchor = getSchoolAnchorProfile(uid);
  if (!anchor?.school) return null;

  const school = normalizeAnchorSchoolName(anchor.school);
  const major = normalizeAnchorMajorName(anchor.major);
  const pathway = detectSchoolPathway(school, major, {
    currentSchool: anchor.currentSchool,
    currentRegion: anchor.currentRegion,
    targetSchoolRegion: anchor.targetSchoolRegion,
    currentGrade: anchor.currentGrade,
  });
  const droppedSuffixes = pinnedSuffixesToDrop(pathway);
  ensureSidebarMatchesAnchor(uid);

  return {
    userId: uid,
    pathway,
    pathwayLabel: PATHWAY_LABEL[pathway],
    droppedSuffixes,
    school,
    major,
  };
}

export function migrateAllAnchoredUsers(): PathwayMigrateResult[] {
  const out: PathwayMigrateResult[] = [];
  for (const uid of listAnchorUserIds()) {
    const r = migrateUserPathway(uid);
    if (r) out.push(r);
  }
  return out;
}
