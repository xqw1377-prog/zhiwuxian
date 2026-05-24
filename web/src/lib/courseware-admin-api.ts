import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';
import type { CoursewareItemDto } from './video-learn-api';

export type CoursewareAdminItemDto = CoursewareItemDto & {
  status: string;
  updatedAt: number;
};

export type CoursewareCatalogAdminDto = {
  total: number;
  pendingReview: number;
  items: CoursewareAdminItemDto[];
};

export type CoursewareReviewAction = 'promote_a' | 'promote_s' | 'demote_b' | 'archive';

export async function listCoursewareForReview(opts?: {
  pendingReviewOnly?: boolean;
  grade?: string;
}): Promise<CoursewareCatalogAdminDto | null> {
  const q = new URLSearchParams();
  if (opts?.pendingReviewOnly) q.set('pendingReview', '1');
  if (opts?.grade) q.set('grade', opts.grade);
  const res = await authFetch(`/api/v3.5/zhi/courseware/admin/list?${q.toString()}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<CoursewareCatalogAdminDto>(json);
}

export async function reviewCourseware(
  coursewareId: string,
  action: CoursewareReviewAction,
): Promise<CoursewareAdminItemDto | null> {
  const res = await authFetch('/api/v3.5/zhi/courseware/admin/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coursewareId, action }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  const d = unwrapEnvelope<{ courseware?: CoursewareAdminItemDto }>(json);
  return d.courseware ?? null;
}

/** @deprecated 使用 listCoursewareForReview */
export const fetchCoursewareCatalogAdmin = listCoursewareForReview;

/** @deprecated 使用 reviewCourseware */
export async function reviewCoursewareGrade(
  coursewareId: string,
  qualityGrade: 'S' | 'A' | 'B' | 'C',
): Promise<CoursewareAdminItemDto | null> {
  const action: CoursewareReviewAction =
    qualityGrade === 'A' || qualityGrade === 'S' ? 'promote_a' : 'demote_b';
  return reviewCourseware(coursewareId, action);
}
