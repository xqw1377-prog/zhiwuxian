/**
 * ZHI · 课件库管理（B→A 人工复核）
 */

import {
  getCoursewareById,
  listCoursewareCatalog,
  parseCoursewareRow,
  reviewCoursewareGrade,
  type CoursewareQualityGrade,
} from '../db/zhi-courseware-catalog-schema';

export type CoursewareAdminItemDto = ReturnType<typeof parseCoursewareRow> & {
  status: string;
  updatedAt: number;
};

export type CoursewareCatalogAdminDto = {
  total: number;
  pendingReview: number;
  items: CoursewareAdminItemDto[];
};

export function buildCoursewareCatalogAdmin(opts?: {
  grade?: CoursewareQualityGrade;
  pendingReviewOnly?: boolean;
  limit?: number;
}): CoursewareCatalogAdminDto {
  const items = listCoursewareCatalog({
    grade: opts?.grade,
    pendingReviewOnly: opts?.pendingReviewOnly,
    limit: opts?.limit ?? 40,
  }).map((row) => ({
    ...parseCoursewareRow(row),
    status: row.status,
    updatedAt: row.updated_at,
  }));

  const pendingReview = listCoursewareCatalog({ pendingReviewOnly: true, limit: 200 }).length;

  return {
    total: items.length,
    pendingReview,
    items,
  };
}

export function promoteCoursewareToGrade(
  coursewareId: string,
  targetGrade: CoursewareQualityGrade = 'A',
): CoursewareAdminItemDto | null {
  const updated = reviewCoursewareGrade(coursewareId, {
    qualityGrade: targetGrade,
    status: 'active',
  });
  if (!updated) return null;
  return {
    ...parseCoursewareRow(updated),
    status: updated.status,
    updatedAt: updated.updated_at,
  };
}

export type CoursewareReviewAction = 'promote_a' | 'promote_s' | 'demote_b' | 'archive';

function toAdminItem(row: NonNullable<ReturnType<typeof reviewCoursewareGrade>>): CoursewareAdminItemDto {
  return {
    ...parseCoursewareRow(row),
    status: row.status,
    updatedAt: row.updated_at,
  };
}

/** 课件审核列表（B 级待复核优先） */
export function listCoursewareForReview(opts?: {
  grade?: CoursewareQualityGrade;
  pendingReviewOnly?: boolean;
  limit?: number;
}): CoursewareCatalogAdminDto {
  return buildCoursewareCatalogAdmin(opts);
}

/** 人工复核：升 A / 降 B / 归档 */
export function reviewCourseware(
  coursewareId: string,
  action: CoursewareReviewAction,
): CoursewareAdminItemDto | null {
  const id = coursewareId.trim();
  if (!id) return null;

  switch (action) {
    case 'promote_a': {
      const promoted = promoteCoursewareToGrade(id, 'A');
      return promoted;
    }
    case 'promote_s': {
      const promoted = promoteCoursewareToGrade(id, 'S');
      return promoted;
    }
    case 'demote_b': {
      const demoted = reviewCoursewareGrade(id, { qualityGrade: 'B', status: 'active' });
      return demoted ? toAdminItem(demoted) : null;
    }
    case 'archive': {
      const existing = getCoursewareById(id);
      if (!existing) return null;
      const archived = reviewCoursewareGrade(id, {
        qualityGrade: existing.quality_grade as CoursewareQualityGrade,
        status: 'archived',
      });
      return archived ? toAdminItem(archived) : null;
    }
    default:
      return null;
  }
}
