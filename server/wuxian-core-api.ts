/**
 * WUXIAN · 核心 API 引擎
 * 目标拆解 · 阶梯式抗放弃重路由 · 深夜零入侵巡逻
 * 直接读写 wuxian_core.db
 */

import { getCoreDb, uid, todayStr, tomorrowStr, type GoalRow, type TaskRow } from './wuxian-core-db';
import { getVoice, PERSONA_DISPLAY, type PersonaVoiceType } from './persona-voices';
import { ValidationError } from './errors';
import { TOEFL_90_TEMPLATE } from './templates/toefl-90';

// ── 类型 ──

export interface DeconstructInput {
  title: string;
  days: number;
  driveForce?: string;
  personaType?: PersonaVoiceType;
  templateId?: string;
  userId?: string;
  directoryId?: string;
}

export interface DeconstructOutput {
  success: boolean;
  goalId: string;
  metrics: { totalEnergy: number; timeSlope: number; deviationRisk: number };
  companionSpeech: string;
  todayTasks: { id: string; desc: string; time: number; scheduledAt: string }[];
  personaName: string;
  durationDays: number;
  templateId?: string;
  templateName?: string;
}

export interface RerouteInput {
  goalId: string;
  failedTaskId?: string;
  reason?: string;
  todayCompleted?: boolean;
}

export interface RerouteOutput {
  success: boolean;
  actionTaken: string;
  newSlope: number;
  oldSlope: number;
  deviationRisk: number;
  remainingEnergy: number;
  totalEnergy: number;
  continuousFailDays: number;
  companionSpeech: string;
  nextTasks: { id: string; desc: string; time: number; scheduledAt: string }[];
  silent: boolean;
  showBubble: boolean;
}

export interface NightPatrolOutput {
  success: boolean;
  msg: string;
  reRoutedCount: number;
}

// ── 接口 1：目标初始化 ──

