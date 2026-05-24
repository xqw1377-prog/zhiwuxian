/**
 * WUXIAN · 深夜零入侵巡逻（工业级）
 *
 * 执行逻辑：
 *   23:30 触发 → 扫描未打卡用户 → 差异化策略
 *   · 高完成率用户今天没动 → 完全静默，只调 rerouteGoal
 *   · 降级边缘用户 → 极度克制的气泡推送
 */

import { getIndustrialStore, dateToISO } from '../storage/industrial-store';
import { rerouteGoalIndustrial } from './industrial-reroute';
import { industrialToPersona } from './persona-switcher';
import type { GoalArchetype } from './persona-switcher';

export interface NightPatrolBatchResult {
  scannedAt: string;
  totalGoals: number;
  silentReroutes: number;
  bubblePushes: number;
  noAction: number;
  results: NightPatrolItemResult[];
}

export interface NightPatrolItemResult {
  goalId: string;
  userId: string;
  title: string;
  patrolType: 'NO_ACTION' | 'SILENT_REROUTE' | 'BUBBLE_PUSH';
  completionRate: number;
  continuousFailDays: number;
  action: string;
  companionSpeech: string | null;
  silent: boolean;
  newSlope: number;
}

export interface NightPatrolSingleInput {
  goalId: string;
  archetype?: GoalArchetype;
  goalTitle?: string;
  forcePatrol?: boolean;
}

const HIGH_COMPLETION_THRESHOLD = 0.7;
const BUBBLE_EDGE_FAIL_DAYS = 2;

export function runIndustrialNightPatrol(input: NightPatrolSingleInput): NightPatrolItemResult {
  const db = getIndustrialStore();
  const goal = db.findGoalById(input.goalId);
  if (!goal) throw new Error(`[NightPatrol] Goal not found: ${input.goalId}`);

  const today = dateToISO();
  const todayTasks = db.getTodayTasks(goal.id, today);
  const allDone = todayTasks.length > 0 && todayTasks.every(t => t.status === 'DONE');

  if (allDone && !input.forcePatrol) {
    return {
      goalId: goal.id,
      userId: goal.userId,
      title: goal.title,
      patrolType: 'NO_ACTION',
      completionRate: db.getCompletionRate(goal.id),
      continuousFailDays: 0,
      action: 'NO_CHANGES',
      companionSpeech: null,
      silent: true,
      newSlope: goal.currentSlope,
    };
  }

  const completionRate = db.getCompletionRate(goal.id);
  const result = rerouteGoalIndustrial({
    goalId: goal.id,
    currentDate: new Date(),
    trigger: 'night_patrol',
    archetype: input.archetype,
    goalTitle: input.goalTitle ?? goal.title,
  });

  const atBubbleEdge = result.continuousFailDays >= BUBBLE_EDGE_FAIL_DAYS;
  const highCompleter = completionRate >= HIGH_COMPLETION_THRESHOLD;

  if (highCompleter && result.continuousFailDays === 1) {
    return {
      goalId: goal.id,
      userId: goal.userId,
      title: goal.title,
      patrolType: 'SILENT_REROUTE',
      completionRate,
      continuousFailDays: result.continuousFailDays,
      action: result.action,
      companionSpeech: null,
      silent: true,
      newSlope: result.newSlope,
    };
  }

  if (atBubbleEdge || result.showBubble) {
    return {
      goalId: goal.id,
      userId: goal.userId,
      title: goal.title,
      patrolType: 'BUBBLE_PUSH',
      completionRate,
      continuousFailDays: result.continuousFailDays,
      action: result.action,
      companionSpeech: result.companionSpeech,
      silent: false,
      newSlope: result.newSlope,
    };
  }

  return {
    goalId: goal.id,
    userId: goal.userId,
    title: goal.title,
    patrolType: 'SILENT_REROUTE',
    completionRate,
    continuousFailDays: result.continuousFailDays,
    action: result.action,
    companionSpeech: null,
    silent: true,
    newSlope: result.newSlope,
  };
}

export function runNightPatrolBatch(): NightPatrolBatchResult {
  const db = getIndustrialStore();
  const goals = db.listActiveGoals();
  const results: NightPatrolItemResult[] = [];

  for (const goal of goals) {
    try {
      const r = runIndustrialNightPatrol({ goalId: goal.id, goalTitle: goal.title });
      results.push(r);
    } catch {
      /* skip broken goals */
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    totalGoals: goals.length,
    silentReroutes: results.filter(r => r.patrolType === 'SILENT_REROUTE').length,
    bubblePushes: results.filter(r => r.patrolType === 'BUBBLE_PUSH').length,
    noAction: results.filter(r => r.patrolType === 'NO_ACTION').length,
    results,
  };
}

export function isPatrolWindow(now = new Date()): boolean {
  const hour = now.getHours();
  const minute = now.getMinutes();
  return hour === 23 && minute >= 30 || hour === 0 && minute < 30;
}
