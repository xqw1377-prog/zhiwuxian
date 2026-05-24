/**
 * WUXIAN · 工业级动态重路由引擎
 * 像高德地图一样：走错路，自动重新规划
 */

import {
  getIndustrialStore,
  calculateContinuousFails,
  dateToISO,
  nextDateISO,
  type GoalRecord,
  type RerouteAction,
  type TaskRecord,
} from '../storage/industrial-store';
import { getPersonaSpeech, personaToIndustrial, type PersonaId } from './persona-switcher';
import { forgeAtomTasks, type AtomTaskDTO } from './atom-forge';
import type { GoalArchetype } from './persona-switcher';

export type TaskGenerationMode = 'STANDARD' | 'MINI_STEPS' | 'MICRO';

export interface IndustrialRerouteInput {
  goalId: string;
  currentDate?: Date;
  userSignal?: string;
  todayCompleted?: boolean;
  archetype?: GoalArchetype;
  goalTitle?: string;
  trigger?: 'manual' | 'night_patrol' | 'user_help';
}

export interface IndustrialRerouteOutput {
  status: 'NO_CHANGES' | 'REROUTED' | 'CRISIS';
  action: RerouteAction;
  companionSpeech: string;
  oldSlope: number;
  newSlope: number;
  continuousFailDays: number;
  silent: boolean;
  showBubble: boolean;
  nextTasks: AtomTaskDTO[];
  taskMode: TaskGenerationMode;
  goalStatus: GoalRecord['status'];
  rerouteLogId: string;
}

export function generateNextDayTasks(
  goalId: string,
  currentDate: string,
  mode: TaskGenerationMode,
  goalTitle: string,
  archetype: GoalArchetype,
): TaskRecord[] {
  const db = getIndustrialStore();
  const tomorrow = nextDateISO(currentDate);
  const granularity =
    mode === 'MICRO' ? 'micro' as const
      : mode === 'MINI_STEPS' ? 'reduced' as const
        : 'normal' as const;
  const count = mode === 'MICRO' ? 1 : mode === 'MINI_STEPS' ? 2 : 3;

  const atoms = forgeAtomTasks(goalTitle, archetype, count, { granularity, missDays: mode === 'MINI_STEPS' ? 2 : 0 });

  return db.createTasks(atoms.map(a => ({
    goalId,
    sequenceDate: tomorrow,
    content: a.desc,
    energyCost: a.time * (granularity === 'micro' ? 0.3 : granularity === 'reduced' ? 0.6 : 1),
    status: 'TODO' as const,
  })));
}

export function handleGoalCrisis(goal: GoalRecord, reason: string): IndustrialRerouteOutput {
  const db = getIndustrialStore();
  db.updateGoal(goal.id, { status: 'RISK_ALERT', remainingDays: 0 });

  const speech = getPersonaSpeech(goal.personaType, 'SHOCK_THERAPY', goal.driveForce);
  const log = db.createRerouteLog({
    goalId: goal.id,
    triggerType: reason,
    oldSlope: goal.currentSlope,
    newSlope: goal.currentSlope * 0.5,
    actionTaken: 'TIME_EXHAUSTED',
    personaFeedback: speech,
  });

  db.updateSlope(goal.id, goal.currentSlope * 0.5);

  return {
    status: 'CRISIS',
    action: 'TIME_EXHAUSTED',
    companionSpeech: speech,
    oldSlope: goal.currentSlope,
    newSlope: goal.currentSlope * 0.5,
    continuousFailDays: 0,
    silent: false,
    showBubble: true,
    nextTasks: [],
    taskMode: 'MICRO',
    goalStatus: 'RISK_ALERT',
    rerouteLogId: log.id,
  };
}

