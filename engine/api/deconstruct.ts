/**
 * WUXIAN · /api/v1 核心 API
 * 工业级动态目标路由器 — goals/tasks/reroute_logs 三表 + 抗放弃重路由
 */

import { WuxianCoreEngine } from '../core/wuxian-core-engine';
import { decomposeGoalSmart } from '../core/goal-decomposer';
import { resolvePersona, type PersonaId } from '../core/persona-switcher';
import { createPatrolState, type PatrolState } from '../core/night-patrol';
import { createLifeMemory, type LifeMemory } from '../core/life-behavior';
import { getPersistence } from '../storage/persistence';
import {
  bootstrapIndustrialGoal,
  executeIndustrialReroute,
  executeIndustrialNightPatrol,
  getIndustrialRerouteHistory as getIndustrialHistory,
  personaNameFromId,
} from './industrial-goal';
import { runNightPatrolBatch } from '../core/industrial-night-patrol';
import type { DreamSpace, Milestone } from '../core/types';

// ── 类型 ──

export interface DriveSource { why: string; intensity?: number; }

export interface DeconstructRequest {
  goal: string;
  totalDays: number;
  currentStatus?: string;
  isDeadlineFixed?: boolean;
  driveSource?: DriveSource;
  userId?: string;
  dailyMinutesAvailable?: number;
}

export interface RoadmapPhase { phase: number; name: string; daysOffset: number; weight: string; }

export interface TodayTaskDTO { id: string; desc: string; time: number; scheduledAt?: string; }

export interface DeconstructResponse {
  code: number;
  status: 'SUCCESS' | 'ERROR';
  data: {
    sessionId: string;
    goalVector: string;
    category: string;
    timeSlope: string;
    energyTotal: number;
    remainingEnergy: number;
    totalMilestones: number;
    deviationRisk: number;
    roadmap: RoadmapPhase[];
    todayTasks: TodayTaskDTO[];
    dreamSpaceId: string;
    persona: { id: PersonaId; name: string; greeting: string };
    driveLocked: boolean;
    trackingMode: 'ZERO_INVASION';
    decomposeNote: string;
    matchSource: string;
    persisted: boolean;
    industrial: boolean;
  };
}

export interface RerouteRequest {
  sessionId: string;
  currentDay?: number;
  todayCompleted: boolean;
  consecutiveFailDays?: number;
  userSignal?: string;
}

export interface LifeBehaviorDTO {
  phase: string;
  form: 'A_SILENT_RIVER' | 'B_EMOTIONAL_PULSE' | 'NONE';
  silent: boolean;
  showPulse: boolean;
  pulseMessage: string | null;
  treeholeMessage: string | null;
  companionNote: string;
  timelineExtension: number;
  slopeDelta: number;
}

export interface RerouteResponse {
  code: number;
  status: 'SUCCESS';
  data: {
    rerouteStatus: string;
    strategy: string;
    stage: string;
    action: string;
    newTimeSlope: string;
    adjustedTotalDays: number;
    message: string;
    activePersona: PersonaId;
    activePersonaName: string;
    emotionalHook: string | null;
    tomorrowTasks: TodayTaskDTO[];
    silent: boolean;
    goalDowngradeSuggested: boolean;
    taskGranularity: string;
    lifeBehavior: LifeBehaviorDTO;
    rerouteLogId: string;
    showBubble: boolean;
  };
}

export interface NightPatrolRequest { sessionId: string; userSignal?: string; }

export interface NightPatrolResponse {
  code: number;
  status: 'SUCCESS';
  data: {
    patrolType: string;
    consecutiveMissDays: number;
    newTimeSlope: string;
    message: string;
    emotionalHook: string | null;
    activePersona: PersonaId;
    silent: boolean;
    stage: string;
    action: string;
    showBubble: boolean;
    completionRate: number;
    lifeBehavior: LifeBehaviorDTO;
    rerouteLogId: string;
  };
}

export interface SessionEntry {
  engine: WuxianCoreEngine;
  dreamSpace: DreamSpace;
  totalDays: number;
  isDeadlineFixed: boolean;
  goal: string;
  driveWhy: string;
  primaryPersona: PersonaId;
  personaName: string;
  archetype: 'clearance' | 'endurance' | 'creation';
  patrol: PatrolState;
  life: LifeMemory;
}

const sessions = new Map<string, SessionEntry>();

const ACTION_TO_STAGE: Record<string, string> = {
  SMOOTH_SHARING: 'SILENT_REDISTRIBUTE',
  TASK_DEGRADATION: 'CELL_SPLIT',
  CRITICAL_INTERVENTION: 'PERSONA_INTERVENTION',
  TIME_EXHAUSTED: 'SOFT_DOWNGRADE',
  MAINTAIN: 'ON_TRACK',
  NO_CHANGES: 'ON_TRACK',
};

const ACTION_TO_GRANULARITY: Record<string, string> = {
  SMOOTH_SHARING: 'normal',
  TASK_DEGRADATION: 'reduced',
  CRITICAL_INTERVENTION: 'micro',
  TIME_EXHAUSTED: 'micro',
  MAINTAIN: 'normal',
  NO_CHANGES: 'normal',
};

