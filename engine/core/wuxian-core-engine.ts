/**
 * WUXIAN 核心引擎：万能目标与时间双轴拆解控制器
 * ====================================================
 * 系统心脏 · 第一行代码
 *
 * 军令状：
 *   1. 冻结数据流（Data Contract）     → types.ts + schema
 *   2. 万能拆解（DeconstructGoal）     → initializeDreamSpace()
 *   3. 动态重算（Rerouting Loop）      → triggerDynamicRerouting()
 */

import type {
  AtomTask,
  DreamSpace,
  EnergyMatrix,
  GoalBaseline,
  GoalVector,
  InitializeOptions,
  InitializeResult,
  KnowledgeNode,
  Milestone,
  ReroutingInput,
  ReroutingOutput,
  TimeBaseline,
  TimeSlope,
} from './types';

// ─────────────────────────────────────────────
// 认知图谱模板（后续由 LLM 动态生成替换）
// ─────────────────────────────────────────────

const GOAL_TEMPLATES: Record<string, { category: string; evolutionPath: string; nodes: KnowledgeNode[] }> = {
  default: {
    category: '通用梦想',
    evolutionPath: 'generic-evolution-v1',
    nodes: [
      { id: 'foundation', type: 'knowledge', label: '基础知识', weight: 0.30, prerequisites: [] },
      { id: 'core-skill', type: 'skill', label: '核心技能', weight: 0.35, prerequisites: ['foundation'] },
      { id: 'practice', type: 'milestone', label: '刻意练习量', weight: 0.20, prerequisites: ['core-skill'] },
      { id: 'mental', type: 'psychological', label: '坚持力', weight: 0.15, prerequisites: [] },
    ],
  },
  clearance: {
    category: '硬核通关',
    evolutionPath: 'clearance-evolution-v1',
    nodes: [
      { id: 'knowledge-gap', type: 'knowledge', label: '知识缺口', weight: 0.35, prerequisites: [] },
      { id: 'drill', type: 'skill', label: '精准刷题', weight: 0.30, prerequisites: [] },
      { id: 'mock-exam', type: 'credential', label: '模考达标', weight: 0.20, prerequisites: ['knowledge-gap', 'drill'] },
      { id: 'mental', type: 'psychological', label: '考试心理', weight: 0.15, prerequisites: [] },
    ],
  },
  creation: {
    category: '创造与灵感',
    evolutionPath: 'creation-evolution-v1',
    nodes: [
      { id: 'inspiration', type: 'psychological', label: '灵感积累', weight: 0.20, prerequisites: [] },
      { id: 'technique', type: 'skill', label: '技法修炼', weight: 0.30, prerequisites: [] },
      { id: 'portfolio', type: 'milestone', label: '作品产出', weight: 0.35, prerequisites: ['technique'] },
      { id: 'presentation', type: 'milestone', label: '展示/发布', weight: 0.15, prerequisites: ['portfolio'] },
    ],
  },
  endurance: {
    category: '习惯与跨度',
    evolutionPath: 'endurance-evolution-v1',
    nodes: [
      { id: 'habit', type: 'skill', label: '习惯养成', weight: 0.35, prerequisites: [] },
      { id: 'consistency', type: 'psychological', label: '持续性', weight: 0.30, prerequisites: ['habit'] },
      { id: 'depth', type: 'knowledge', label: '深度积累', weight: 0.35, prerequisites: ['habit'] },
    ],
  },
};

const ARCHETYPE_KEYWORDS: Record<string, string[]> = {
  clearance: ['考', '升学', '高考', 'SAT', '托福', '录取', 'Offer', 'Top', '证', '提分', '刷题'],
  creation: ['创作', '设计', '美术', '画展', '作品', '艺术', '创业', '写作', '音乐', '策展'],
  endurance: ['习惯', '坚持', '每天', '阅读', '语言', '减肥', '健身', '流利', '长期'],
};

// ─────────────────────────────────────────────
// WuxianCoreEngine
// ─────────────────────────────────────────────

export class WuxianCoreEngine {
  private dreamSpace: DreamSpace | null = null;

