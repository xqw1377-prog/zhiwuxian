/**
 * 管理后台 · ZHI 学习数据运营（对标主产品能力）
 */

import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { listAssessmentPapers } from '../db/zhi-assessment-schema';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { aggregateLearnerEvidence } from './learner-evidence-hub';
import { getLearningPath, rebuildLearningPathFromEvidence } from './learning-path-engine';
import { getAssessmentHub } from './zhi-learning-assessment';
import { buildCoursewareCatalogAdmin } from './zhi-courseware-admin';

export type AdminZhiPlatformStats = {
  learningPathUsers: number;
  assessmentPapers7d: number;
  pendingCoursewareReview: number;
  paidOrders30d: number;
  paidRevenueCny30d: number;
};

export type AdminUserLearningSnapshot = {
  userId: string;
  anchor: {
    school: string | null;
    grade: string | null;
    intakeYear: string | null;
  };
  path: {
    hasPath: boolean;
    targetSchool: string | null;
    challengeIndex: number | null;
    phaseCount: number;
    todayFocus: string | null;
    nextAssessmentDue: string | null;
    dataCompletenessPct: number | null;
    updatedAt: string | null;
  };
  evidence: {
    weaknessCount: number;
    topWeaknesses: Array<{ title: string; subjectName: string; severity: number }>;
    pushHeadline: string;
    missingSignals: string[];
  };
  assessment: {
    subjectCount: number;
    pendingActive: number;
    recentPapers: Array<{
      id: string;
      title: string;
      subjectId: string;
      status: string;
      paperType: string;
      createdAt: number;
    }>;
  };
};

export function queryAdminZhiPlatformStats(): AdminZhiPlatformStats {
  const db = getLearningDb();
  const learningPathUsers = (
    db.prepare('SELECT COUNT(*) as c FROM zhi_learning_path').get() as { c: number }
  ).c;
  const assessmentPapers7d = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM zhi_assessment_papers WHERE created_at > ?`,
      )
      .get(Math.floor(Date.now() / 1000) - 7 * 86400) as { c: number }
  ).c;
  const pendingCoursewareReview = buildCoursewareCatalogAdmin({
    pendingReviewOnly: true,
    limit: 200,
  }).pendingReview;

  let paidOrders30d = 0;
  let paidRevenueCny30d = 0;
  try {
    const paid = db
      .prepare(
        `SELECT COUNT(*) as orders, COALESCE(SUM(amount_cny), 0) as revenue
         FROM payment_orders
         WHERE status = 'PAID' AND paid_at > datetime('now', '-30 days')`,
      )
      .get() as { orders: number; revenue: number };
    paidOrders30d = paid.orders;
    paidRevenueCny30d = Math.round(Number(paid.revenue) * 100) / 100;
  } catch {
    /* payment_orders 可能未初始化 */
  }

  return {
    learningPathUsers,
    assessmentPapers7d,
    pendingCoursewareReview,
    paidOrders30d,
    paidRevenueCny30d,
  };
}

export function getAdminUserLearningSnapshot(userId: string): AdminUserLearningSnapshot {
  const uid = userId.trim();
  const anchorRow = getSchoolAnchorProfile(uid);
  const path = getLearningPath(uid);
  const evidence = aggregateLearnerEvidence(uid);
  let hub: ReturnType<typeof getAssessmentHub> | null = null;
  try {
    hub = getAssessmentHub(uid);
  } catch {
    hub = null;
  }
  const papers = listAssessmentPapers(uid, 12);

  return {
    userId: uid,
    anchor: {
      school: anchorRow?.school ?? null,
      grade: anchorRow?.currentGrade ?? null,
      intakeYear: anchorRow?.targetApplyAt ?? null,
    },
    path: {
      hasPath: Boolean(path),
      targetSchool: path?.targetSchool ?? null,
      challengeIndex: path?.challengeIndex ?? null,
      phaseCount: path?.phases?.length ?? 0,
      todayFocus: path?.todayFocus?.title ?? null,
      nextAssessmentDue: path?.nextAssessmentDue ?? null,
      dataCompletenessPct: path?.dataCompletenessPct ?? null,
      updatedAt: path?.updatedAt != null ? String(path.updatedAt) : null,
    },
    evidence: {
      weaknessCount: evidence.weaknesses.length,
      topWeaknesses: evidence.weaknesses.slice(0, 5).map((w) => ({
        title: w.title,
        subjectName: w.subjectName,
        severity: w.severity,
      })),
      pushHeadline: evidence.pushHeadline,
      missingSignals: evidence.missingSignals,
    },
    assessment: {
      subjectCount: hub?.subjects?.length ?? 0,
      pendingActive: hub?.pendingActiveExams ?? 0,
      recentPapers: papers.map((p) => ({
        id: p.id,
        title: p.title,
        subjectId: p.subject_id,
        status: p.status,
        paperType: p.paper_type,
        createdAt: p.created_at,
      })),
    },
  };
}

export async function adminRebuildUserLearningPath(userId: string): Promise<{
  ok: boolean;
  path: { targetSchool: string | null; phaseCount: number } | null;
}> {
  const doc = await rebuildLearningPathFromEvidence(userId.trim());
  if (!doc) return { ok: false, path: null };
  return {
    ok: true,
    path: { targetSchool: doc.targetSchool, phaseCount: doc.phases?.length ?? 0 },
  };
}
