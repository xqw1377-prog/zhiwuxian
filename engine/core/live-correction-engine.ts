/**
 * WUXIAN · 伴生作业毫秒级纠偏引擎 (Live Co-Learning)
 * ========================================================
 * 三大生命特征：
 *   1. 盲区前瞻预测 (Pre-emptive Failure Detection)
 *   2. 毫秒级低能耗微光涟漪 (Minimal Intrusion Ripple)
 *   3. 自适应提示降级 (Degraded Hint Scaffolding)
 */

export type DeviationSeverity = 'LIGHT' | 'CRITICAL';
export type HintLevel = 'INTUITIVE' | 'MODEL' | 'REMEDIATION';

export interface FocusMetrics {
  writingSpeed: number;
  hesitationSeconds: number;
  flowState?: number;
}

export interface RealtimePenStroke {
  userId: string;
  currentProblemId: string;
  currentStepIndex: number;
  rawLogicalData: string;
  focusMetrics: FocusMetrics;
  intuitiveLeapIndex?: number;
  priorHintLevel?: HintLevel;
  stuckAfterHint?: boolean;
}

export interface DeviationSignal {
  hasDeviation: boolean;
  severity: DeviationSeverity;
  deviationPercent: number;
  preEmptive: boolean;
  visualRippleColor: string;
  ripplePosition: { x: number; y: number };
  rippleIntensity: number;
  hintLevel: HintLevel | null;
  adaptiveHint: string | null;
  missingConceptId: string | null;
}

export interface InstantRemediationCard {
  conceptId: string;
  title: string;
  microCards: string[];
  estimatedMinutes: number;
}

export interface LiveCorrectionResult {
  signal: DeviationSignal;
  remediation: InstantRemediationCard | null;
  flowCelebration: boolean;
  companionNote: string;
  standardPath: string[];
}

interface ProblemTopology {
  id: string;
  label: string;
  standardPath: string[];
  stepConcepts: Record<number, string>;
  stepHints: Record<number, { intuitive: string; model: string; remediation: string }>;
}

const PROBLEM_TOPOLOGY: Record<string, ProblemTopology> = {
  'matrix-multiply-01': {
    id: 'matrix-multiply-01',
    label: '高维矩阵叉乘推导',
    standardPath: ['Step1_Init', 'Step2_Expand', 'Step3_MatrixMultiply', 'Step4_Done'],
    stepConcepts: {
      1: 'matrix-init',
      2: 'matrix-expand',
      3: 'matrix-cross-product',
      4: 'matrix-verify',
    },
    stepHints: {
      3: {
        intuitive: '回想周三课堂录音里吞噬的【矩阵行列式守恒规律】，笔尖试着向左再跨一步？',
        model: '行列式乘法：|AB| = |A|×|B|。检查你的展开式是否漏了交叉项符号。',
        remediation: '3分钟原子卡片：矩阵叉乘符号法则 → 左上右下为正，右上左下为负。',
      },
    },
  },
  'calculus-chain-02': {
    id: 'calculus-chain-02',
    label: '链式法则复合求导',
    standardPath: ['Step1_IdentifyOuter', 'Step2_IdentifyInner', 'Step3_ApplyChain', 'Step4_Simplify'],
    stepConcepts: {
      3: 'chain-rule-composite',
    },
    stepHints: {
      3: {
        intuitive: '外层函数的导数，乘以内层函数的导数——像剥洋葱，一层一层来。',
        model: '(f∘g)\'(x) = f\'(g(x)) · g\'(x)。你漏了内层 g\'(x) 这一项。',
        remediation: '3分钟扫盲：链式法则图解 → 外层变化率 × 内层变化率。',
      },
    },
  },
  DEFAULT: {
    id: 'DEFAULT',
    label: '通用逻辑推导',
    standardPath: ['Step1_Init', 'Step2_Develop', 'Step3_Verify', 'Step4_Done'],
    stepConcepts: {},
    stepHints: {},
  },
};

const REMEDIATION_CARDS: Record<string, InstantRemediationCard> = {
  'matrix-cross-product': {
    conceptId: 'matrix-cross-product',
    title: '矩阵叉乘符号法则',
    microCards: [
      '左上→右下：主对角线项符号为正',
      '右上→左下：副对角线项符号为负',
      '行列式守恒：|AB| = |A|×|B|',
    ],
    estimatedMinutes: 3,
  },
  'chain-rule-composite': {
    conceptId: 'chain-rule-composite',
    title: '链式法则复合映射',
    microCards: [
      '识别外层函数 f 与内层函数 g',
      '分别求 f\' 和 g\'',
      '复合导数 = f\'(g(x)) · g\'(x)',
    ],
    estimatedMinutes: 3,
  },
};

const COLOR_FLOW = '#39FF14';
const COLOR_ALERT = '#FF5E00';
const COLOR_CRITICAL = '#FF3B30';

