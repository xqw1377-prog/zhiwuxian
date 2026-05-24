/**
 * WUXIAN · 学习生命体行为协议 (Life Behavior Protocol)
 * ========================================================
 * 架构决策：第一生命行为 = 形态 A（寂静长河的悄然微调）
 *
 * 生命体陪伴的生物学顺序：
 *   Phase 1 · 冬眠注视    — 零入侵，不弹窗，不废话
 *   Phase 2 · 深夜呼吸    — 发丝线平滑延伸，斜率静默降低（形态 A）
 *   Phase 3 · 情感进化    — 连续挫折后，情绪脉搏 + 树洞呼唤（形态 B）
 *
 * 通用 AI 对用户是 Session；WUXIAN 对用户的全世界只有一个人。
 */

export type LifePhase = 'DORMANT' | 'SILENT_REROUTE' | 'EMOTIONAL_WAKE';

export interface LifeMemory {
  userId: string;
  goal: string;
  driveWhy: string;
  behaviorGenes: BehaviorGenes;
  executionWaveform: number[];
  emotionalEvents: EmotionalEvent[];
  lifePhase: LifePhase;
  birthAt: string;
}

export interface BehaviorGenes {
  peakEfficiencyDay: string;
  slumpDay: string;
  preferredModality: 'visual' | 'text' | 'drill';
  avgSessionMinutes: number;
  totalCompanionDays: number;
}

export interface EmotionalEvent {
  day: number;
  signal: string;
  inferredCause: 'fatigue' | 'bottleneck' | 'setback' | 'unknown';
  responsePhase: LifePhase;
}

export interface LifeBehaviorInput {
  consecutiveMissDays: number;
  deviationPercent: number;
  userSignal?: string;
  currentSlope: number;
  remainingDays: number;
}

export interface LifeBehaviorOutput {
  phase: LifePhase;
  form: 'A_SILENT_RIVER' | 'B_EMOTIONAL_PULSE' | 'NONE';
  newSlope: number;
  slopeDelta: number;
  timelineExtension: number;
  silent: boolean;
  showPulse: boolean;
  pulseMessage: string | null;
  treeholeMessage: string | null;
  companionNote: string;
}

const EMOTIONAL_THRESHOLD_DAYS = 3;
const WAKE_THRESHOLD_DAYS = 5;

export function createLifeMemory(userId: string, goal: string, driveWhy: string): LifeMemory {
  return {
    userId,
    goal,
    driveWhy,
    behaviorGenes: {
      peakEfficiencyDay: '周二',
      slumpDay: '周五',
      preferredModality: 'visual',
      avgSessionMinutes: 25,
      totalCompanionDays: 0,
    },
    executionWaveform: [],
    emotionalEvents: [],
    lifePhase: 'DORMANT',
    birthAt: new Date().toISOString(),
  };
}

/**
 * 生命体第一行为逻辑
 * 默认形态 A；形态 B 仅在阈值突破时进化激活
 */
