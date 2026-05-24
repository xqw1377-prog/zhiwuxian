import { getLearningDb } from '../../server/wuxian-learning-db';
import { getSchoolMatrixRow } from '../db/school-matrix';
import { DeepSeekActiveMentor } from './deepseek-mentor';
import { resolveUserLlm } from './deepseek-client';
import { WARP_COST } from './billing-hub';
import { gatewayJsonCompletion } from './llm-gateway';
import { getReversingMetrics } from '../db/milestone-schema';
import { getBaselineStatus, parseBaseline } from '../db/baseline-schema';

export type ActiveTool = 'NONE' | 'METRICS_INPUT' | 'VISION_INTERCEPT' | 'PATH_RECONFIG';

export type ActiveIntervention = {
  shouldTrigger: boolean;
  mentorOpening?: string;
  requiredTool?: ActiveTool;
  coachTip?: string;
  challengeIndex?: number;
  deadlineDaysLeft?: number;
  currentMission?: string;
};

function initializeMentorState(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_mentor_state (
      user_id TEXT PRIMARY KEY,
      last_trigger_at INTEGER DEFAULT 0
    );
  `);
}

function getLastTriggerAt(userId: string): number {
  initializeMentorState();
  const row = getLearningDb()
    .prepare(`SELECT last_trigger_at FROM active_mentor_state WHERE user_id = ?`)
    .get(userId) as { last_trigger_at: number } | undefined;
  return row?.last_trigger_at ?? 0;
}

function setLastTriggerAt(userId: string, tsSec: number): void {
  initializeMentorState();
  getLearningDb()
    .prepare(`
      INSERT INTO active_mentor_state (user_id, last_trigger_at)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_trigger_at = excluded.last_trigger_at
    `)
    .run(userId, tsSec);
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function computeChallengeIndex(input: { difficultyIndex: number; daysLeft: number; progressPercentage: number }): number {
  const timePressure = input.daysLeft <= 0 ? 30 : input.daysLeft <= 3 ? 25 : input.daysLeft <= 7 ? 18 : input.daysLeft <= 14 ? 12 : 6;
  const lag = input.progressPercentage < 10 ? 18 : input.progressPercentage < 25 ? 12 : input.progressPercentage < 50 ? 6 : 0;
  return clampInt(input.difficultyIndex + timePressure + lag, 1, 99, 70);
}

function fallbackIntervention(input: {
  userId: string;
  daysLeft: number;
  progressPercentage: number;
  difficultyIndex: number;
  currentMission: string;
  requiredTool: ActiveTool;
}): ActiveIntervention {
  const challengeIndex = computeChallengeIndex({
    difficultyIndex: input.difficultyIndex,
    daysLeft: input.daysLeft,
    progressPercentage: input.progressPercentage,
  });
  const mentorOpening =
    `曦宝，距离当前战役结束还有 ${input.daysLeft} 天，你的进度仍在 ${input.progressPercentage}%。` +
    `今晚别绕路，亮出底牌：我们要把【${input.currentMission}】打穿。`;

  const coachTip =
    input.requiredTool === 'METRICS_INPUT'
      ? '先提交现状成绩与弱项。我只要真实数据，不要自我感动。'
      : input.requiredTool === 'VISION_INTERCEPT'
        ? '把你正在卡住的概念丢进雷达。重复撞墙的地方，必须降维重学。'
        : '我会重组因果链。今晚只做一块攻坚，不贪多。';

  return {
    shouldTrigger: true,
    mentorOpening,
    requiredTool: input.requiredTool,
    coachTip,
    challengeIndex,
    deadlineDaysLeft: input.daysLeft,
    currentMission: input.currentMission,
  };
}

async function llmIntervention(input: {
  userId: string;
  target: string;
  daysLeft: number;
  progressPercentage: number;
  difficultyIndex: number;
  currentMission: string;
  requiredToolHint: ActiveTool;
}): Promise<ActiveIntervention> {
  const llm = resolveUserLlm(input.userId);
  if (!llm) {
    return fallbackIntervention({
      userId: input.userId,
      daysLeft: input.daysLeft,
      progressPercentage: input.progressPercentage,
      difficultyIndex: input.difficultyIndex,
      currentMission: input.currentMission,
      requiredTool: input.requiredToolHint,
    });
  }

  const gw = await gatewayJsonCompletion<{
    mentorOpening?: string;
    requiredTool?: string;
    coachTip?: string;
  }>(input.userId, [
    {
      role: 'system',
      content: [
        '你是一个铁血且主动介入学生生活的人生导师。',
        '你必须主动发起一次谈话，强行介入时间线。',
        '只返回 JSON，不要任何多余文本。',
        '{',
        '  "mentorOpening": string,',
        '  "requiredTool": "METRICS_INPUT" | "VISION_INTERCEPT" | "PATH_RECONFIG",',
        '  "coachTip": string',
        '}',
        '约束：mentorOpening 40 字以内，必须包含“曦宝”。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `【目标】:${input.target}`,
        `【剩余天数】:${input.daysLeft}`,
        `【当前进度】:${input.progressPercentage}%`,
        `【难度指数】:${input.difficultyIndex}`,
        `【当前战役】:${input.currentMission}`,
        `【工具偏好】:${input.requiredToolHint}`,
      ].join('\n'),
    },
  ], {
    traceId: `active_mentor_${input.userId}`,
    flatWarp: { cost: WARP_COST.MENTOR_INTERVENTION, reason: 'MENTOR_INTERVENTION' },
  });

  if (!gw.chargeOk) {
    return fallbackIntervention({
      userId: input.userId,
      daysLeft: input.daysLeft,
      progressPercentage: input.progressPercentage,
      difficultyIndex: input.difficultyIndex,
      currentMission: input.currentMission,
      requiredTool: input.requiredToolHint,
    });
  }

  const parsed = (gw.data ?? {}) as { mentorOpening?: unknown; requiredTool?: unknown; coachTip?: unknown };
  const requiredTool = String(parsed.requiredTool ?? input.requiredToolHint) as ActiveTool;
  const mentorOpening = typeof parsed.mentorOpening === 'string' ? parsed.mentorOpening.trim().slice(0, 80) : '';
  const coachTip = typeof parsed.coachTip === 'string' ? parsed.coachTip.trim().slice(0, 140) : '';

  const challengeIndex = computeChallengeIndex({
    difficultyIndex: input.difficultyIndex,
    daysLeft: input.daysLeft,
    progressPercentage: input.progressPercentage,
  });

  return {
    shouldTrigger: true,
    mentorOpening: mentorOpening || undefined,
    requiredTool: (requiredTool === 'METRICS_INPUT' || requiredTool === 'VISION_INTERCEPT' || requiredTool === 'PATH_RECONFIG')
      ? requiredTool
      : input.requiredToolHint,
    coachTip: coachTip || undefined,
    challengeIndex,
    deadlineDaysLeft: input.daysLeft,
    currentMission: input.currentMission,
  };
}

export async function triggerActiveIntervention(userId: string, opts?: { force?: boolean }): Promise<ActiveIntervention> {
  const uid = userId.trim();
  if (!uid) return { shouldTrigger: false };

  const nowSec = Math.floor(Date.now() / 1000);
  const last = getLastTriggerAt(uid);
  const cooldownSec = 60 * 8;
  if (!opts?.force && nowSec - last < cooldownSec) return { shouldTrigger: false };

  const metrics = getReversingMetrics(uid);
  if (!metrics?.targetDestination) return { shouldTrigger: false };

  const baselineRow = getBaselineStatus(uid);
  const baseline = baselineRow ? parseBaseline(baselineRow) : null;

  const db = getLearningDb();
  const firstNode = db
    .prepare(`SELECT node_title, status, hit_count FROM cognitive_topology_nodes WHERE user_id = ? ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'LOCKED' THEN 1 ELSE 2 END, rowid ASC LIMIT 1`)
    .get(uid) as { node_title?: string; status?: string; hit_count?: number } | undefined;
  const currentMission = firstNode?.node_title ? String(firstNode.node_title) : 'T1 补天战役';

  const matrixRow = db.prepare(`SELECT difficulty_index, updated_at FROM goal_reversing_matrix WHERE user_id = ?`).get(uid) as
    | { difficulty_index?: number; updated_at?: number }
    | undefined;
  const difficultyIndex = clampInt(matrixRow?.difficulty_index, 0, 100, 0);

  const stale = typeof matrixRow?.updated_at === 'number' ? (nowSec - matrixRow.updated_at) > 60 * 60 * 24 * 2 : false;
  const deadlinePressure = (metrics.daysLeft ?? 999) <= 7 && (metrics.progressPercentage ?? 0) < 60;
  const lagging = (metrics.daysLeft ?? 999) <= 14 && (metrics.progressPercentage ?? 0) < 25;

  const shouldTrigger =
    Boolean(opts?.force) ||
    !baseline ||
    stale ||
    deadlinePressure ||
    lagging ||
    (firstNode?.hit_count ?? 0) >= 2;

  if (!shouldTrigger) return { shouldTrigger: false };

  const schoolRow = getSchoolMatrixRow(uid);
  if (schoolRow?.target_school) {
    const ds = await DeepSeekActiveMentor.checkAndIntervene(uid, opts);
    if (ds.shouldTrigger) {
      setLastTriggerAt(uid, nowSec);
      return {
        shouldTrigger: true,
        mentorOpening: ds.mentorOpening,
        requiredTool: (ds.requiredTool ?? 'VISION_INTERCEPT') as ActiveTool,
        coachTip: ds.coachTip,
        challengeIndex: ds.challengeIndex ?? difficultyIndex,
        deadlineDaysLeft: metrics.daysLeft,
        currentMission,
      };
    }
  }

  const requiredToolHint: ActiveTool =
    !baseline
      ? 'METRICS_INPUT'
      : (firstNode?.hit_count ?? 0) >= 2
        ? 'VISION_INTERCEPT'
        : (difficultyIndex >= 75 && (metrics.progressPercentage ?? 0) < 35)
          ? 'PATH_RECONFIG'
          : 'VISION_INTERCEPT';

  const intervention = await llmIntervention({
    userId: uid,
    target: metrics.targetDestination,
    daysLeft: metrics.daysLeft,
    progressPercentage: metrics.progressPercentage,
    difficultyIndex,
    currentMission,
    requiredToolHint,
  });

  setLastTriggerAt(uid, nowSec);
  if (!intervention.mentorOpening) {
    const fb = fallbackIntervention({
      userId: uid,
      daysLeft: metrics.daysLeft,
      progressPercentage: metrics.progressPercentage,
      difficultyIndex,
      currentMission,
      requiredTool: requiredToolHint,
    });
    return fb;
  }
  return intervention;
}

