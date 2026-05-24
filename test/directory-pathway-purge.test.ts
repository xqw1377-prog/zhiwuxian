import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const testDataRoot = mkdtempSync(join(tmpdir(), 'wuxian-dir-purge-'));
process.env.WUXIAN_DATA_DIR = testDataRoot;
process.env.VITEST = 'true';

import { getLearningDb, resetLearningDbForTests } from '../server/wuxian-learning-db';
import {
  initializeDirectorySchema,
  reconcilePinnedDirectoriesForPathway,
  listUserDirectories,
} from '../src/db/directory-schema';
import { initializeZhiCloudSchema, saveSchoolAnchorProfile } from '../src/db/zhi-cloud-schema';

function dirId(userId: string, suffix: string): string {
  return `${userId}::${suffix}`;
}

describe('pathway switch purge (integration)', () => {
  const userId = 'test-pathway-purge-user';

  beforeEach(() => {
    resetLearningDbForTests();
    initializeDirectorySchema();
    initializeZhiCloudSchema();
    const db = getLearningDb();
    db.prepare(`DELETE FROM zhi_cognitive_directory WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM zhi_school_anchor WHERE user_id = ?`).run(userId);
  });

  afterAll(() => {
    try {
      rmSync(testDataRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('清华 → 校内成长：侧栏不含托福/旧清华航标', () => {
    reconcilePinnedDirectoriesForPathway(userId, 'domestic_cn', {
      school: '清华大学',
      major: '计算机',
    });
    const db = getLearningDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO zhi_cognitive_directory (directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at)
       VALUES (?, ?, ?, 'ACADEMIC_SUBJECT', 1, NULL, 1, ?)`,
    ).run(dirId(userId, 'DIR_GOAL_清华大学_计算机'), userId, '🎯 目标：清华大学 · 计算机', now);
    db.prepare(
      `INSERT INTO zhi_cognitive_directory (directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at)
       VALUES (?, ?, ?, 'ACADEMIC_SUBJECT', 1, NULL, 2, ?)`,
    ).run(dirId(userId, 'DIR_TOEFL'), userId, '🗣️ 托福多模态语言战舱', now);

    saveSchoolAnchorProfile({
      userId,
      school: '校内成长目标',
      major: '单科提升·数学',
      currentGrade: '小学五年级',
      targetApplyAt: '2026-07',
      currentSchool: '实验小学',
      currentRegion: '广东深圳',
    });

    reconcilePinnedDirectoriesForPathway(userId, 'k12_stage', {
      school: '校内成长目标',
      major: '单科提升·数学',
    });

    const { pinned } = listUserDirectories(userId);
    const titles = pinned.map((d) => d.title).join('|');
    const ids = pinned.map((d) => d.id).join('|');

    expect(titles).not.toMatch(/托福|TOEFL|SAT|Common App|高考\/竞赛/);
    expect(titles).not.toMatch(/清华大学/);
    expect(ids).not.toMatch(/DIR_TOEFL|DIR_GAOKAO/);
    expect(titles).toMatch(/校内|数学|错题|周测/);
  });

  it('已保存清华航标但残留托福 PINNED：listUserDirectories 自动对齐为国内轨', () => {
    saveSchoolAnchorProfile({
      userId,
      school: '清华大学',
      major: '计算机',
      currentGrade: '高三',
      targetApplyAt: '2027-09',
      currentSchool: '深圳中学',
      currentRegion: '广东深圳',
      targetSchoolRegion: '北京',
    });
    const db = getLearningDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO zhi_cognitive_directory (directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at)
       VALUES (?, ?, ?, 'ACADEMIC_SUBJECT', 1, NULL, 2, ?)`,
    ).run(dirId(userId, 'DIR_TOEFL'), userId, '🗣️ 托福多模态语言战舱', now);
    db.prepare(
      `INSERT INTO zhi_cognitive_directory (directory_id, user_id, title, type, is_pinned, parent_id, display_order, created_at)
       VALUES (?, ?, ?, 'STRATEGIC_GOAL', 1, NULL, 0, ?)`,
    ).run(dirId(userId, 'DIR_GOAL_CMU'), userId, '🎯 目标：CMU · CS', now);

    const { pinned } = listUserDirectories(userId);
    const titles = pinned.map((d) => d.title).join('|');
    expect(titles).not.toMatch(/托福|TOEFL|SAT|Common App|CMU/);
    expect(titles).toMatch(/清华|高考|数学/);
  });
});