export function coreDeconstruct(input: DeconstructInput): DeconstructOutput {
  const db = getCoreDb();
  const { title, days, driveForce = '', personaType = 'BUDDY', templateId, userId = '', directoryId = '' } = input;
  const goalId = uid();

  const useToefl = templateId === TOEFL_90_TEMPLATE.templateId || /toefl|托福/i.test(title);
  const normalizedDays = useToefl ? TOEFL_90_TEMPLATE.days : days;
  if (!normalizedDays || normalizedDays < 1) throw new ValidationError('时间锚点必须 ≥ 1 天');

  const goalType = useToefl ? 'TOEFL' : /academic|学术|sat|gre|gmat|雅思|ielts/i.test(title) ? 'ACADEMIC' : 'GENERIC';
  const typeFactor = useToefl ? 1 : goalType === 'ACADEMIC' ? 1.2 : 1.0;
  const durationFactor = 1 + (1 / Math.sqrt(Math.max(normalizedDays, 1)));
  const driveFactor = driveForce ? 1.1 : 1.0;

  let totalEnergy = normalizedDays * 10 * typeFactor * durationFactor * driveFactor;

  if (useToefl) {
    totalEnergy = TOEFL_90_TEMPLATE.stages.reduce((sum, s) => {
      const len = Math.max(1, s.dayRange[1] - s.dayRange[0] + 1);
      return sum + len * s.baseEnergy * durationFactor * driveFactor;
    }, 0);
  }
  const slopeBase = useToefl ? TOEFL_90_TEMPLATE.initialSlopeFactor : durationFactor;
  const initialSlope = (totalEnergy / normalizedDays) * slopeBase;

  db.prepare(`
    INSERT INTO goals (id, title, duration_days, remaining_days, drive_force, total_energy, current_slope, persona_type, goal_type, user_id, directory_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(goalId, title, normalizedDays, normalizedDays, driveForce, totalEnergy, initialSlope, personaType, goalType, userId, directoryId);

  const insertTask = db.prepare(`
    INSERT INTO tasks (id, goal_id, sequence_date, content, energy_cost, created_at, source)
    VALUES (?, ?, ?, ?, ?, datetime('now'), 'deconstruct')
  `);

  const today = todayStr();
  const taskDefs = useToefl
    ? TOEFL_90_TEMPLATE.seedTasks(title, initialSlope)
    : [
      { content: `[基础建立] 拆解并确认 ${title} 的第一步核心认知拓扑`, cost: initialSlope },
      { content: `[刻意练习] 完成今日最小可验证动作（15分钟）`, cost: initialSlope * 0.8 },
      { content: `[复盘] 标记当前最关键的三个卡点`, cost: initialSlope * 0.5 },
    ];

  const todayTasks: DeconstructOutput['todayTasks'] = [];
  for (const t of taskDefs) {
    const id = uid();
    insertTask.run(id, goalId, today, t.content, t.cost);
    todayTasks.push({
      id,
      desc: t.content,
      time: Math.round(t.cost),
      scheduledAt: '今日',
    });
  }

  const companionSpeech = driveForce
    ? `目标「${title}」已录入动态路由器。我记住你的理由了：${driveForce.slice(0, 40)}。接下来的 ${normalizedDays} 天，你负责掉队，我负责兜底。`
    : `目标「${title}」已录入动态路由器。接下来的 ${normalizedDays} 天，你负责掉队，我负责兜底。`;

  return {
    success: true,
    goalId,
    metrics: { totalEnergy, timeSlope: initialSlope, deviationRisk: 0 },
    companionSpeech,
    todayTasks,
    personaName: PERSONA_DISPLAY[personaType],
    durationDays: normalizedDays,
    templateId: useToefl ? TOEFL_90_TEMPLATE.templateId : undefined,
    templateName: useToefl ? TOEFL_90_TEMPLATE.sceneName : undefined,
  };
}

// ── 接口 2：动态重路由 ──

export function coreReroute(input: RerouteInput): RerouteOutput {
  const db = getCoreDb();
  const { goalId, failedTaskId, reason, todayCompleted } = input;
  const today = todayStr();
  const tomorrow = tomorrowStr();

  const goal = db.prepare(`SELECT * FROM goals WHERE id = ?`).get(goalId) as GoalRow | undefined;
  if (!goal) throw new Error(`[WUXIAN Core] Goal not found: ${goalId}`);

  const calculateRemainingEnergy = (): number => {
    const row = db.prepare(
      `SELECT COALESCE(SUM(energy_cost), 0) as consumed FROM tasks WHERE goal_id = ? AND status = 'DONE'`,
    ).get(goalId) as { consumed: number };
    return Math.max(0, goal.total_energy - row.consumed);
  };

  const calculateContinuousFailDays = (): number => {
    const rows = db.prepare(`
      SELECT sequence_date,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) as done_count
      FROM tasks
      WHERE goal_id = ? AND sequence_date <= ?
      GROUP BY sequence_date
      ORDER BY sequence_date DESC
      LIMIT 30
    `).all(goalId, today) as { sequence_date: string; failed_count: number; done_count: number }[];

    let count = 0;
    for (const row of rows) {
      if (row.done_count > 0) break;
      if (row.failed_count > 0) count++;
      else break;
    }
    return count;
  };

  const calculateRisk = (continuousFailDays: number, remainingEnergy: number, nextSlope: number): number => {
    const failPressure = Math.min(45, continuousFailDays * 18);
    const daysLeft = Math.max(goal.remaining_days, 1);
    const requiredDailySlope = remainingEnergy / daysLeft;
    const baselineSlope = goal.total_energy / Math.max(goal.duration_days, 1);
    const slopePressure = Math.min(
      25,
      Math.max(0, (requiredDailySlope / Math.max(baselineSlope, 0.01) - 1) * 20),
    );
    const statusPressure = goal.status === 'RISK_ALERT' ? 10 : 0;
    return Math.min(99, Math.max(0, failPressure + slopePressure + statusPressure));
  };

  if (todayCompleted) {
    const hadDoneToday = (db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE goal_id = ? AND sequence_date = ? AND status = 'DONE'`,
    ).get(goalId, today) as { count: number }).count > 0;

    if (!failedTaskId) throw new ValidationError('缺少 taskId（必须精准完成单个原子任务）');
    db.prepare(`UPDATE tasks SET status = 'DONE', fail_reason = NULL, updated_at = datetime('now'), completed_at = datetime('now') WHERE id = ? AND goal_id = ?`).run(failedTaskId, goalId);

    const remainingTodoToday = (db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE goal_id = ? AND sequence_date = ? AND status = 'TODO'`,
    ).get(goalId, today) as { count: number }).count;

    if (!hadDoneToday && remainingTodoToday === 0) {
      const rem = Math.max(0, goal.remaining_days - 1);
      db.prepare(`UPDATE goals SET remaining_days = ?, status = 'ACTIVE' WHERE id = ?`).run(rem, goalId);
    }

    const remainingEnergy = calculateRemainingEnergy();
    const deviationRisk = calculateRisk(0, remainingEnergy, goal.current_slope);
    return {
      success: true,
      actionTaken: 'MAINTAIN',
      newSlope: goal.current_slope,
      oldSlope: goal.current_slope,
      deviationRisk,
      remainingEnergy,
      totalEnergy: goal.total_energy,
      continuousFailDays: 0,
      companionSpeech: getVoice(goal.persona_type, 'ON_TRACK'),
      nextTasks: [],
      silent: true,
      showBubble: false,
    };
  }

  if (failedTaskId) {
    db.prepare(`UPDATE tasks SET status = 'FAILED', fail_reason = ?, updated_at = datetime('now'), failed_at = datetime('now'), attempt_count = attempt_count + 1 WHERE id = ? AND goal_id = ?`).run(reason ?? 'MISSED', failedTaskId, goalId);
  } else {
    db.prepare(`UPDATE tasks SET status = 'FAILED', fail_reason = ?, updated_at = datetime('now'), failed_at = datetime('now'), attempt_count = attempt_count + 1 WHERE goal_id = ? AND sequence_date = ? AND status = 'TODO'`).run(reason ?? 'MISSED', goalId, today);
  }

  const continuousFails = calculateContinuousFailDays();
  const failedEnergyRow = db.prepare(
    `SELECT COALESCE(SUM(energy_cost), 0) as energy FROM tasks WHERE goal_id = ? AND sequence_date = ? AND status = 'FAILED'`,
  ).get(goalId, today) as { energy: number };

  const oldSlope = goal.current_slope;
  let newSlope = oldSlope;
  let actionTaken = 'SMOOTH_SHARING';
  let speech = '';
  let silent = true;
  let showBubble = false;

  const insertTask = db.prepare(`
    INSERT INTO tasks (id, goal_id, sequence_date, content, energy_cost, created_at, source, attempt_count)
    VALUES (?, ?, ?, ?, ?, datetime('now'), 'reroute', ?)
  `);

  if (continuousFails <= 1) {
    actionTaken = 'SMOOTH_SHARING';
    newSlope = oldSlope + (failedEnergyRow.energy / Math.max(goal.remaining_days - 1, 1));
    speech = getVoice(goal.persona_type, 'MILD_MISSED', goal.drive_force);
    const rerouteTaskId = uid();
    insertTask.run(
      rerouteTaskId,
      goalId,
      tomorrow,
      `[动态调整] 重新承接未完成进度，平稳推进核心节点`,
      Math.max(5, newSlope * 0.7),
      2,
    );
  } else if (continuousFails <= 3) {
    actionTaken = 'TASK_DEGRADATION';
    newSlope = Math.max(1, oldSlope * 0.6);
    speech = getVoice(goal.persona_type, 'NEED_ENCOURAGE', goal.drive_force);
    silent = false;
    showBubble = true;
    insertTask.run(uid(), goalId, tomorrow, `[降级恢复] 极简原子行动：仅需投入极低精力完成触底复苏`, Math.max(5, newSlope * 0.5), 1);
  } else {
    actionTaken = 'CRITICAL_INTERVENTION';
    speech = getVoice(goal.persona_type, 'SHOCK_THERAPY', goal.drive_force);
    db.prepare(`UPDATE goals SET status = 'RISK_ALERT' WHERE id = ?`).run(goalId);
    silent = false;
    showBubble = true;
    newSlope = Math.max(1, oldSlope * 0.45);
    insertTask.run(uid(), goalId, tomorrow, `[危机重构] 与陪伴人格重新对齐目标驱动力`, Math.max(3, newSlope * 0.45), 1);
  }

  db.prepare(`UPDATE goals SET current_slope = ? WHERE id = ?`).run(newSlope, goalId);

  db.prepare(`
    INSERT INTO reroute_logs (id, goal_id, trigger_type, old_slope, new_slope, action_taken, persona_feedback)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uid(), goalId, `CONTINUOUS_FAIL_${continuousFails}`, oldSlope, newSlope, actionTaken, speech);

  const rows = db.prepare(
    `SELECT * FROM tasks WHERE goal_id = ? AND sequence_date = ? AND status = 'TODO'`,
  ).all(goalId, tomorrow) as TaskRow[];

  const nextTasks = rows.map(t => ({
    id: t.id,
    desc: t.content,
    time: Math.round(t.energy_cost),
    scheduledAt: '明日',
  }));

  const remainingEnergy = calculateRemainingEnergy();
  const deviationRisk = calculateRisk(continuousFails, remainingEnergy, newSlope);

  return {
    success: true,
    actionTaken,
    newSlope,
    oldSlope,
    deviationRisk,
    remainingEnergy,
    totalEnergy: goal.total_energy,
    continuousFailDays: continuousFails,
    companionSpeech: speech,
    nextTasks,
    silent,
    showBubble,
  };
}