  /**
   * 初始化用户的梦想空间（双轴交叉）
   */
  public initializeDreamSpace(options: InitializeOptions): InitializeResult {
    const {
      goalBaseline,
      timeBaseline,
      isDeadlineFixed = false,
      currentStatus = '',
    } = options;

    if (!goalBaseline?.trim()) {
      throw new Error('[WUXIAN] 缺少目标锚点 (goalBaseline)');
    }
    if (timeBaseline < 1) {
      throw new Error('[WUXIAN] 时间锚点必须 ≥ 1 天');
    }

    const goalVector = this.mapGoalToVector(goalBaseline);
    const goal: GoalBaseline = { raw: goalBaseline, vector: goalVector };

    const totalEnergy = this.calculateGoalWeight(goalVector, currentStatus);

    const time: TimeBaseline = {
      totalDays: timeBaseline,
      isDeadlineFixed,
      targetDate: addDaysISO(new Date(), timeBaseline),
      currentDay: 0,
    };

    const initialSlope = totalEnergy / timeBaseline;
    const slope: TimeSlope = {
      initialSlope,
      currentSlope: initialSlope,
      dailyEnergyKPI: initialSlope,
      pressureCoefficient: clamp(initialSlope * 100, 0.1, 1.0),
    };

    const energyMatrix = this.buildEnergyMatrix(goalVector, totalEnergy, currentStatus);
    const milestones = this.generateRoadmap(energyMatrix, time);
    const atoms = this.atomizeAll(milestones, goalVector, slope, time);
    const todayTasks = atoms.filter(a => a.scheduledDay === 0);
    const deviationRisk = clamp((totalEnergy / 1000) * 0.3 + (timeBaseline < 90 ? 0.2 : 0), 0, 1);

    this.dreamSpace = {
      id: `ds-${Date.now()}`,
      goalBaseline: goal,
      timeBaseline: time,
      energyMatrix,
      timeSlope: slope,
      milestones,
      atoms,
      status: 'INITIALIZED',
      createdAt: new Date().toISOString(),
    };

    return {
      status: 'SUCCESS',
      message: '无限梦想空间已锁定，双轴坐标系建立完成。',
      dreamSpace: this.dreamSpace,
      initialSlope,
      totalMilestones: milestones.length,
      todayTasks,
      milestones,
      atoms,
      deviationRisk,
    };
  }

  /**
   * 核心算法：反惰性动态重算引擎（Rerouting）
   * 用户今日任务未达成时触发，绝不指责，默默重算
   */
  public triggerDynamicRerouting(input: ReroutingInput): ReroutingOutput {
    if (!this.dreamSpace) {
      throw new Error('[WUXIAN] 梦想空间未初始化，请先调用 initializeDreamSpace()');
    }

    const ds = this.dreamSpace;
    const { currentDay, remainingEnergy, todayCompleted, consecutiveFailDays = 0 } = input;
    const { totalDays, isDeadlineFixed } = ds.timeBaseline;
    const daysLeft = totalDays - currentDay;

    if (daysLeft <= 0) {
      ds.status = 'CRITICAL';
      return {
        status: 'CRITICAL',
        strategy: 'reframe',
        newDailySlope: ds.timeSlope.currentSlope,
        adjustedTotalDays: totalDays,
        tomorrowTasks: [],
        message: '已到达时间锚点终点，触发终极复盘工作流。',
      };
    }

    if (todayCompleted) {
      ds.energyMatrix.remainingEnergy = remainingEnergy;
      ds.energyMatrix.consumedEnergy = ds.energyMatrix.totalEnergyRequired - remainingEnergy;
      ds.timeBaseline.currentDay = currentDay;
      ds.status = 'ACTIVE';
      const tomorrowTasks = this.dispatchTomorrowTask(ds.timeSlope.currentSlope, currentDay + 1);
      return {
        status: 'SILENT',
        strategy: 'redistribute',
        newDailySlope: ds.timeSlope.currentSlope,
        adjustedTotalDays: totalDays,
        tomorrowTasks,
        message: '今日任务已达成，航线正常推进。',
      };
    }

    // ── 今日未完成：启动 Rerouting ──
    ds.status = 'REROUTING';
    let newDailySlope: number;
    let adjustedTotalDays = totalDays;
    let strategy: ReroutingOutput['strategy'];
    let status: ReroutingOutput['status'];
    let message: string;

    if (isDeadlineFixed) {
      newDailySlope = remainingEnergy / daysLeft;
      strategy = consecutiveFailDays >= 3 ? 'reframe' : 'compress';
      status = consecutiveFailDays >= 3 ? 'CRITICAL' : 'ADJUSTED';
    } else {
      newDailySlope = ds.timeSlope.initialSlope;
      const extension = Math.max(1, Math.ceil(consecutiveFailDays * 1.5));
      adjustedTotalDays = totalDays + extension;
      strategy = 'extend';
      status = 'EXTENDED';
    }

    if (status !== 'CRITICAL') {
      newDailySlope = remainingEnergy / (adjustedTotalDays - currentDay);
      strategy = 'redistribute';
    } else {
      newDailySlope = (remainingEnergy / daysLeft) * 0.6;
    }

    if (status === 'ADJUSTED') {
      message = `时间锚点锁定。每日配速斜率微调至: ${newDailySlope.toFixed(4)}。任务已静默重分配。`;
    } else if (status === 'EXTENDED') {
      message = `保持配速舒适度，时间锚点自动向后顺延至 ${adjustedTotalDays} 天。`;
    } else if (status === 'CRITICAL') {
      message = `连续 ${consecutiveFailDays} 天未达成。斜率下调 40% 至: ${newDailySlope.toFixed(4)}。难度重构中。`;
    } else {
      message = `任务已静默平摊。新斜率: ${newDailySlope.toFixed(4)}。`;
    }

    ds.timeSlope.currentSlope = newDailySlope;
    ds.timeSlope.dailyEnergyKPI = newDailySlope;
    ds.energyMatrix.remainingEnergy = remainingEnergy;
    ds.timeBaseline.totalDays = adjustedTotalDays;
    ds.timeBaseline.currentDay = currentDay;

    const tomorrowTasks = this.dispatchTomorrowTask(newDailySlope, currentDay + 1);

    return {
      status,
      strategy,
      newDailySlope,
      adjustedTotalDays,
      tomorrowTasks,
      message,
    };
  }

