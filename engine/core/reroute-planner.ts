/**
 * WUXIAN · 统一重路由规划器
 * 阶梯式抗放弃机制 — 单一真相源，避免 LifeBehavior 与 Engine 双重覆盖
 *
 * 阶段：
 *   1 天未完成 → 静默重排（用户几乎无感知）
 *   2-3 天未完成 → 细胞分裂（任务降级）
 *   4-7 天偏离 → 人格介入 / 动机重校
 *   7+ 天断线 → 柔性目标降级（安全降落伞）
 */

import type { DreamSpace } from './types';
import type { PatrolState } from './night-patrol';
import type { LifeMemory } from './life-behavior';
import type { PersonaId } from './persona-switcher';
import { resolveSlumpPersona, buildEmotionalWake } from './persona-switcher';
import { forgeAtomTasks, type AtomTaskDTO } from './atom-forge';
import type { GoalArchetype } from './persona-switcher';
import type { RerouteTrigger } from '../storage/persistence';

export type RerouteStage =
  | 'ON_TRACK'
  | 'SILENT_REDISTRIBUTE'
  | 'CELL_SPLIT'
  | 'PERSONA_INTERVENTION'
  | 'SOFT_DOWNGRADE';

export interface ReroutePlanInput {
  dreamSpace: DreamSpace;
  patrol: PatrolState;
  life: LifeMemory;
  goal: string;
  archetype: GoalArchetype;
  driveWhy: string;
  primaryPersona: PersonaId;
  isDeadlineFixed: boolean;
  todayCompleted: boolean;
  userSignal?: string;
  trigger: RerouteTrigger;
}

export interface ReroutePlanOutput {
  stage: RerouteStage;
  strategy: string;
  status: string;
  newSlope: number;
  adjustedTotalDays: number;
  remainingEnergy: number;
  message: string;
  companionNote: string;
  emotionalHook: string | null;
  activePersona: PersonaId;
  activePersonaName: string;
  silent: boolean;
  showIntervention: boolean;
  tomorrowTasks: AtomTaskDTO[];
  taskGranularity: 'normal' | 'reduced' | 'micro';
  goalDowngradeSuggested: boolean;
  slopeBefore: number;
  daysBefore: number;
}

const PERSONA_NAMES: Record<PersonaId, string> = {
  'iron-coach': '铁血教练',
  'growth-companion': '养成系伙伴',
  'spirit-mentor': '精神导师',
};

