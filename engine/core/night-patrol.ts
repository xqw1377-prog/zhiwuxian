/**
 * WUXIAN · 深夜零入侵巡逻引擎 (Night Patrol)
 * 用户未打卡时，系统在后台静默重算，不弹窗、不指责
 */

import type { WuxianCoreEngine } from './wuxian-core-engine';
import { buildEmotionalWake, resolveSlumpPersona, type PersonaId } from './persona-switcher';

export interface PatrolState {
  sessionId: string;
  currentDay: number;
  consecutiveMissDays: number;
  lastCheckIn: string | null;
  lastPatrolAt: string | null;
  todayCompleted: boolean;
}

export interface NightPatrolResult {
  patrolType: 'SILENT_REROUTE' | 'EMOTIONAL_WAKE' | 'NO_ACTION';
  consecutiveMissDays: number;
  newTimeSlope: string;
  strategy: string;
  activePersona: PersonaId;
  message: string;
  emotionalHook: string | null;
  silent: boolean;
}

export function createPatrolState(sessionId: string): PatrolState {
  return {
    sessionId,
    currentDay: 1,
    consecutiveMissDays: 0,
    lastCheckIn: null,
    lastPatrolAt: null,
    todayCompleted: false,
  };
}

/**
 * 模拟深夜巡逻：用户今日未打开系统
 */
export function runNightPatrol(
  state: PatrolState,
  engine: WuxianCoreEngine,
  ctx: {
    driveWhy: string;
    primaryPersona: PersonaId;
    isDeadlineFixed: boolean;
  },
): NightPatrolResult {
  if (state.todayCompleted) {
    state.consecutiveMissDays = 0;
    return {
      patrolType: 'NO_ACTION',
      consecutiveMissDays: 0,
      newTimeSlope: '0',
      strategy: 'none',
      activePersona: ctx.primaryPersona,
      message: '今日已达成，航线正常。',
      emotionalHook: null,
      silent: true,
    };
  }

  state.consecutiveMissDays += 1;
  state.currentDay += 1;
  state.lastPatrolAt = new Date().toISOString();

  const ds = engine.getDreamSpace();
  if (!ds) throw new Error('[NightPatrol] Dream space not found');

  const remaining = ds.energyMatrix.remainingEnergy;
  const result = engine.triggerDynamicRerouting({
    currentDay: state.currentDay,
    remainingEnergy: remaining,
    todayCompleted: false,
    consecutiveFailDays: state.consecutiveMissDays,
  });

  const activePersona = resolveSlumpPersona(ctx.primaryPersona, state.consecutiveMissDays);
  const emotionalHook = buildEmotionalWake(ctx.driveWhy, state.consecutiveMissDays);

  if (state.consecutiveMissDays >= 5) {
    return {
      patrolType: 'EMOTIONAL_WAKE',
      consecutiveMissDays: state.consecutiveMissDays,
      newTimeSlope: result.newDailySlope.toFixed(4),
      strategy: result.strategy,
      activePersona,
      message: `连续 ${state.consecutiveMissDays} 天未打卡。航线已静默重算，难度下调。情绪树洞已预埋唤醒消息。`,
      emotionalHook,
      silent: true,
    };
  }

  return {
    patrolType: 'SILENT_REROUTE',
    consecutiveMissDays: state.consecutiveMissDays,
    newTimeSlope: result.newDailySlope.toFixed(4),
    strategy: result.strategy,
    activePersona,
    message: `深夜巡逻：检测到执行缺口，斜率已静默微调至 ${result.newDailySlope.toFixed(4)}。`,
    emotionalHook: null,
    silent: true,
  };
}

export function recordCheckIn(state: PatrolState): void {
  state.todayCompleted = true;
  state.lastCheckIn = new Date().toISOString();
  state.consecutiveMissDays = 0;
}

export function resetDailyState(state: PatrolState): void {
  state.todayCompleted = false;
}