  public getDreamSpace(): DreamSpace | null {
    return this.dreamSpace;
  }

  public restoreDreamSpace(space: DreamSpace): void {
    this.dreamSpace = space;
  }

  // ─────────────────────────────────────────────
  // Private · 认知图谱
  // ─────────────────────────────────────────────

  private mapGoalToVector(goal: string): GoalVector {
    const archetype = this.classifyGoal(goal);
    const template = GOAL_TEMPLATES[archetype] ?? GOAL_TEMPLATES.default;
    return {
      category: template.category,
      evolutionPath: template.evolutionPath,
      nodes: template.nodes.map(n => ({ ...n })),
    };
  }

  private classifyGoal(goal: string): string {
    const text = goal.toLowerCase();
    let best = 'default';
    let bestScore = 0;
    for (const [archetype, keywords] of Object.entries(ARCHETYPE_KEYWORDS)) {
      const score = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
      if (score > bestScore) {
        bestScore = score;
        best = archetype;
      }
    }
    return best;
  }

  /**
   * 将非标准目标转化为全人能力树总能量值
   */
  private calculateGoalWeight(vector: GoalVector, currentStatus: string): number {
    const BASE_ENERGY = 1000;
    const statusModifier = currentStatus ? 1.0 : 1.15;
    const nodeSum = vector.nodes.reduce((s, n) => s + n.weight, 0);
    return BASE_ENERGY * nodeSum * statusModifier;
  }

  private buildEnergyMatrix(
    vector: GoalVector,
    totalEnergy: number,
    currentStatus: string,
  ): EnergyMatrix {
    const nodeEnergies: Record<string, number> = {};
    const progress = this.estimateProgress(currentStatus, vector);

    for (const node of vector.nodes) {
      const gap = 1 - (progress[node.id] ?? 0);
      nodeEnergies[node.id] = totalEnergy * node.weight * gap;
    }

    const remaining = Object.values(nodeEnergies).reduce((s, v) => s + v, 0);

    return {
      totalEnergyRequired: totalEnergy,
      remainingEnergy: remaining,
      consumedEnergy: totalEnergy - remaining,
      nodeEnergies,
    };
  }

  private estimateProgress(status: string, vector: GoalVector): Record<string, number> {
    if (!status) return {};
    const progress: Record<string, number> = {};
    const text = status.toLowerCase();
    for (const node of vector.nodes) {
      if (text.includes('零基础') || text.includes('未开始')) {
        progress[node.id] = 0;
      } else if (text.includes('基础') || text.includes('入门')) {
        progress[node.id] = 0.2;
      } else {
        progress[node.id] = 0.1;
      }
    }
    return progress;
  }

  // ─────────────────────────────────────────────
  // Private · 里程碑倒推
  // ─────────────────────────────────────────────

