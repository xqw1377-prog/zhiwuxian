/**
 * 管理后台 · 折叠时间 / QAL OKR 指标（只读聚合）
 */

import { getLearningDb } from '../../server/wuxian-learning-db';

export type CohortLevel = 'L0' | 'L1' | 'L2' | 'L3';

export type AdminFoldTimeUserRow = {
  userId: string;
  cohort: CohortLevel;
  targetSchool: string;
  pathCompletenessPct: number;
  papersReckoned28d: number;
  studyHours28d: number;
  foldEfficiencyIndex: number;
  avgMastery28d: number | null;
  qualifiedActiveLearner: boolean;
  weaknessImproved: boolean;
  studyMinutesWeek1: number;
  studyMinutesWeek4: number;
};

export type AdminFoldTimeOkrDto = {
  anchoredUsers: number;
  qualifiedActiveLearners: number;
  qalRatePct: number;
  weaknessImprovementRatePct: number;
  avgFoldIndexQAL: number;
  targets: {
    qalRatePct: number;
    weaknessImprovementRatePct: number;
    foldLiftMedian: number;
  };
};

export type AdminFoldTimePlatformDto = {
  pathUsersTotal: number;
  pathUsersActive28d: number;
  assessmentPapers7d: number;
  cohortCounts: Record<CohortLevel, number>;
  loopCompletionRatePct: number;
  avgFoldIndexL2L3: number;
  okr: AdminFoldTimeOkrDto;
  topUsers: AdminFoldTimeUserRow[];
  qalUsers: AdminFoldTimeUserRow[];
};

function cohortLevel(
  db: ReturnType<typeof getLearningDb>,
  userId: string,
): CohortLevel {
  const anchor = db
    .prepare(`SELECT target_school FROM zhi_school_anchor WHERE user_id = ?`)
    .get(userId) as { target_school: string } | undefined;
  if (!anchor?.target_school?.trim()) return 'L0';

  const pathRow = db
    .prepare(`SELECT path_json FROM zhi_learning_path WHERE user_id = ?`)
    .get(userId) as { path_json: string } | undefined;
  if (!pathRow?.path_json?.trim()) return 'L1';

  const attempts28 = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM zhi_assessment_attempts
         WHERE user_id = ? AND created_at > strftime('%s', 'now', '-28 days')`,
      )
      .get(userId) as { c: number }
  ).c;
  if (attempts28 < 1) return 'L1';

  let completeness = 0;
  try {
    const doc = JSON.parse(pathRow.path_json) as { dataCompletenessPct?: number };
    completeness = Number(doc.dataCompletenessPct ?? 0);
  } catch {
    completeness = 0;
  }

  const reckoned28 = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM zhi_assessment_papers
         WHERE user_id = ? AND status = 'reckoned'
           AND submitted_at > strftime('%s', 'now', '-28 days')`,
      )
      .get(userId) as { c: number }
  ).c;

  if (completeness >= 70 && reckoned28 >= 2) return 'L3';
  return 'L2';
}

function isQualifiedActiveLearner(db: ReturnType<typeof getLearningDb>, userId: string): boolean {
  const row = db
    .prepare(
      `SELECT json_extract(p.path_json, '$.dataCompletenessPct') AS completeness,
        (SELECT COUNT(*) FROM zhi_assessment_papers ap
         WHERE ap.user_id = p.user_id AND ap.status = 'reckoned'
           AND ap.submitted_at > strftime('%s', 'now', '-28 days')) AS reckoned_28d
       FROM zhi_learning_path p
       INNER JOIN zhi_school_anchor a ON a.user_id = p.user_id
       WHERE p.user_id = ?
         AND trim(a.target_school) != ''
         AND p.updated_at > strftime('%s', 'now', '-28 days')`,
    )
    .get(userId) as { completeness?: number; reckoned_28d?: number } | undefined;
  if (!row) return false;
  return Number(row.completeness ?? 0) >= 70 && Number(row.reckoned_28d ?? 0) >= 3;
}

function weaknessImproved(db: ReturnType<typeof getLearningDb>, userId: string): boolean {
  const subjects = db
    .prepare(
      `SELECT DISTINCT subject_id FROM zhi_assessment_papers
       WHERE user_id = ? AND status = 'reckoned'
         AND submitted_at > strftime('%s', 'now', '-28 days')`,
    )
    .all(userId) as { subject_id: string }[];

  for (const { subject_id } of subjects) {
    const attempts = db
      .prepare(
        `SELECT a.mastery_score, a.score_pct FROM zhi_assessment_attempts a
         INNER JOIN zhi_assessment_papers p ON p.id = a.paper_id
         WHERE a.user_id = ? AND p.subject_id = ?
           AND a.created_at > strftime('%s', 'now', '-28 days')
         ORDER BY a.created_at ASC`,
      )
      .all(userId, subject_id) as Array<{ mastery_score: number | null; score_pct: number | null }>;
    if (attempts.length < 2) continue;
    const s0 = Number(attempts[0].mastery_score ?? attempts[0].score_pct ?? 0);
    const s1 = Number(
      attempts[attempts.length - 1].mastery_score ?? attempts[attempts.length - 1].score_pct ?? 0,
    );
    if (s1 - s0 >= 10) return true;
  }
  return false;
}

function weeklyStudyMinutes(
  db: ReturnType<typeof getLearningDb>,
  userId: string,
  daysAgoStart: number,
  daysAgoEnd: number,
): number {
  const sec = (
    db
      .prepare(
        `SELECT COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions
         WHERE user_id = ? AND status = 'completed'
           AND start_time > datetime('now', ?)
           AND start_time <= datetime('now', ?)`,
      )
      .get(userId, `-${daysAgoStart} days`, `-${daysAgoEnd} days`) as { s: number }
  ).s;
  return Math.round(sec / 60);
}