export class WuxianLiveCorrectionEngine {
  private hintEscalation: Map<string, HintLevel> = new Map();
  private stepHistory: Map<string, number[]> = new Map();

  /**
   * 毫秒级伴生监听流：用户每写一步，后台高频运转（零入侵）
   */
  monitorStepProgression(stroke: RealtimePenStroke): LiveCorrectionResult {
    const topology = PROBLEM_TOPOLOGY[stroke.currentProblemId] ?? PROBLEM_TOPOLOGY.DEFAULT;
    const key = `${stroke.userId}:${stroke.currentProblemId}`;

    this.recordStep(key, stroke.currentStepIndex);

    const deviation = this.detectDeviation(stroke, topology);
    const signal = this.buildDeviationSignal(stroke, topology, deviation);
    let remediation: InstantRemediationCard | null = null;

    if (
      (signal.hasDeviation && signal.severity === 'CRITICAL') ||
      (stroke.stuckAfterHint && signal.missingConceptId)
    ) {
      remediation = this.triggerInstantRemediation(stroke.userId, signal.missingConceptId ?? 'matrix-cross-product');
    }

    const flowCelebration = !signal.hasDeviation &&
      (stroke.focusMetrics.flowState ?? 0) > 0.7 &&
      stroke.focusMetrics.hesitationSeconds < 3;

    return {
      signal,
      remediation,
      flowCelebration,
      companionNote: this.buildCompanionNote(signal, flowCelebration, remediation),
      standardPath: topology.standardPath,
    };
  }

  /**
   * 纠偏闭环：顽固瓶颈 → 知识盲区瞬间扫盲
   */
  triggerInstantRemediation(userId: string, missingConceptId: string): InstantRemediationCard {
    return REMEDIATION_CARDS[missingConceptId] ?? {
      conceptId: missingConceptId,
      title: '认知盲区原子微卡片',
      microCards: [
        '回到课堂录音分解的 Layer2 盲区细胞',
        '15分钟定制扫盲 → 3分钟精华提炼',
        '填平深坑后，航线将重新拉直',
      ],
      estimatedMinutes: 3,
    };
  }

  private recordStep(key: string, stepIndex: number) {
    const history = this.stepHistory.get(key) ?? [];
    history.push(stepIndex);
    if (history.length > 20) history.shift();
    this.stepHistory.set(key, history);
  }

  private detectDeviation(stroke: RealtimePenStroke, topology: ProblemTopology) {
    const { currentStepIndex, focusMetrics, rawLogicalData } = stroke;
    let deviationPercent = 0;
    let preEmptive = false;
    let severity: DeviationSeverity = 'LIGHT';
    let hasDeviation = false;

    const hesitation = focusMetrics.hesitationSeconds;
    const speed = focusMetrics.writingSpeed;

    if (currentStepIndex === 3 && hesitation > 12) {
      hasDeviation = true;
      deviationPercent = 15;
      preEmptive = hesitation < 20;
      severity = hesitation > 25 ? 'CRITICAL' : 'LIGHT';
    }

    if (currentStepIndex === 3 && rawLogicalData.includes('sign_error')) {
      hasDeviation = true;
      deviationPercent = 28;
      preEmptive = false;
      severity = 'CRITICAL';
    }

    if (currentStepIndex === 2 && hesitation > 8 && speed < 0.3) {
      hasDeviation = true;
      deviationPercent = 12;
      preEmptive = true;
      severity = 'LIGHT';
    }

    if (rawLogicalData.includes('dead_end')) {
      hasDeviation = true;
      deviationPercent = 45;
      severity = 'CRITICAL';
    }

    const conceptId = topology.stepConcepts[currentStepIndex] ?? null;

    return { hasDeviation, deviationPercent, preEmptive, severity, conceptId };
  }

  private buildDeviationSignal(
    stroke: RealtimePenStroke,
    topology: ProblemTopology,
    deviation: ReturnType<typeof this.detectDeviation>,
  ): DeviationSignal {
    if (!deviation.hasDeviation) {
      return {
        hasDeviation: false,
        severity: 'LIGHT',
        deviationPercent: 0,
        preEmptive: false,
        visualRippleColor: COLOR_FLOW,
        ripplePosition: { x: 0.72, y: 0.55 },
        rippleIntensity: 0,
        hintLevel: null,
        adaptiveHint: null,
        missingConceptId: null,
      };
    }

    const hintLevel = this.resolveHintLevel(stroke);
    const hints = topology.stepHints[stroke.currentStepIndex];
    const IL = stroke.intuitiveLeapIndex ?? 0.5;

    const adaptiveHint = hints
      ? this.buildDegradedHint(IL, hintLevel, hints)
      : '暂停三秒，回到上一步的前提条件，检查是否漏了符号或变换方向。';

    const color = deviation.severity === 'CRITICAL' ? COLOR_CRITICAL : COLOR_ALERT;
    const intensity = deviation.severity === 'CRITICAL' ? 0.65 : 0.35 + deviation.deviationPercent * 0.01;

    return {
      hasDeviation: true,
      severity: deviation.severity,
      deviationPercent: deviation.deviationPercent,
      preEmptive: deviation.preEmptive,
      visualRippleColor: color,
      ripplePosition: { x: 0.78, y: 0.62 },
      rippleIntensity: Math.min(0.8, intensity),
      hintLevel,
      adaptiveHint,
      missingConceptId: deviation.conceptId,
    };
  }

