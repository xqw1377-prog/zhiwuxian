/**
 * 从真实学业行为熔炼「三维时间折叠」每日战报
 */

import { getCoreDb } from '../wuxian-core-db';
import { getLearningDb } from '../wuxian-learning-db';
import { buildLearningProgressDashboard } from '../../src/services/learning-progress-dashboard';
import { getSchoolAnchorProfile } from '../../src/db/zhi-cloud-schema';
import { listRecentLanguageSessions } from '../../src/db/zhi-language-session-schema';
import { listRecentVideoSessions } from '../../src/db/zhi-video-session-schema';
import { detectSchoolPathway } from '../../src/services/school-pathway';
import { ZhiCompanionEngine } from './ZhiCompanionEngine';

function resolveGoalIdForStudent(studentId: string): string {
  const db = getCoreDb();
  const row = db.prepare(`
    SELECT id FROM goals
    WHERE user_id = ? OR id = ?
    ORDER BY rowid DESC LIMIT 1
  `).get(studentId, studentId) as { id: string } | undefined;
  if (row?.id) return row.id;
  return `goal-${studentId}`;
}

function countTodayReroutes(studentId: string): number {
  const db = getCoreDb();
  const today = new Date().toISOString().slice(0, 10);
  try {
    const row = db.prepare(`
      SELECT COUNT(*) as c FROM reroute_logs r
      JOIN goals g ON r.goal_id = g.id
      WHERE (g.user_id = ? OR g.id = ?) AND date(r.timestamp) = date(?)
    `).get(studentId, studentId, today) as { c: number };
    return Number(row?.c ?? 0);
  } catch {
    return 0;
  }
}

function sumSessionMinutes(uid: string): {
  effectiveMinutes: number;
  escapeCount: number;
  reading: number;
  listening: number;
  speaking: number;
  writing: number;
  knowledgePoints: string[];
} {
  const lang = listRecentLanguageSessions(uid, 12);
  const videos = listRecentVideoSessions(uid, 12);
  const cutoff = Date.now() / 1000 - 86400;

  let speaking = 0;
  let listening = 0;
  let minutes = 0;
  const knowledge: string[] = [];

  for (const s of lang) {
    if (s.created_at < cutoff) continue;
    minutes += 12;
    if (/speaking|口语|shadow/i.test(s.intake_type ?? '')) speaking += 1;
    else listening += 1;
    if (s.task_prompt) knowledge.push(s.task_prompt.slice(0, 40));
    if (s.score_numeric != null) {
      knowledge.push(`语言估分 ${Math.round(s.score_numeric)}`);
    }
  }

  let reading = 0;
  for (const v of videos) {
    if (v.created_at < cutoff) continue;
    minutes += 10;
    reading += 1;
    if (v.chapter_title) {
      knowledge.push(`${v.chapter_title} · 掌握 ${Math.round(v.mastery_score ?? 0)}%`);
    }
  }

  const reroutes = countTodayReroutes(uid);
  const escapeCount = Math.max(reroutes, lang.filter((s) => s.created_at >= cutoff && !s.passed_shadow).length);

  return {
    effectiveMinutes: Math.round(minutes) || 0,
    escapeCount,
    reading,
    listening,
    speaking,
    writing: 0,
    knowledgePoints: knowledge,
  };
}

export function synthesizeDailyReportForStudent(studentId: string): boolean {
  const uid = studentId.trim();
  if (!uid) return false;

  const dash = buildLearningProgressDashboard(uid);
  const anchor = getSchoolAnchorProfile(uid);
  const goalId = resolveGoalIdForStudent(uid);
  const behavior = sumSessionMinutes(uid);

  const pathway = anchor
    ? detectSchoolPathway(anchor.school, anchor.major, {
        currentSchool: anchor.currentSchool,
        currentRegion: anchor.currentRegion,
        targetSchoolRegion: anchor.targetSchoolRegion,
      })
    : dash.pathway;

  let knowledgePoints = [...behavior.knowledgePoints];
  if (knowledgePoints.length === 0) {
    knowledgePoints = (dash.outcomes ?? []).slice(0, 6).map((o) => o.title).filter(Boolean);
  }
  if (knowledgePoints.length === 0 && dash.subjects?.length) {
    for (const s of dash.subjects.slice(0, 4)) {
      knowledgePoints.push(`${s.name} 掌握度约 ${s.progressPct}%`);
    }
  }

  const effectiveMinutes = Math.max(
    behavior.effectiveMinutes,
    (dash.momentum?.weekLanguageSessions ?? 0) * 8,
    30,
  );
  const escapeCount = Math.max(behavior.escapeCount, Math.round((dash.dream?.challengeIndex ?? 88) / 35));
  const slopeChange = dash.dream?.delta7d != null ? -Math.abs(dash.dream.delta7d) * 0.1 : -0.3;
  const distance = Math.max(1, (dash.dream?.daysRemaining ?? 365) * 0.12);

  const schoolLabel = dash.dream?.targetSchool ?? (anchor ? `${anchor.school} · ${anchor.major}` : '梦校');

  let zhiComment = '别慌，明天补一次可验证练习，路径会自己重算。';
  if (pathway === 'k12_stage') {
    zhiComment =
      escapeCount >= 2
        ? '今天对抗了多次想偷懒的冲动，校内排名路线在往前挪。'
        : effectiveMinutes >= 120
          ? '今日心流不错，单科/全校目标都在变清晰。'
          : '抽空拍一道错题或练一组口语，战报会更有料。';
  } else if (pathway === 'domestic_cn') {
    zhiComment =
      escapeCount >= 2
        ? '高考前夜的重路由又救回了一格，继续顶住。'
        : '今日斜率在往下走，梦校引力在生效。';
  } else {
    zhiComment =
      escapeCount >= 2
        ? '今天在第三次想要退缩时成功复活，是个硬汉。'
        : effectiveMinutes >= 180
          ? '心流拉满的一天，斜率正在被你摁下去。'
          : zhiComment;
  }

  ZhiCompanionEngine.generateDailyReport({
    goalId,
    studentId: uid,
    knowledgePoints,
    slopeChange,
    dreamSchoolDistance: distance,
    zhiComment,
    effectiveMinutes,
    escapeCount,
    sessionBreakdown: {
      reading: behavior.reading,
      listening: behavior.listening,
      speaking: behavior.speaking,
      writing: behavior.writing,
    },
  });

  console.log(`[陪伴中台] 已熔炼战报 · ${uid} · ${schoolLabel} · ${pathway}`);
  return true;
}

export function runCompanionDailyBatch(limit = 80): number {
  getLearningDb();
  const rows = getLearningDb()
    .prepare(`
      SELECT DISTINCT user_id AS uid FROM zhi_school_anchor
      WHERE user_id IS NOT NULL AND trim(user_id) != ''
      LIMIT ?
    `)
    .all(limit) as { uid: string }[];

  let n = 0;
  for (const { uid } of rows) {
    try {
      if (synthesizeDailyReportForStudent(uid)) n += 1;
    } catch (err) {
      console.warn(`[陪伴中台] 战报跳过 ${uid}:`, err instanceof Error ? err.message : err);
    }
  }
  return n;
}