export function getAdminFoldTimeUserMetrics(userId: string): AdminFoldTimeUserRow {
  const db = getLearningDb();
  const uid = userId.trim();

  const studySec28 = (
    db
      .prepare(
        `SELECT COALESCE(SUM(duration_seconds), 0) as s FROM zhi_learning_sessions
         WHERE user_id = ? AND status = 'completed'
           AND start_time > datetime('now', '-28 days')`,
      )
      .get(uid) as { s: number }
  ).s;
  const studyHours = Math.round((studySec28 / 3600) * 100) / 100;

  const reckoned28 = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM zhi_assessment_papers
         WHERE user_id = ? AND status = 'reckoned'
           AND submitted_at > strftime('%s', 'now', '-28 days')`,
      )
      .get(uid) as { c: number }
  ).c;

  const avgMastery = (
    db
      .prepare(
        `SELECT AVG(mastery_score) as m FROM zhi_assessment_attempts
         WHERE user_id = ? AND created_at > strftime('%s', 'now', '-28 days')`,
      )
      .get(uid) as { m: number | null }
  ).m;

  const pathRow = db
    .prepare(`SELECT path_json FROM zhi_learning_path WHERE user_id = ?`)
    .get(uid) as { path_json: string } | undefined;

  let completeness = 0;
  let targetSchool = '—';
  if (pathRow?.path_json) {
    try {
      const doc = JSON.parse(pathRow.path_json) as {
        dataCompletenessPct?: number;
        targetSchool?: string;
      };
      completeness = Number(doc.dataCompletenessPct ?? 0);
      targetSchool = doc.targetSchool ?? '—';
    } catch {
      /* ignore */
    }
  }

  const qal = isQualifiedActiveLearner(db, uid);

  return {
    userId: uid,
    cohort: cohortLevel(db, uid),
    targetSchool,
    pathCompletenessPct: completeness,
    papersReckoned28d: reckoned28,
    studyHours28d: studyHours,
    foldEfficiencyIndex: Math.round((reckoned28 / Math.max(studyHours, 0.5)) * 100) / 100,
    avgMastery28d: avgMastery != null ? Math.round(avgMastery * 10) / 10 : null,
    qualifiedActiveLearner: qal,
    weaknessImproved: qal ? weaknessImproved(db, uid) : false,
    studyMinutesWeek1: weeklyStudyMinutes(db, uid, 28, 21),
    studyMinutesWeek4: weeklyStudyMinutes(db, uid, 7, 0),
  };
}

export function queryAdminFoldTimePlatform(limit = 80): AdminFoldTimePlatformDto {
  const db = getLearningDb();
  const users = db
    .prepare(
      `SELECT user_id FROM zhi_learning_path ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(Math.min(500, Math.max(10, limit * 2))) as { user_id: string }[];

  const levels: Record<CohortLevel, number> = { L0: 0, L1: 0, L2: 0, L3: 0 };
  let foldSum = 0;
  let foldN = 0;
  const rows: AdminFoldTimeUserRow[] = [];

  for (const { user_id } of users) {
    const m = getAdminFoldTimeUserMetrics(user_id);
    levels[m.cohort] = (levels[m.cohort] ?? 0) + 1;
    if (m.cohort === 'L2' || m.cohort === 'L3') {
      foldSum += m.foldEfficiencyIndex;
      foldN += 1;
    }
    rows.push(m);
  }

  const anchored = (
    db.prepare(`SELECT COUNT(*) as c FROM zhi_school_anchor WHERE trim(target_school) != ''`).get() as {
      c: number;
    }
  ).c;

  const pathUsers28 = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM zhi_learning_path
         WHERE updated_at > strftime('%s', 'now', '-28 days')`,
      )
      .get() as { c: number }
  ).c;

  const papers7d = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM zhi_assessment_papers
         WHERE created_at > strftime('%s', 'now', '-7 days')`,
      )
      .get() as { c: number }
  ).c;

  const qalUsers = rows.filter((r) => r.qualifiedActiveLearner);
  const weaknessImprovedCount = qalUsers.filter((r) => r.weaknessImproved).length;
  const qalFold = qalUsers.map((r) => r.foldEfficiencyIndex);

  const topUsers = [...rows]
    .filter((r) => r.cohort === 'L2' || r.cohort === 'L3')
    .sort((a, b) => b.foldEfficiencyIndex - a.foldEfficiencyIndex)
    .slice(0, limit);

  return {
    pathUsersTotal: users.length,
    pathUsersActive28d: pathUsers28,
    assessmentPapers7d: papers7d,
    cohortCounts: levels,
    loopCompletionRatePct: users.length
      ? Math.round(((levels.L3 ?? 0) / users.length) * 1000) / 10
      : 0,
    avgFoldIndexL2L3: foldN ? Math.round((foldSum / foldN) * 100) / 100 : 0,
    okr: {
      anchoredUsers: anchored,
      qualifiedActiveLearners: qalUsers.length,
      qalRatePct: anchored ? Math.round((qalUsers.length / anchored) * 1000) / 10 : 0,
      weaknessImprovementRatePct: qalUsers.length
        ? Math.round((weaknessImprovedCount / qalUsers.length) * 1000) / 10
        : 0,
      avgFoldIndexQAL: qalFold.length
        ? Math.round((qalFold.reduce((a, b) => a + b, 0) / qalFold.length) * 100) / 100
        : 0,
      targets: {
        qalRatePct: 25,
        weaknessImprovementRatePct: 35,
        foldLiftMedian: 1.3,
      },
    },
    topUsers,
    qalUsers: [...qalUsers]
      .sort((a, b) => b.foldEfficiencyIndex - a.foldEfficiencyIndex)
      .slice(0, limit),
  };
}
