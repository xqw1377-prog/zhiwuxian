/**
 * WUXIAN · 工业级引擎桥接层
 * 同步 industrial-store ↔ DreamSpace 双写，保证引擎数学层与持久化层一致
 */

import { getIndustrialStore } from '../storage/industrial-store';
import { rerouteGoalIndustrial, syncGoalFromSession } from '../core/industrial-reroute';
import { runIndustrialNightPatrol } from '../core/industrial-night-patrol';
import { industrialToPersona } from '../core/persona-switcher';
import type { SessionEntry } from '../api/deconstruct';
import type { GoalArchetype, PersonaId } from '../core/persona-switcher';

export function bootstrapIndustrialGoal(session: SessionEntry, sessionId: string, userId: string, tasks: { id: string; desc: string; time: number }[]) {
  syncGoalFromSession({
    sessionId,
    userId,
    title: session.goal,
    totalDays: session.totalDays,
    driveForce: session.driveWhy,
    totalEnergy: session.dreamSpace.energyMatrix.totalEnergyRequired,
    currentSlope: session.dreamSpace.timeSlope.currentSlope,
    personaId: session.primaryPersona,
    todayTasks: tasks,
  });
}

export function executeIndustrialReroute(
  session: SessionEntry,
  sessionId: string,
  opts: {
    todayCompleted: boolean;
    userSignal?: string;
    trigger?: 'manual' | 'night_patrol' | 'user_help';
  },
) {
  const result = rerouteGoalIndustrial({
    goalId: sessionId,
    todayCompleted: opts.todayCompleted,
    userSignal: opts.userSignal,
    trigger: opts.trigger ?? (opts.userSignal ? 'user_help' : 'manual'),
    archetype: session.archetype as GoalArchetype,
    goalTitle: session.goal,
  });

  session.dreamSpace.timeSlope.currentSlope = result.newSlope;
  session.dreamSpace.timeSlope.dailyEnergyKPI = result.newSlope;
  session.dreamSpace.timeBaseline.totalDays = session.totalDays;

  if (opts.todayCompleted) {
    session.patrol.consecutiveMissDays = 0;
    session.patrol.todayCompleted = true;
  } else if (result.continuousFailDays > 0) {
    session.patrol.consecutiveMissDays = result.continuousFailDays;
    session.patrol.currentDay += 1;
  }

  const personaId = industrialToPersona(
    getIndustrialStore().findGoalById(sessionId)?.personaType ?? 'BUDDY',
  );

  return { result, personaId };
}

export function executeIndustrialNightPatrol(session: SessionEntry, sessionId: string) {
  session.patrol.todayCompleted = false;
  const patrol = runIndustrialNightPatrol({
    goalId: sessionId,
    archetype: session.archetype as GoalArchetype,
    goalTitle: session.goal,
  });

  session.dreamSpace.timeSlope.currentSlope = patrol.newSlope;
  session.dreamSpace.timeSlope.dailyEnergyKPI = patrol.newSlope;

  if (patrol.continuousFailDays > 0) {
    session.patrol.consecutiveMissDays = patrol.continuousFailDays;
  }

  return patrol;
}

export function getIndustrialRerouteHistory(goalId: string) {
  const db = getIndustrialStore();
  return {
    code: 200,
    status: 'SUCCESS' as const,
    data: {
      logs: db.listRerouteLogs(goalId),
      goal: db.findGoalById(goalId),
      tasks: db.getTodayTasks(goalId),
      completionRate: db.getCompletionRate(goalId),
    },
  };
}

export function personaNameFromId(pid: PersonaId): string {
  const names: Record<PersonaId, string> = {
    'iron-coach': '铁血教练',
    'growth-companion': '养成系伙伴',
    'spirit-mentor': '精神导师',
  };
  return names[pid];
}