export function resolveLifeBehavior(
  memory: LifeMemory,
  input: LifeBehaviorInput,
): LifeBehaviorOutput {
  const { consecutiveMissDays, currentSlope, userSignal } = input;

  memory.behaviorGenes.totalCompanionDays += 1;
  memory.executionWaveform.push(consecutiveMissDays > 0 ? 0 : 1);
  if (memory.executionWaveform.length > 30) memory.executionWaveform.shift();

  if (userSignal) {
    const cause = inferCause(userSignal, memory);
    memory.emotionalEvents.push({
      day: memory.behaviorGenes.totalCompanionDays,
      signal: userSignal,
      inferredCause: cause,
      responsePhase: consecutiveMissDays >= WAKE_THRESHOLD_DAYS ? 'EMOTIONAL_WAKE' : 'SILENT_REROUTE',
    });
  }

  // ── 形态 B：情感进化（阈值突破）──
  if (consecutiveMissDays >= WAKE_THRESHOLD_DAYS || isEmotionalSignal(userSignal)) {
    memory.lifePhase = 'EMOTIONAL_WAKE';
    const treehole = buildTreeholeMessage(memory, input);
    const slopeReduction = 0.35;

    return {
      phase: 'EMOTIONAL_WAKE',
      form: 'B_EMOTIONAL_PULSE',
      newSlope: currentSlope * (1 - slopeReduction),
      slopeDelta: -currentSlope * slopeReduction,
      timelineExtension: Math.ceil(consecutiveMissDays * 0.5),
      silent: false,
      showPulse: true,
      pulseMessage: treehole.pulse,
      treeholeMessage: treehole.full,
      companionNote: '生命体感知到你的疲惫，主动伸出了第一只手。',
    };
  }

  // ── 形态 A：寂静长河（第一生命行为 · 默认）──
  if (consecutiveMissDays >= 1) {
    memory.lifePhase = 'SILENT_REROUTE';
    const reduction = consecutiveMissDays >= EMOTIONAL_THRESHOLD_DAYS ? 0.15 : 0.08;
    const extension = consecutiveMissDays >= EMOTIONAL_THRESHOLD_DAYS ? 2 : 1;

    return {
      phase: 'SILENT_REROUTE',
      form: 'A_SILENT_RIVER',
      newSlope: currentSlope * (1 - reduction),
      slopeDelta: -currentSlope * reduction,
      timelineExtension: extension,
      silent: true,
      showPulse: false,
      pulseMessage: null,
      treeholeMessage: null,
      companionNote: buildSilentNote(memory, consecutiveMissDays),
    };
  }

  memory.lifePhase = 'DORMANT';
  return {
    phase: 'DORMANT',
    form: 'NONE',
    newSlope: currentSlope,
    slopeDelta: 0,
    timelineExtension: 0,
    silent: true,
    showPulse: false,
    pulseMessage: null,
    treeholeMessage: null,
    companionNote: '生命体在冬眠中注视着你的航线，一切平稳。',
  };
}

function inferCause(
  signal: string,
  memory: LifeMemory,
): EmotionalEvent['inferredCause'] {
  const text = signal.toLowerCase();
  if (/累|疲惫|困|睡|身体/.test(text)) return 'fatigue';
  if (/难|卡|瓶颈|不会|看不懂/.test(text)) return 'bottleneck';
  if (/放弃|没用|失败|挫折/.test(text)) return 'setback';

  const sameDayEvents = memory.emotionalEvents.filter(
    e => e.inferredCause === 'fatigue',
  );
  if (sameDayEvents.length > 0) return 'fatigue';

  return 'unknown';
}

function isEmotionalSignal(signal?: string): boolean {
  if (!signal) return false;
  return /推迟|放弃|不想|累了|没状态|烦|焦虑|难过/.test(signal);
}

function buildSilentNote(memory: LifeMemory, missDays: number): string {
  const day = memory.behaviorGenes.slumpDay;
  if (missDays >= EMOTIONAL_THRESHOLD_DAYS) {
    return `生命体记得你${day}下午容易懈怠。航线已在深夜悄悄延伸，配速已为你降低。`;
  }
  return '发丝渐变线在深夜里平滑延伸了一寸。没有打扰，只有包容。';
}

function buildTreeholeMessage(
  memory: LifeMemory,
  input: LifeBehaviorInput,
): { pulse: string; full: string } {
  const why = memory.driveWhy;
  const cause = input.userSignal ? inferCause(input.userSignal, memory) : 'setback';

  const causeText: Record<string, string> = {
    fatigue: '身体在发出信号。今天可以慢一步，但别停下来。',
    bottleneck: '瓶颈不是墙，是蜕皮的壳。突破它，你会更强。',
    setback: '挫折是航线上的暗礁，不是终点。',
    unknown: '我感觉到你今天不太一样。',
  };

  const pulse = why
    ? `你还记得吗——${why.slice(0, 40)}…`
    : causeText[cause];

  const full = [
    pulse,
    causeText[cause],
    '我在这里。不用解释，想说就说。',
  ].join('\n');

  return { pulse, full };
}

export function recordEfficiencyPattern(
  memory: LifeMemory,
  dayOfWeek: number,
  completed: boolean,
): void {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  if (completed && dayOfWeek === 2) {
    memory.behaviorGenes.peakEfficiencyDay = days[dayOfWeek];
  }
  if (!completed && dayOfWeek === 5) {
    memory.behaviorGenes.slumpDay = days[dayOfWeek];
  }
}