function uid(): string {
  return 'sess-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function milestonesToRoadmap(milestones: Milestone[], totalDays: number): RoadmapPhase[] {
  const phaseNames = ['认知觉醒与基石搭建', '核心瓶颈攻坚与专项突围', '极限冲刺与终局对齐'];
  if (milestones.length === 0) {
    return phaseNames.map((name, i) => ({
      phase: i + 1, name,
      daysOffset: Math.floor(totalDays * [0.2, 0.6, 0.9][i]),
      weight: ['20%', '50%', '30%'][i],
    }));
  }
  const perChunk = Math.ceil(milestones.length / 3);
  return phaseNames.map((name, i) => {
    const ms = milestones[i * perChunk];
    return {
      phase: i + 1,
      name: ms?.label ?? name,
      daysOffset: ms ? Math.floor((ms.weekIndex / Math.max(1, Math.ceil(totalDays / 7))) * totalDays) : Math.floor(totalDays * [0.2, 0.6, 0.9][i]),
      weight: ['20%', '50%', '30%'][i],
    };
  });
}

function hydrateSession(record: ReturnType<ReturnType<typeof getPersistence>['getSession']>): SessionEntry | undefined {
  if (!record) return undefined;
  const engine = new WuxianCoreEngine();
  engine.restoreDreamSpace(record.dreamSpace);
  const entry: SessionEntry = {
    engine,
    dreamSpace: record.dreamSpace,
    totalDays: record.totalDays,
    isDeadlineFixed: record.isDeadlineFixed,
    goal: record.goal,
    driveWhy: record.driveWhy,
    primaryPersona: record.primaryPersona,
    personaName: record.personaName,
    archetype: record.archetype,
    patrol: record.patrol,
    life: record.life,
  };
  sessions.set(record.id, entry);
  return entry;
}

function persistSession(sessionId: string, entry: SessionEntry): void {
  getPersistence().updateSession(sessionId, {
    dreamSpace: entry.dreamSpace,
    patrol: entry.patrol,
    life: entry.life,
    totalDays: entry.dreamSpace.timeBaseline.totalDays,
  });
}

function toLifeDTO(action: string, silent: boolean, showBubble: boolean, speech: string, oldSlope: number, newSlope: number): LifeBehaviorDTO {
  return {
    phase: ACTION_TO_STAGE[action] ?? action,
    form: showBubble ? 'B_EMOTIONAL_PULSE' : silent ? 'A_SILENT_RIVER' : 'NONE',
    silent,
    showPulse: showBubble,
    pulseMessage: showBubble ? speech : null,
    treeholeMessage: showBubble ? speech : null,
    companionNote: speech,
    timelineExtension: 0,
    slopeDelta: newSlope - oldSlope,
  };
}

function tasksToDTO(tasks: { id: string; desc: string; time: number; scheduledAt?: string }[]): TodayTaskDTO[] {
  return tasks.map(t => ({ id: t.id, desc: t.desc, time: t.time, scheduledAt: t.scheduledAt }));
}

function loadSession(sessionId: string): SessionEntry {
  let session = sessions.get(sessionId);
  if (!session) session = hydrateSession(getPersistence().getSession(sessionId));
  if (!session) throw new Error('[WUXIAN] Session not found');
  return session;
}

// ── 解构 ──

