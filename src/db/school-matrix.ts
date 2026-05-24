/**
 * WUXIAN 3.0 · 学校目标指标库与差距追踪账本
 */

import { getLearningDb } from '../../server/wuxian-learning-db';

export interface TimelineMilestone {
  phase: string;
  deadline: string;
  action: string;
}

export interface CausalityGap {
  weakness: string;
  causalityEffect: string;
}

export type MilestoneStatus = 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED';

export interface DynamicMilestone {
  codeName: string;
  deadline: string;
  mission: string;
  mentorWhisper: string;
  status?: MilestoneStatus;
}

export interface MentorPlanView {
  userId: string;
  targetSchool: string;
  mentorWakeUpCall: string;
  challengeIndex: number;
  causalityGaps: CausalityGap[];
  dynamicMilestones: DynamicMilestone[];
  activePhase: string | null;
  currentBaseline: Record<string, unknown>;
  updatedAt: number;
  /** 确定性闭环：导师最近一次认同低语 */
  lastDestinyWhisper?: string;
  /** 通往梦校的确定性进度（100 - 命运阻力） */
  certaintyProgress?: number;
}

export interface SchoolTargetMetricsRow {
  user_id: string;
  target_school: string | null;
  required_metrics: string | null;
  current_baseline: string | null;
  gap_analysis: string | null;
  challenge_index: number;
  timeline_milestones: string | null;
  active_phase: string | null;
  updated_at: number;
}

export interface SchoolMatrixView {
  userId: string;
  targetSchool: string;
  requiredMetrics: Record<string, unknown>;
  currentBaseline: Record<string, unknown>;
  gapDetails: string[];
  challengeIndex: number;
  timelineMilestones: TimelineMilestone[];
  activePhase: string | null;
  updatedAt: number;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * 部署 3.0 航标指标精算物理账本
 */
export function initializeSchoolMatrixSchema(): void {
  const db = getLearningDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS school_target_metrics (
      user_id TEXT PRIMARY KEY,
      target_school TEXT,
      required_metrics TEXT,
      current_baseline TEXT,
      gap_analysis TEXT,
      challenge_index INTEGER DEFAULT 50,
      timeline_milestones TEXT,
      active_phase TEXT,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_school_target_challenge ON school_target_metrics(challenge_index);
  `);

  const cols = db.prepare(`PRAGMA table_info(school_target_metrics)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'active_phase')) {
    db.exec(`ALTER TABLE school_target_metrics ADD COLUMN active_phase TEXT`);
  }
}

export function upsertSchoolTargetMetrics(input: {
  userId: string;
  targetSchool: string;
  requiredMetrics: Record<string, unknown>;
  currentBaseline: Record<string, unknown>;
  gapDetails: string[];
  challengeIndex: number;
  timelineMilestones: TimelineMilestone[];
  activePhase?: string | null;
}): SchoolMatrixView {
  initializeSchoolMatrixSchema();
  const challenge = Math.max(1, Math.min(100, Math.round(input.challengeIndex)));
  const activePhase =
    input.activePhase?.trim()
    || input.timelineMilestones[0]?.phase
    || null;

  getLearningDb().prepare(`
    INSERT INTO school_target_metrics (
      user_id, target_school, required_metrics, current_baseline,
      gap_analysis, challenge_index, timeline_milestones, active_phase, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(user_id) DO UPDATE SET
      target_school = excluded.target_school,
      required_metrics = excluded.required_metrics,
      current_baseline = excluded.current_baseline,
      gap_analysis = excluded.gap_analysis,
      challenge_index = excluded.challenge_index,
      timeline_milestones = excluded.timeline_milestones,
      active_phase = excluded.active_phase,
      updated_at = excluded.updated_at
  `).run(
    input.userId,
    input.targetSchool,
    JSON.stringify(input.requiredMetrics),
    JSON.stringify(input.currentBaseline),
    JSON.stringify(input.gapDetails),
    challenge,
    JSON.stringify(input.timelineMilestones),
    activePhase,
  );

  return getSchoolMatrixView(input.userId)!;
}

export function getSchoolMatrixRow(userId: string): SchoolTargetMetricsRow | null {
  initializeSchoolMatrixSchema();
  const row = getLearningDb().prepare(`SELECT * FROM school_target_metrics WHERE user_id = ?`).get(userId) as
    | SchoolTargetMetricsRow
    | undefined;
  return row ?? null;
}