// ── 接口 3：深夜巡逻（批量静默感知）──

export function coreNightPatrol(): NightPatrolOutput {
  const db = getCoreDb();
  const today = todayStr();

  const unfinishedTasks = db.prepare(
    `SELECT * FROM tasks WHERE sequence_date = ? AND status = 'TODO'`,
  ).all(today) as TaskRow[];

  let reRoutedCount = 0;

  for (const task of unfinishedTasks) {
    db.prepare(`UPDATE tasks SET status = 'FAILED', fail_reason = 'NIGHT_PATROL_SILENT_DETECT', updated_at = datetime('now'), failed_at = datetime('now'), attempt_count = attempt_count + 1 WHERE id = ?`).run(task.id);

    const goal = db.prepare(`SELECT * FROM goals WHERE id = ?`).get(task.goal_id) as GoalRow;
    if (!goal) continue;

    const addedSlope = task.energy_cost / Math.max(goal.remaining_days - 1, 1);
    const updatedSlope = goal.current_slope + addedSlope;

    db.prepare(`UPDATE goals SET current_slope = ? WHERE id = ?`).run(updatedSlope, goal.id);

    db.prepare(`
      INSERT INTO reroute_logs (id, goal_id, trigger_type, old_slope, new_slope, action_taken, persona_feedback)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid(), goal.id, 'NIGHT_PATROL', goal.current_slope, updatedSlope,
      'SMOOTH_SHARING', getVoice(goal.persona_type, 'NIGHT_PATROL', goal.drive_force),
    );

    reRoutedCount++;
  }

  return {
    success: true,
    msg: `深夜巡逻执行完毕。静默感知并平摊了 ${reRoutedCount} 个偏离目标的计划，无污染调整已生效。`,
    reRoutedCount,
  };
}

export function coreGetGoal(goalId: string): GoalRow | undefined {
  return getCoreDb().prepare(`SELECT * FROM goals WHERE id = ?`).get(goalId) as GoalRow | undefined;
}

export function coreListRerouteLogs(goalId: string) {
  return getCoreDb().prepare(
    `SELECT * FROM reroute_logs WHERE goal_id = ? ORDER BY timestamp DESC LIMIT 30`,
  ).all(goalId);
}

export type DirectoryWorkspaceGoalDto = {
  id: string;
  title: string;
  goalType: string;
  remainingDays: number;
  durationDays: number;
  totalEnergy: number;
  remainingEnergy: number;
  currentSlope: number;
  status: string;
  deviationRisk: number;
  todayTasks: Array<{
    id: string;
    content: string;
    status: string;
    energyCost: number;
    failReason: string | null;
  }>;
};

export type DirectoryWorkspaceDto = {
  directoryId: string;
  linkedToDirectory: boolean;
  goals: DirectoryWorkspaceGoalDto[];
  stats: { todoToday: number; doneToday: number; failedToday: number };
  suggestTemplateId?: string;
  suggestTitle?: string;
};

export function coreGetDirectoryWorkspace(userId: string, directoryId: string): DirectoryWorkspaceDto {
  const db = getCoreDb();
  const today = todayStr();
  const uid = userId.trim();
  const dirId = directoryId.trim();

  let goals = db
    .prepare(`SELECT * FROM goals WHERE directory_id = ? ORDER BY rowid DESC LIMIT 8`)
    .all(dirId) as GoalRow[];

  const linkedToDirectory = goals.length > 0;
  if (!goals.length && uid) {
    goals = db
      .prepare(
        `SELECT * FROM goals WHERE user_id = ? AND (directory_id IS NULL OR directory_id = '') ORDER BY rowid DESC LIMIT 3`,
      )
      .all(uid) as GoalRow[];
  }

  let todoToday = 0;
  let doneToday = 0;
  let failedToday = 0;

  const mapped: DirectoryWorkspaceGoalDto[] = goals.map((g) => {
    const tasks = db
      .prepare(`SELECT * FROM tasks WHERE goal_id = ? AND sequence_date = ? ORDER BY rowid ASC`)
      .all(g.id, today) as TaskRow[];
    for (const t of tasks) {
      if (t.status === 'TODO') todoToday += 1;
      if (t.status === 'DONE') doneToday += 1;
      if (t.status === 'FAILED') failedToday += 1;
    }
    const consumed = db
      .prepare(`SELECT COALESCE(SUM(energy_cost), 0) as c FROM tasks WHERE goal_id = ? AND status = 'DONE'`)
      .get(g.id) as { c: number };
    const remainingEnergy = Math.max(0, g.total_energy - Number(consumed.c ?? 0));
    const daysLeft = Math.max(g.remaining_days, 1);
    const requiredDaily = remainingEnergy / daysLeft;
    const baselineDaily = g.total_energy / Math.max(g.duration_days, 1);
    const deviationRisk = Math.min(
      99,
      Math.max(0, Math.round(Math.max(0, requiredDaily / Math.max(baselineDaily, 0.01) - 1) * 20)),
    );

    return {
      id: g.id,
      title: g.title,
      goalType: g.goal_type ?? 'GENERIC',
      remainingDays: g.remaining_days,
      durationDays: g.duration_days,
      totalEnergy: Math.round(g.total_energy),
      remainingEnergy: Math.round(remainingEnergy),
      currentSlope: Math.round(g.current_slope * 10) / 10,
      status: g.status,
      deviationRisk,
      todayTasks: tasks.map((t) => ({
        id: t.id,
        content: t.content,
        status: t.status,
        energyCost: Math.round(t.energy_cost),
        failReason: t.fail_reason,
      })),
    };
  });

  const suggestTemplateId = /TOEFL|托福/i.test(dirId) ? 'TOEFL_90_PRO' : undefined;
  const suggestTitle = suggestTemplateId ? '90 天托福破百作战' : undefined;

  return {
    directoryId: dirId,
    linkedToDirectory,
    goals: mapped,
    stats: { todoToday, doneToday, failedToday },
    suggestTemplateId: !linkedToDirectory ? suggestTemplateId : undefined,
    suggestTitle: !linkedToDirectory ? suggestTitle : undefined,
  };
}

export function coreGetTodayTasks(goalId: string) {
  return getCoreDb().prepare(
    `SELECT * FROM tasks WHERE goal_id = ? AND sequence_date = ?`,
  ).all(goalId, todayStr()) as TaskRow[];
}

/** 桥接：将核心输出转为 SPA 前端契约 */
export function bridgeDeconstructResponse(core: DeconstructOutput, title: string, days: number) {
  const durationDays = core.durationDays || days;
  return {
    code: 200,
    status: 'SUCCESS' as const,
    data: {
      sessionId: core.goalId,
      goalId: core.goalId,
      goalVector: title,
      category: core.templateName || '动态目标',
      totalDays: durationDays,
      durationDays,
      templateId: core.templateId,
      timeSlope: core.metrics.timeSlope.toFixed(4),
      energyTotal: Math.round(core.metrics.totalEnergy),
      remainingEnergy: Math.round(core.metrics.totalEnergy),
      deviationRisk: core.metrics.deviationRisk,
      totalMilestones: 3,
      todayTasks: core.todayTasks,
      roadmap: [
        { phase: 1, name: '认知觉醒与基石搭建', daysOffset: Math.floor(durationDays * 0.2), weight: '30%' },
        { phase: 2, name: '核心瓶颈攻坚', daysOffset: Math.floor(durationDays * 0.6), weight: '40%' },
        { phase: 3, name: '极限冲刺与终局对齐', daysOffset: Math.floor(durationDays * 0.9), weight: '30%' },
      ],
      persona: { id: 'iron-coach', name: core.personaName, greeting: core.companionSpeech },
      driveLocked: false,
      trackingMode: 'ZERO_INVASION',
      decomposeNote: 'WuxianCoreEngine 能量微积分已计算初始斜率',
      matchSource: 'core_engine',
      persisted: true,
      industrial: true,
      success: core.success,
      metrics: core.metrics,
      companionSpeech: core.companionSpeech,
    },
  };
}

export function bridgeRerouteResponse(core: RerouteOutput) {
  return {
    code: 200,
    status: 'SUCCESS' as const,
    data: {
      success: core.success,
      actionTaken: core.actionTaken,
      action: core.actionTaken,
      strategy: core.actionTaken,
      stage: core.actionTaken,
      rerouteStatus: core.actionTaken,
      newTimeSlope: core.newSlope.toFixed(4),
      newSlope: core.newSlope,
      adjustedTotalDays: 0,
      remainingEnergy: Math.round(core.remainingEnergy),
      energyTotal: Math.round(core.totalEnergy),
      totalEnergy: Math.round(core.totalEnergy),
      continuousFailDays: core.continuousFailDays,
      message: core.companionSpeech,
      activePersonaName: '陪伴人格',
      emotionalHook: core.showBubble ? core.companionSpeech : null,
      tomorrowTasks: core.nextTasks,
      nextTasks: core.nextTasks,
      silent: core.silent,
      showBubble: core.showBubble,
      goalDowngradeSuggested: core.actionTaken === 'CRITICAL_INTERVENTION',
      taskGranularity: core.actionTaken === 'TASK_DEGRADATION' ? 'reduced' : core.actionTaken === 'CRITICAL_INTERVENTION' ? 'micro' : 'normal',
      deviationRisk: core.deviationRisk,
      companionSpeech: core.companionSpeech,
      rerouteLogId: '',
      lifeBehavior: {
        phase: core.actionTaken,
        form: core.showBubble ? 'B_EMOTIONAL_PULSE' : 'A_SILENT_RIVER',
        silent: core.silent,
        showPulse: core.showBubble,
        pulseMessage: core.showBubble ? core.companionSpeech : null,
        treeholeMessage: null,
        companionNote: core.companionSpeech,
        timelineExtension: 0,
        slopeDelta: core.newSlope - core.oldSlope,
      },
    },
  };
}