export function deconstructGoal(req: DeconstructRequest): DeconstructResponse {
  const smart = decomposeGoalSmart({
    goal: req.goal,
    totalDays: req.totalDays,
    currentStatus: req.currentStatus,
    dailyMinutesAvailable: req.dailyMinutesAvailable ?? 45,
  });

  const engine = new WuxianCoreEngine();
  const result = engine.initializeDreamSpace({
    goalBaseline: req.goal,
    timeBaseline: req.totalDays,
    isDeadlineFixed: req.isDeadlineFixed ?? true,
    currentStatus: req.currentStatus ?? '',
  });

  const persona = resolvePersona(req.goal, req.totalDays);
  const sessionId = uid();
  const userId = req.userId ?? sessionId;
  const patrol = createPatrolState(sessionId);
  const life = createLifeMemory(userId, req.goal, req.driveSource?.why ?? '');

  const entry: SessionEntry = {
    engine,
    dreamSpace: result.dreamSpace,
    totalDays: req.totalDays,
    isDeadlineFixed: req.isDeadlineFixed ?? true,
    goal: req.goal,
    driveWhy: req.driveSource?.why ?? '',
    primaryPersona: persona.primaryPersona,
    personaName: persona.primaryName,
    archetype: smart.archetype,
    patrol,
    life,
  };
  sessions.set(sessionId, entry);

  const db = getPersistence();
  db.ensureUser(userId);
  db.createSession({
    id: sessionId, userId, goal: req.goal, totalDays: req.totalDays,
    isDeadlineFixed: req.isDeadlineFixed ?? true, driveWhy: req.driveSource?.why ?? '',
    primaryPersona: persona.primaryPersona, personaName: persona.primaryName,
    archetype: smart.archetype, dreamSpace: result.dreamSpace, patrol, life,
  });

  const todayTasks = smart.firstWeekTasks.slice(0, 3);
  db.saveTasks(sessionId, todayTasks.map(t => ({
    taskId: t.id, description: t.desc, durationMinutes: t.time,
    scheduledDay: 1, completed: false, source: 'deconstruct' as const, difficultyWeight: 1,
  })));

  bootstrapIndustrialGoal(entry, sessionId, userId, todayTasks.map(t => ({ id: t.id, desc: t.desc, time: t.time })));

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      sessionId,
      goalVector: req.goal,
      category: smart.category,
      timeSlope: result.initialSlope.toFixed(4),
      energyTotal: Math.round(result.dreamSpace.energyMatrix.totalEnergyRequired),
      remainingEnergy: Math.round(result.dreamSpace.energyMatrix.remainingEnergy),
      totalMilestones: result.totalMilestones,
      deviationRisk: +(result.deviationRisk * 100).toFixed(1),
      roadmap: smart.milestonePreview.length
        ? smart.milestonePreview.map((m, i) => ({
            phase: m.phase, name: m.name,
            daysOffset: Math.floor(req.totalDays * (i + 1) / smart.milestonePreview.length),
            weight: `${Math.round(m.energyPct * 100)}%`,
          }))
        : milestonesToRoadmap(result.milestones, req.totalDays),
      todayTasks: tasksToDTO(todayTasks),
      dreamSpaceId: result.dreamSpace.id,
      persona: { id: persona.primaryPersona, name: persona.primaryName, greeting: persona.greeting },
      driveLocked: !!req.driveSource?.why,
      trackingMode: 'ZERO_INVASION',
      decomposeNote: smart.decomposeNote,
      matchSource: smart.matchSource,
      persisted: true,
      industrial: true,
    },
  };
}

// ── 工业级 Rerouting ──

export function rerouteGoal(req: RerouteRequest): RerouteResponse {
  const session = loadSession(req.sessionId);
  const { result, personaId } = executeIndustrialReroute(session, req.sessionId, {
    todayCompleted: req.todayCompleted,
    userSignal: req.userSignal,
    trigger: req.userSignal === 'TASK_TOO_HARD' ? 'user_help' : 'manual',
  });

  persistSession(req.sessionId, session);

  const stage = ACTION_TO_STAGE[result.action] ?? result.action;
  const granularity = ACTION_TO_GRANULARITY[result.action] ?? 'normal';

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      rerouteStatus: result.status,
      strategy: result.action,
      stage,
      action: result.action,
      newTimeSlope: result.newSlope.toFixed(4),
      adjustedTotalDays: session.dreamSpace.timeBaseline.totalDays,
      message: result.companionSpeech,
      activePersona: personaId,
      activePersonaName: personaNameFromId(personaId),
      emotionalHook: result.showBubble ? result.companionSpeech : null,
      tomorrowTasks: tasksToDTO(result.nextTasks),
      silent: result.silent,
      goalDowngradeSuggested: result.goalStatus === 'RISK_ALERT',
      taskGranularity: granularity,
      lifeBehavior: toLifeDTO(result.action, result.silent, result.showBubble, result.companionSpeech, result.oldSlope, result.newSlope),
      rerouteLogId: result.rerouteLogId,
      showBubble: result.showBubble,
    },
  };
}

// ── 深夜零入侵巡逻 ──

export function nightPatrol(req: NightPatrolRequest): NightPatrolResponse {
  const session = loadSession(req.sessionId);
  const patrol = executeIndustrialNightPatrol(session, req.sessionId);
  persistSession(req.sessionId, session);

  const stage = ACTION_TO_STAGE[patrol.action] ?? patrol.action;

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      patrolType: patrol.patrolType,
      consecutiveMissDays: patrol.continuousFailDays,
      newTimeSlope: patrol.newSlope.toFixed(4),
      message: patrol.companionSpeech ?? '路径已静默重算。',
      emotionalHook: patrol.companionSpeech,
      activePersona: session.primaryPersona,
      silent: patrol.silent,
      stage,
      action: patrol.action,
      showBubble: patrol.patrolType === 'BUBBLE_PUSH',
      completionRate: patrol.completionRate,
      lifeBehavior: toLifeDTO(patrol.action, patrol.silent, patrol.patrolType === 'BUBBLE_PUSH', patrol.companionSpeech ?? '', patrol.newSlope, patrol.newSlope),
      rerouteLogId: '',
    },
  };
}

export function nightPatrolBatch() {
  const batch = runNightPatrolBatch();
  return { code: 200, status: 'SUCCESS' as const, data: batch };
}

export function getSession(sessionId: string): SessionEntry | undefined {
  const cached = sessions.get(sessionId);
  if (cached) return cached;
  return hydrateSession(getPersistence().getSession(sessionId));
}

export function getRerouteHistory(sessionId: string) {
  return getIndustrialHistory(sessionId);
}