export function getSchoolMatrixView(userId: string): SchoolMatrixView | null {
  const row = getSchoolMatrixRow(userId);
  if (!row?.target_school) return null;
  return {
    userId: row.user_id,
    targetSchool: row.target_school,
    requiredMetrics: parseJson<Record<string, unknown>>(row.required_metrics, {}),
    currentBaseline: parseJson<Record<string, unknown>>(row.current_baseline, {}),
    gapDetails: parseJson<string[]>(row.gap_analysis, []),
    challengeIndex: Number(row.challenge_index ?? 50),
    timelineMilestones: parseJson<TimelineMilestone[]>(row.timeline_milestones, []),
    activePhase: row.active_phase,
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export function setActiveSchoolPhase(userId: string, phase: string): void {
  initializeSchoolMatrixSchema();
  getLearningDb().prepare(`
    UPDATE school_target_metrics SET active_phase = ?, updated_at = strftime('%s', 'now') WHERE user_id = ?
  `).run(phase, userId);
}

function parseCausalityGaps(raw: string | null): CausalityGap[] {
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      if (typeof item === 'string' && item.trim()) {
        return { weakness: item.slice(0, 80), causalityEffect: item };
      }
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const weakness = String(o.weakness ?? o.label ?? '').trim();
        const causalityEffect = String(o.causalityEffect ?? o.effect ?? '').trim();
        if (weakness || causalityEffect) {
          return { weakness: weakness || '未命名弱项', causalityEffect: causalityEffect || weakness };
        }
      }
      return null;
    })
    .filter((x): x is CausalityGap => x !== null);
}

function parseDynamicMilestones(raw: string | null): DynamicMilestone[] {
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  const mapped: Array<DynamicMilestone | null> = parsed.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const o = item as Record<string, unknown>;
    const codeName = String(o.codeName ?? o.phase ?? '').trim();
    const deadline = String(o.deadline ?? '').trim();
    const mission = String(o.mission ?? o.action ?? '').trim();
    const mentorWhisper = String(o.mentorWhisper ?? o.whisper ?? '').trim();
    if (!codeName && !deadline) return null;

    const statusRaw = String(o.status ?? '').toUpperCase();
    const status: MilestoneStatus | undefined =
      statusRaw === 'LOCKED' || statusRaw === 'IN_PROGRESS' || statusRaw === 'COMPLETED'
        ? (statusRaw as MilestoneStatus)
        : undefined;

    const m: DynamicMilestone = {
      codeName: codeName || 'OPERATION',
      deadline: deadline || 'TBD',
      mission: mission || '执行攻坚任务',
      mentorWhisper: mentorWhisper || '别拖，现在就开始。',
    };
    if (status) m.status = status;
    return m;
  });

  return mapped.filter((x): x is DynamicMilestone => x !== null);
}

export function withDefaultMilestoneStatuses(milestones: DynamicMilestone[]): DynamicMilestone[] {
  if (!milestones.length) return milestones;
  let hasActive = milestones.some((m) => m.status === 'IN_PROGRESS');
  return milestones.map((m) => {
    if (m.status === 'COMPLETED' || m.status === 'IN_PROGRESS' || m.status === 'LOCKED') {
      if (m.status === 'IN_PROGRESS') hasActive = true;
      return m;
    }
    if (!hasActive) {
      hasActive = true;
      return { ...m, status: 'IN_PROGRESS' as MilestoneStatus };
    }
    return { ...m, status: 'LOCKED' as MilestoneStatus };
  });
}

function advanceMilestoneStatuses(milestones: DynamicMilestone[], solvedNodeCount: number): {
  milestones: DynamicMilestone[];
  unlockedPhase: string | null;
} {
  const next = withDefaultMilestoneStatuses(milestones.map((m) => ({ ...m })));
  if (solvedNodeCount <= 0) {
    const active = next.find((m) => m.status === 'IN_PROGRESS');
    return { milestones: next, unlockedPhase: active?.codeName ?? null };
  }

  const inProgressIdx = next.findIndex((m) => m.status === 'IN_PROGRESS');
  if (inProgressIdx >= 0) {
    next[inProgressIdx] = { ...next[inProgressIdx], status: 'COMPLETED' };
  }

  const lockedIdx = next.findIndex((m) => m.status === 'LOCKED');
  let unlockedPhase: string | null = null;
  if (lockedIdx >= 0) {
    next[lockedIdx] = { ...next[lockedIdx], status: 'IN_PROGRESS' };
    unlockedPhase = next[lockedIdx].codeName;
  }

  return { milestones: next, unlockedPhase };
}

export interface DestinyReductionResult {
  previousIndex: number;
  challengeIndex: number;
  reduction: number;
  mentorWhisper: string;
  unlockedPhase: string | null;
  dynamicMilestones: DynamicMilestone[];
  certaintyProgress: number;
}