  /**
   * 自适应提示降级：直觉暗示 → 关联模型 → 盲区扫盲
   */
  buildDegradedHint(IL: number, level: HintLevel, hints: { intuitive: string; model: string; remediation: string }): string {
    if (level === 'REMEDIATION') return hints.remediation;
    if (level === 'MODEL') return hints.model;
    return IL > 0.7
      ? hints.intuitive
      : hints.model;
  }

  private resolveHintLevel(stroke: RealtimePenStroke): HintLevel {
    const key = `${stroke.userId}:${stroke.currentProblemId}:${stroke.currentStepIndex}`;

    if (stroke.priorHintLevel) {
      const escalation: Record<HintLevel, HintLevel> = {
        INTUITIVE: 'MODEL',
        MODEL: 'REMEDIATION',
        REMEDIATION: 'REMEDIATION',
      };
      const next = escalation[stroke.priorHintLevel];
      this.hintEscalation.set(key, next);
      return next;
    }

    if (stroke.stuckAfterHint) {
      const current = this.hintEscalation.get(key) ?? 'INTUITIVE';
      const escalation: Record<HintLevel, HintLevel> = {
        INTUITIVE: 'MODEL',
        MODEL: 'REMEDIATION',
        REMEDIATION: 'REMEDIATION',
      };
      const next = escalation[current];
      this.hintEscalation.set(key, next);
      return next;
    }

    const IL = stroke.intuitiveLeapIndex ?? 0.5;
    const level: HintLevel = IL > 0.75 ? 'INTUITIVE' : 'MODEL';
    this.hintEscalation.set(key, level);
    return level;
  }

  private buildCompanionNote(
    signal: DeviationSignal,
    flowCelebration: boolean,
    remediation: InstantRemediationCard | null,
  ): string {
    if (flowCelebration) {
      return '推导极其流畅，直觉爆发。发丝细线正随你的节奏散发荧光绿粒子——我陪你一起欢呼。';
    }
    if (remediation) {
      return `顽固瓶颈已触发瞬间扫盲。【${remediation.title}】已粉碎为 ${remediation.estimatedMinutes} 分钟原子微卡片，贴于涟漪中心。`;
    }
    if (signal.hasDeviation && signal.preEmptive) {
      return `前瞻预测：前置概念偏离 ${signal.deviationPercent}%。余光注意发丝线橙色涟漪，Flow 状态未被打破。`;
    }
    if (signal.hasDeviation) {
      return `第 ${signal.hintLevel === 'INTUITIVE' ? '一' : signal.hintLevel === 'MODEL' ? '二' : '三'}层提示已就位。绝不喂答案，只陪你找到路。`;
    }
    return '伴生纠偏静默注视中。笔尖落处，生命体同频共振。';
  }
}

/** 模拟流畅推导 */
export function simulateFlowStroke(userId: string, problemId = 'matrix-multiply-01'): RealtimePenStroke {
  return {
    userId,
    currentProblemId: problemId,
    currentStepIndex: 2,
    rawLogicalData: 'Step2_Expand_correct',
    focusMetrics: { writingSpeed: 1.2, hesitationSeconds: 1.5, flowState: 0.85 },
    intuitiveLeapIndex: 0.82,
  };
}

/** 模拟第3步卡壳 */
export function simulateStuckStroke(userId: string, problemId = 'matrix-multiply-01'): RealtimePenStroke {
  return {
    userId,
    currentProblemId: problemId,
    currentStepIndex: 3,
    rawLogicalData: 'Step3_MatrixMultiply_hesitate',
    focusMetrics: { writingSpeed: 0.15, hesitationSeconds: 14, flowState: 0.3 },
    intuitiveLeapIndex: 0.65,
  };
}

/** 模拟致命死胡同 */
export function simulateDeadEndStroke(userId: string, problemId = 'matrix-multiply-01'): RealtimePenStroke {
  return {
    userId,
    currentProblemId: problemId,
    currentStepIndex: 3,
    rawLogicalData: 'sign_error_dead_end',
    focusMetrics: { writingSpeed: 0.05, hesitationSeconds: 30, flowState: 0.1 },
    intuitiveLeapIndex: 0.5,
    stuckAfterHint: true,
    priorHintLevel: 'MODEL',
  };
}