  private generateRoadmap(energy: EnergyMatrix, time: TimeBaseline): Milestone[] {
    const totalWeeks = Math.max(1, Math.ceil(time.totalDays / 7));
    const milestones: Milestone[] = [];
    const nodes = Object.entries(energy.nodeEnergies).filter(([, e]) => e > 0);

    let weekPtr = 1;
    for (const [nodeId, nodeEnergy] of nodes) {
      const steps = Math.max(2, Math.ceil(nodeEnergy / (energy.totalEnergyRequired * 0.15)));
      const interval = Math.max(1, Math.floor(totalWeeks / steps));

      for (let s = 1; s <= steps; s++) {
        milestones.push({
          id: `ms-${nodeId}-${s}`,
          label: `${nodeId} · 阶段 ${s}/${steps}`,
          weekIndex: Math.min(weekPtr, totalWeeks),
          targetEnergy: nodeEnergy / steps,
          status: milestones.length === 0 ? 'active' : 'pending',
        });
        weekPtr += interval;
      }
    }

    return milestones.sort((a, b) => a.weekIndex - b.weekIndex);
  }

  // ─────────────────────────────────────────────
  // Private · 原子化粉碎
  // ─────────────────────────────────────────────

  private atomizeAll(
    milestones: Milestone[],
    vector: GoalVector,
    slope: TimeSlope,
    time: TimeBaseline,
  ): AtomTask[] {
    const atoms: AtomTask[] = [];
    const activeMs = milestones.filter(m => m.status === 'active');

    const TASK_TEMPLATES: Record<string, string[]> = {
      foundation: ['学习基础章节 {n}', '完成 {n} 道基础练习'],
      'core-skill': ['核心技能刻意练习 {n} 分钟', '完成 {n} 次专项训练'],
      'knowledge-gap': ['专攻薄弱知识点 {n} 题', '整理 {n} 道经典错题'],
      drill: ['限时刷题 {n} 道', '完成 1 次模考复盘'],
      technique: ['技法练习 {n} 分钟', '临摹参考作品 {n} 幅'],
      portfolio: ['创作作品 1 件', '完善作品集 {n} 页'],
      habit: ['完成今日打卡', '坚持练习 {n} 分钟'],
      practice: ['刻意练习 {n} 分钟', '完成训练记录'],
      mental: ['5 分钟正念呼吸', '写下今日小成就'],
    };

    for (const ms of activeMs) {
      const nodeId = ms.id.split('-')[1];
      const node = vector.nodes.find(n => n.id === nodeId);
      const templates = TASK_TEMPLATES[nodeId] ?? TASK_TEMPLATES['practice'];
      const dailyEnergy = slope.dailyEnergyKPI;
      const n = Math.max(1, Math.ceil(dailyEnergy / 50));

      templates.forEach((tpl, i) => {
        atoms.push({
          taskId: `atom-${ms.id}-${i}`,
          taskDescription: tpl.replace('{n}', String(n)),
          durationMinutes: Math.round(20 + dailyEnergy / 10 + i * 10),
          difficultyWeight: clamp(node?.weight ?? 0.5, 0.1, 1.0),
          scheduledDay: i === 0 ? 0 : Math.ceil(ms.weekIndex * 7),
          milestoneId: ms.id,
          nodeId,
          completed: false,
        });
      });
    }

    return atoms;
  }

  /**
   * 重新粉碎并分发指定日期的原子任务
   */
  private dispatchTomorrowTask(slope: number, day: number): AtomTask[] {
    if (!this.dreamSpace) return [];

    const minutes = Math.round(20 + slope * 10);
    const n = Math.max(1, Math.ceil(slope / 5));

    const activeMs = this.dreamSpace.milestones.find(m => m.status === 'active');
    const nodeId = activeMs?.id.split('-')[1] ?? 'practice';

    return [
      {
        taskId: `atom-reroute-d${day}-0`,
        taskDescription: `今日核心任务：刻意练习 ${n} 单元（${minutes} 分钟）`,
        durationMinutes: minutes,
        difficultyWeight: clamp(slope * 100, 0.1, 1.0),
        scheduledDay: day,
        milestoneId: activeMs?.id,
        nodeId,
        completed: false,
      },
      {
        taskId: `atom-reroute-d${day}-1`,
        taskDescription: `今日复盘：记录 1 条学习心得`,
        durationMinutes: 10,
        difficultyWeight: 0.2,
        scheduledDay: day,
        completed: false,
      },
    ];
  }
}

// ─────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function addDaysISO(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export { GOAL_TEMPLATES, ARCHETYPE_KEYWORDS };