export function planReroute(input: ReroutePlanInput): ReroutePlanOutput {
  const { dreamSpace, patrol, life, goal, archetype, driveWhy, primaryPersona, isDeadlineFixed } = input;
  const ds = dreamSpace;
  const miss = patrol.consecutiveMissDays;
  const slopeBefore = ds.timeSlope.currentSlope;
  const daysBefore = ds.timeBaseline.totalDays;
  const remaining = ds.energyMatrix.remainingEnergy;
  const currentDay = patrol.currentDay;
  const daysLeft = Math.max(1, ds.timeBaseline.totalDays - currentDay);

  if (input.todayCompleted) {
    const dailyBurn = ds.timeSlope.dailyEnergyKPI;
    const newRemaining = Math.max(0, remaining - dailyBurn);
    ds.energyMatrix.remainingEnergy = newRemaining;
    ds.energyMatrix.consumedEnergy += dailyBurn;
    patrol.consecutiveMissDays = 0;

    const newSlope = newRemaining / daysLeft;
    ds.timeSlope.currentSlope = newSlope;
    ds.timeSlope.dailyEnergyKPI = newSlope;

    return {
      stage: 'ON_TRACK',
      strategy: 'maintain',
      status: 'SILENT',
      newSlope,
      adjustedTotalDays: daysBefore,
      remainingEnergy: newRemaining,
      message: '今日路径已踩实。斜率保持稳定。',
      companionNote: '很好，今天的路径被你踩实了一格。继续保持低摩擦推进。',
      emotionalHook: null,
      activePersona: primaryPersona,
      activePersonaName: PERSONA_NAMES[primaryPersona],
      silent: true,
      showIntervention: false,
      tomorrowTasks: forgeAtomTasks(goal, archetype, 3, { granularity: 'normal', missDays: 0 }),
      taskGranularity: 'normal',
      goalDowngradeSuggested: false,
      slopeBefore,
      daysBefore,
    };
  }

  const stage = resolveStage(miss);
  let newSlope = slopeBefore;
  let adjustedDays = daysBefore;
  let strategy = 'redistribute';
  let status = 'ADJUSTED';
  let silent = true;
  let showIntervention = false;
  let taskGranularity: 'normal' | 'reduced' | 'micro' = 'normal';
  let goalDowngradeSuggested = false;
  let message = '';
  let companionNote = '';

  switch (stage) {
    case 'SILENT_REDISTRIBUTE':
      newSlope = remaining / daysLeft * 1.04;
      strategy = 'redistribute';
      status = 'SILENT';
      silent = true;
      message = '今日能量已静默平摊到后续日子，斜率微增，你几乎无感知。';
      companionNote = '路径已悄悄重排。不用自责，明天继续就好。';
      taskGranularity = 'normal';
      break;

    case 'CELL_SPLIT':
      newSlope = remaining / (daysLeft + 1) * 0.95;
      adjustedDays = daysBefore + 1;
      strategy = 'cell_split';
      status = 'ADJUSTED';
      silent = true;
      taskGranularity = 'reduced';
      message = '检测到连续卡点。任务已自动拆得更碎——今天只做 5 分钟重启动作也可以。';
      companionNote = '系统判定你可能遇到了瓶颈，已把任务降级。完成一小步就算赢。';
      break;

    case 'PERSONA_INTERVENTION':
      newSlope = (remaining / daysLeft) * 0.82;
      adjustedDays = isDeadlineFixed ? daysBefore : daysBefore + Math.ceil(miss * 0.5);
      strategy = 'persona_intervention';
      status = 'CRITICAL';
      silent = false;
      showIntervention = true;
      taskGranularity = 'micro';
      message = `连续 ${miss} 天偏离航线。${PERSONA_NAMES[resolveSlumpPersona(primaryPersona, miss)]} 想和你认真聊聊。`;
      companionNote = buildEmotionalWake(driveWhy, miss) ?? '先别急着责备自己。我们把坡度调低，重新确认你为什么出发。';
      life.lifePhase = 'EMOTIONAL_WAKE';
      break;

    case 'SOFT_DOWNGRADE':
      newSlope = (remaining / daysLeft) * 0.65;
      adjustedDays = daysBefore + Math.ceil(miss * 0.8);
      strategy = 'soft_downgrade';
      status = 'EXTENDED';
      silent = false;
      showIntervention = true;
      taskGranularity = 'micro';
      goalDowngradeSuggested = true;
      message = '长期断线 detected。系统为你准备了安全降落伞——建议阶段性目标降级，而非直接坠毁。';
      companionNote = '目标可以调低，但路径不能崩塌。我们先把本周缩到一个你能重新启动的版本。';
      ds.status = 'CRITICAL';
      break;

    default:
      newSlope = remaining / daysLeft;
      break;
  }

  if (input.userSignal === 'TASK_TOO_HARD' && stage === 'SILENT_REDISTRIBUTE') {
    taskGranularity = 'reduced';
    newSlope *= 0.92;
    message = '你标记了「太难了」。系统已降低今日认知负荷，任务颗粒度缩小。';
    companionNote = '反馈收到。不是你不适合，是坡度需要再平一点。';
  }

  ds.timeSlope.currentSlope = newSlope;
  ds.timeSlope.dailyEnergyKPI = newSlope;
  ds.timeBaseline.totalDays = adjustedDays;
  ds.timeBaseline.currentDay = currentDay;
  ds.energyMatrix.remainingEnergy = remaining;

  const activePersona = resolveSlumpPersona(primaryPersona, miss);
  const emotionalHook = showIntervention
    ? (buildEmotionalWake(driveWhy, miss) ?? companionNote)
    : null;

  const taskCount = taskGranularity === 'micro' ? 1 : taskGranularity === 'reduced' ? 2 : 3;

  return {
    stage,
    strategy,
    status,
    newSlope,
    adjustedTotalDays: adjustedDays,
    remainingEnergy: remaining,
    message,
    companionNote,
    emotionalHook,
    activePersona,
    activePersonaName: PERSONA_NAMES[activePersona],
    silent,
    showIntervention,
    tomorrowTasks: forgeAtomTasks(goal, archetype, taskCount, {
      granularity: taskGranularity,
      missDays: miss,
      userSignal: input.userSignal,
    }),
    taskGranularity,
    goalDowngradeSuggested,
    slopeBefore,
    daysBefore,
  };
}

function resolveStage(consecutiveMissDays: number): RerouteStage {
  if (consecutiveMissDays <= 0) return 'ON_TRACK';
  if (consecutiveMissDays === 1) return 'SILENT_REDISTRIBUTE';
  if (consecutiveMissDays <= 3) return 'CELL_SPLIT';
  if (consecutiveMissDays <= 7) return 'PERSONA_INTERVENTION';
  return 'SOFT_DOWNGRADE';
}