export function applyDestinyReduction(
  userId: string,
  reduction: number,
  solvedNodeCount: number,
  mentorWhisper: string,
): DestinyReductionResult | null {
  initializeSchoolMatrixSchema();
  const row = getSchoolMatrixRow(userId);
  if (!row?.target_school) return null;

  const previousIndex = Math.max(1, Math.min(100, Math.round(Number(row.challenge_index ?? 50))));
  const challengeIndex = Math.max(1, Math.round(previousIndex - Math.max(0, reduction)));

  const milestones = parseDynamicMilestones(row.timeline_milestones);
  const { milestones: advanced, unlockedPhase } = advanceMilestoneStatuses(milestones, solvedNodeCount);
  const activePhase = unlockedPhase ?? advanced.find((m) => m.status === 'IN_PROGRESS')?.codeName ?? row.active_phase;

  const required = parseJson<Record<string, unknown>>(row.required_metrics, {});
  const db = getLearningDb();
  db.transaction(() => {
    db.prepare(`
      UPDATE school_target_metrics
      SET challenge_index = ?,
          timeline_milestones = ?,
          active_phase = ?,
          required_metrics = ?,
          updated_at = strftime('%s', 'now')
      WHERE user_id = ?
    `).run(
      challengeIndex,
      JSON.stringify(advanced),
      activePhase,
      JSON.stringify({ ...required, lastDestinyWhisper: mentorWhisper }),
      userId,
    );
    db.prepare(`
      UPDATE goal_reversing_matrix SET difficulty_index = ?, updated_at = strftime('%s', 'now')
      WHERE user_id = ?
    `).run(challengeIndex, userId);
  })();

  return {
    previousIndex,
    challengeIndex,
    reduction: previousIndex - challengeIndex,
    mentorWhisper,
    unlockedPhase,
    dynamicMilestones: advanced,
    certaintyProgress: 100 - challengeIndex,
  };
}

export function upsertMentorPlan(input: {
  userId: string;
  targetSchool: string;
  currentBaseline: Record<string, unknown>;
  mentorWakeUpCall: string;
  challengeIndex: number;
  causalityGaps: CausalityGap[];
  dynamicMilestones: DynamicMilestone[];
}): MentorPlanView {
  initializeSchoolMatrixSchema();
  const challenge = Math.max(1, Math.min(100, Math.round(input.challengeIndex)));
  const milestones = withDefaultMilestoneStatuses(input.dynamicMilestones);
  const activePhase = milestones.find((m) => m.status === 'IN_PROGRESS')?.codeName ?? milestones[0]?.codeName ?? null;

  getLearningDb().prepare(`
    INSERT INTO school_target_metrics (
      user_id, target_school, required_metrics, current_baseline,
      gap_analysis, challenge_index, timeline_milestones, active_phase, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(user_id) DO UPDATE SET
      target_school = excluded.target_school,
      required_metrics = excluded.required_metrics,
      current_baseline = excluded.current_baseline,
      gap_analysis = excluded.gap_analysis,
      challenge_index = excluded.challenge_index,
      timeline_milestones = excluded.timeline_milestones,
      active_phase = excluded.active_phase,
      updated_at = excluded.updated_at
  `).run(
    input.userId,
    input.targetSchool,
    JSON.stringify({ mentorWakeUpCall: input.mentorWakeUpCall }),
    JSON.stringify(input.currentBaseline),
    JSON.stringify(input.causalityGaps),
    challenge,
    JSON.stringify(milestones),
    activePhase,
  );

  return getMentorPlanView(input.userId)!;
}

export function getMentorPlanView(userId: string): MentorPlanView | null {
  const row = getSchoolMatrixRow(userId);
  if (!row?.target_school) return null;

  const required = parseJson<Record<string, unknown>>(row.required_metrics, {});
  const wakeUp =
    typeof required.mentorWakeUpCall === 'string'
      ? required.mentorWakeUpCall
      : typeof required.text === 'string'
        ? required.text
        : '';

  const challengeIndex = Number(row.challenge_index ?? 50);
  const lastDestinyWhisper =
    typeof required.lastDestinyWhisper === 'string' ? required.lastDestinyWhisper : undefined;

  return {
    userId: row.user_id,
    targetSchool: row.target_school,
    mentorWakeUpCall: wakeUp,
    challengeIndex,
    causalityGaps: parseCausalityGaps(row.gap_analysis),
    dynamicMilestones: withDefaultMilestoneStatuses(parseDynamicMilestones(row.timeline_milestones)),
    activePhase: row.active_phase,
    currentBaseline: parseJson<Record<string, unknown>>(row.current_baseline, {}),
    updatedAt: Number(row.updated_at ?? 0),
    lastDestinyWhisper,
    certaintyProgress: Math.max(0, Math.min(100, 100 - challengeIndex)),
  };
}