export function rerouteGoalIndustrial(input: IndustrialRerouteInput): IndustrialRerouteOutput {
  const db = getIndustrialStore();
  const currentDate = (input.currentDate ?? new Date()).toISOString().slice(0, 10);

  const goal = db.findGoalById(input.goalId);
  if (!goal) throw new Error(`[IndustrialReroute] Goal not found: ${input.goalId}`);

  if (input.todayCompleted) {
    db.markTasksByGoalDate(goal.id, currentDate, 'DONE');
    const remaining = Math.max(0, goal.remainingDays - 1);
    db.updateGoal(goal.id, { remainingDays: remaining });

    const log = db.createRerouteLog({
      goalId: goal.id,
      triggerType: 'COMPLETION',
      oldSlope: goal.currentSlope,
      newSlope: goal.currentSlope,
      actionTaken: 'MAINTAIN',
      personaFeedback: getPersonaSpeech(goal.personaType, 'ON_TRACK'),
    });

    return {
      status: 'NO_CHANGES',
      action: 'MAINTAIN',
      companionSpeech: getPersonaSpeech(goal.personaType, 'ON_TRACK'),
      oldSlope: goal.currentSlope,
      newSlope: goal.currentSlope,
      continuousFailDays: 0,
      silent: true,
      showBubble: false,
      nextTasks: [],
      taskMode: 'STANDARD',
      goalStatus: goal.status,
      rerouteLogId: log.id,
    };
  }

  db.markTasksByGoalDate(goal.id, currentDate, 'FAILED', input.userSignal ?? 'MISSED');

  const failedTasks = db.findTasks({ goalId: goal.id, status: 'FAILED' });

  let continuousFailDays = calculateContinuousFails(failedTasks, currentDate);
  if (continuousFailDays === 0 && (input.trigger === 'night_patrol' || input.userSignal)) {
    continuousFailDays = 1;
  }

  if (continuousFailDays === 0 && !input.userSignal) {
    return {
      status: 'NO_CHANGES',
      action: 'NO_CHANGES',
      companionSpeech: getPersonaSpeech(goal.personaType, 'ON_TRACK'),
      oldSlope: goal.currentSlope,
      newSlope: goal.currentSlope,
      continuousFailDays: 0,
      silent: true,
      showBubble: false,
      nextTasks: [],
      taskMode: 'STANDARD',
      goalStatus: goal.status,
      rerouteLogId: '',
    };
  }

  const remainingDays = goal.remainingDays;
  if (remainingDays <= 0) {
    return handleGoalCrisis(goal, 'TIME_EXHAUSTED');
  }

  const oldSlope = goal.currentSlope;
  let action: RerouteAction;
  let newSlope = oldSlope;
  let taskMode: TaskGenerationMode = 'STANDARD';
  let silent = true;
  let showBubble = false;
  let goalStatus: GoalRecord['status'] = goal.status;
  let speechContext: Parameters<typeof getPersonaSpeech>[1] = 'MILD_MISSED';

  if (continuousFailDays === 1) {
    action = 'SMOOTH_SHARING';
    const missedEnergy = failedTasks
      .filter(t => t.sequenceDate === currentDate || t.sequenceDate < currentDate)
      .slice(-3)
      .reduce((sum, t) => sum + t.energyCost, 0) || oldSlope;
    const slopeIncrement = missedEnergy / Math.max(1, remainingDays);
    newSlope = oldSlope + slopeIncrement;
    taskMode = 'STANDARD';
    speechContext = 'MILD_MISSED';
    silent = true;
  } else if (continuousFailDays >= 2 && continuousFailDays <= 3) {
    action = 'TASK_DEGRADATION';
    newSlope = oldSlope * 0.6;
    taskMode = 'MINI_STEPS';
    speechContext = 'REROUTE_PUSH';
    silent = true;
    showBubble = input.trigger === 'night_patrol';
  } else {
    action = 'CRITICAL_INTERVENTION';
    newSlope = oldSlope * 0.45;
    taskMode = 'MICRO';
    goalStatus = 'RISK_ALERT';
    speechContext = 'SHOCK_THERAPY';
    silent = false;
    showBubble = true;
    db.updateGoal(goal.id, { status: 'RISK_ALERT' });
  }

  if (input.userSignal === 'TASK_TOO_HARD' && continuousFailDays <= 1) {
    action = 'TASK_DEGRADATION';
    newSlope = oldSlope * 0.75;
    taskMode = 'MINI_STEPS';
    speechContext = 'NEED_ENCOURAGE';
  }

  db.updateSlope(goal.id, newSlope);
  db.updateGoal(goal.id, { remainingDays: Math.max(0, remainingDays - 1), status: goalStatus });

  const companionSpeech = getPersonaSpeech(
    goal.personaType,
    input.trigger === 'night_patrol' && continuousFailDays >= 2 ? 'NIGHT_PATROL' : speechContext,
    goal.driveForce,
  );

  const archetype = input.archetype ?? 'clearance';
  const title = input.goalTitle ?? goal.title;
  const created = generateNextDayTasks(goal.id, currentDate, taskMode, title, archetype);

  const log = db.createRerouteLog({
    goalId: goal.id,
    triggerType: input.trigger === 'night_patrol'
      ? 'NIGHT_PATROL'
      : input.userSignal
        ? 'USER_HELP'
        : `FAIL_DAYS_${continuousFailDays}`,
    oldSlope,
    newSlope,
    actionTaken: action,
    personaFeedback: companionSpeech,
  });

  return {
    status: 'REROUTED',
    action,
    companionSpeech,
    oldSlope,
    newSlope,
    continuousFailDays,
    silent,
    showBubble,
    nextTasks: created.map(t => ({
      id: t.id,
      desc: t.content,
      time: Math.round(t.energyCost),
      scheduledAt: `明日`,
      nodeType: archetype,
    })),
    taskMode,
    goalStatus,
    rerouteLogId: log.id,
  };
}

export function syncGoalFromSession(params: {
  sessionId: string;
  userId: string;
  title: string;
  totalDays: number;
  driveForce: string;
  totalEnergy: number;
  currentSlope: number;
  personaId: PersonaId;
  todayTasks: { id: string; desc: string; time: number }[];
}): GoalRecord {
  const db = getIndustrialStore();
  const existing = db.findGoalById(params.sessionId);
  if (existing) return existing;

  const goal = db.createGoal({
    id: params.sessionId,
    userId: params.userId,
    title: params.title,
    durationDays: params.totalDays,
    remainingDays: params.totalDays,
    driveForce: params.driveForce,
    totalEnergy: params.totalEnergy,
    currentSlope: params.currentSlope,
    status: 'ACTIVE',
    personaType: personaToIndustrial(params.personaId),
  });

  const today = dateToISO();
  db.createTasks(params.todayTasks.map(t => ({
    goalId: goal.id,
    sequenceDate: today,
    content: t.desc,
    energyCost: t.time,
    status: 'TODO' as const,
  })));

  return goal;
}
