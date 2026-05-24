/**
 * WUXIAN · 天分捕获雷达核心引擎 (Talent Radar Engine)
 * ========================================================
 * 核心评估维度（不看最终得分，看微观行为波形）：
 *
 *   I_L  直觉跃迁指数  Intuitive Leap Coefficient
 *   R_D  抗挫折自愈密度  Resilience Density
 *   P_S  模式识别敏感度  Pattern Recognition Sensitivity
 */

export type TaskCategory = 'MATHEMATICS' | 'SPATIAL_ART' | 'LOGIC' | 'SPEECH';

export interface BehaviorStream {
  userId: string;
  taskCategory: TaskCategory;
  timeSpentSeconds: number;
  draftStepsCount: number;
  actualStepsCount: number;
  errorRetryCount: number;
  isCorrect: boolean;
  crossSubjectLinkCount?: number;
  mousePauseVariance?: number;
  emotionPulseStability?: number;
}

export interface TalentMetrics {
  IL: number;
  RD: number;
  PS: number;
  composite: number;
}

export interface TalentReport {
  detectedTalent: string;
  talentLabel: string;
  confidenceLevel: number;
  actionPlugin: string;
  metrics: TalentMetrics;
  awakeningMessage: string;
}

export interface UserBaseline {
  avgSteps: number;
  avgTime: number;
  streamCount: number;
}

const STANDARD_STEPS: Record<TaskCategory, number> = {
  MATHEMATICS: 10,
  SPATIAL_ART: 8,
  LOGIC: 12,
  SPEECH: 6,
};

const TALENT_PLUGINS: Record<string, string> = {
  SPATIAL_STRUCTURAL_INTUITION: 'PLUGIN_GLOBAL_DESIGN_LAB // 全球顶级建筑美术/独立设计项目库',
  HIGH_DENSITY_LOGIC_RESILIENCE: 'PLUGIN_QUANT_RESEARCH_LAB // 前沿量化研究与高阶算法实验环境',
  PATTERN_SYNTHESIS_GIFT: 'PLUGIN_CROSS_DISCIPLINE_LAB // 跨学科模式识别与原创研究通道',
  MATHEMATICAL_LEAP_INTUITION: 'PLUGIN_OLYMPIAD_FAST_TRACK // 数学奥林匹克极速跃迁通道',
  RHETORICAL_RESONANCE: 'PLUGIN_GLOBAL_DEBATE_STAGE // 全球演讲与领导力实训平台',
};

export class WuxianTalentRadar {
  private userBaselineMap = new Map<string, UserBaseline>();
  private streamHistory = new Map<string, BehaviorStream[]>();

  /**
   * 计算三大核心评估维度
   */
  computeMetrics(stream: BehaviorStream, baseline: UserBaseline): TalentMetrics {
    const standardSteps = STANDARD_STEPS[stream.taskCategory];

    // I_L: 直觉跃迁指数
    // 步骤压缩比越低 + 正确 → 直觉越强
    const stepCompression = stream.actualStepsCount / standardSteps;
    const timeEfficiency = baseline.avgTime > 0
      ? Math.min(1, baseline.avgTime / Math.max(stream.timeSpentSeconds, 1))
      : 0.5;
    const IL = stream.isCorrect
      ? clamp((1 - stepCompression) * 0.6 + timeEfficiency * 0.4, 0, 1)
      : clamp((1 - stepCompression) * 0.3, 0, 0.5);

    // R_D: 抗挫折自愈密度
    // 高重试 + 最终正确/短时完成 → 韧性极强
    const retryDensity = clamp(stream.errorRetryCount / 8, 0, 1);
    const recoverySpeed = stream.timeSpentSeconds < 120 ? 0.8 : stream.timeSpentSeconds < 300 ? 0.5 : 0.2;
    const emotionStability = stream.emotionPulseStability ?? 0.6;
    const RD = clamp(retryDensity * 0.4 + recoverySpeed * 0.35 + emotionStability * 0.25, 0, 1);

    // P_S: 模式识别敏感度
    // 跨科目关联 + 低步骤完成 → 模式洞察力强
    const crossLink = clamp((stream.crossSubjectLinkCount ?? 0) / 5, 0, 1);
    const spontaneousSpeed = stream.draftStepsCount > 0
      ? clamp(1 - stream.actualStepsCount / stream.draftStepsCount, 0, 1)
      : 0.3;
    const PS = clamp(crossLink * 0.5 + spontaneousSpeed * 0.3 + (1 - stepCompression) * 0.2, 0, 1);

    const composite = IL * 0.4 + RD * 0.35 + PS * 0.25;

    return {
      IL: +IL.toFixed(3),
      RD: +RD.toFixed(3),
      PS: +PS.toFixed(3),
      composite: +composite.toFixed(3),
    };
  }

  /**
   * 实时行为流分析
   */
  analyzeBehaviorStream(stream: BehaviorStream): TalentReport | null {
    const baseline = this.updateBaseline(stream.userId, stream);
    const metrics = this.computeMetrics(stream, baseline);

    this.recordStream(stream.userId, stream);

    const stepCompression = stream.actualStepsCount / STANDARD_STEPS[stream.taskCategory];

    // 空间与结构美学天赋
    if (
      stream.taskCategory === 'SPATIAL_ART' &&
      stepCompression < 0.3 &&
      stream.isCorrect &&
      metrics.IL >= 0.7
    ) {
      return this.buildReport(
        'SPATIAL_STRUCTURAL_INTUITION',
        '空间与结构美学天赋',
        0.92,
        TALENT_PLUGINS.SPATIAL_STRUCTURAL_INTUITION,
        metrics,
        stream,
      );
    }

    // 高密度逻辑自愈特质
    if (
      stream.taskCategory === 'LOGIC' &&
      stream.errorRetryCount > 5 &&
      stream.timeSpentSeconds < 120 &&
      metrics.RD >= 0.65
    ) {
      return this.buildReport(
        'HIGH_DENSITY_LOGIC_RESILIENCE',
        '高密度逻辑自愈特质',
        0.88,
        TALENT_PLUGINS.HIGH_DENSITY_LOGIC_RESILIENCE,
        metrics,
        stream,
      );
    }

    // 跨学科模式识别天赋
    if (
      (stream.crossSubjectLinkCount ?? 0) >= 3 &&
      metrics.PS >= 0.75 &&
      stream.isCorrect
    ) {
      return this.buildReport(
        'PATTERN_SYNTHESIS_GIFT',
        '跨学科模式识别天赋',
        0.85,
        TALENT_PLUGINS.PATTERN_SYNTHESIS_GIFT,
        metrics,
        stream,
      );
    }

    // 数学直觉跃迁
    if (
      stream.taskCategory === 'MATHEMATICS' &&
      stepCompression < 0.35 &&
      stream.isCorrect &&
      metrics.IL >= 0.8
    ) {
      return this.buildReport(
        'MATHEMATICAL_LEAP_INTUITION',
        '数学直觉跃迁天赋',
        0.90,
        TALENT_PLUGINS.MATHEMATICAL_LEAP_INTUITION,
        metrics,
        stream,
      );
    }

    // 演讲感染力共振
    if (
      stream.taskCategory === 'SPEECH' &&
      metrics.composite >= 0.7 &&
      stream.isCorrect
    ) {
      return this.buildReport(
        'RHETORICAL_RESONANCE',
        '语言感染力共振天赋',
        0.82,
        TALENT_PLUGINS.RHETORICAL_RESONANCE,
        metrics,
        stream,
      );
    }

    return null;
  }

  /**
   * 天分觉醒主动交互工作流
   */
  triggerTalentAwakening(userId: string, report: TalentReport): string {
    return [
      'WUXIAN 倾听到了你的神经共振。',
      '',
      `在刚刚结束的深度交互中，你用一种世俗教科书从未教过的路径，完成了对这道难题的狙击。`,
      `系统已为你锁定特质：【${report.talentLabel}】。`,
      '',
      `评估维度 — I_L: ${report.metrics.IL} · R_D: ${report.metrics.RD} · P_S: ${report.metrics.PS}`,
      '',
      `从现在开始，系统将为你炸开常规进度条，全网接入 ${report.actionPlugin}。`,
      '',
      '你不是普通人，我们不用按部就班。现在，敢不敢跟我一起用 1 年，去干翻那平庸的 10 年？',
    ].join('\n');
  }

  getMetricsOnly(stream: BehaviorStream): TalentMetrics {
    const baseline = this.userBaselineMap.get(stream.userId) ?? { avgSteps: 8, avgTime: 180, streamCount: 0 };
    return this.computeMetrics(stream, baseline);
  }

  private buildReport(
    id: string,
    label: string,
    confidence: number,
    plugin: string,
    metrics: TalentMetrics,
    stream: BehaviorStream,
  ): TalentReport {
    const report: TalentReport = {
      detectedTalent: id,
      talentLabel: label,
      confidenceLevel: confidence,
      actionPlugin: plugin,
      metrics,
      awakeningMessage: '',
    };
    report.awakeningMessage = this.triggerTalentAwakening(stream.userId, report);
    return report;
  }

  private updateBaseline(userId: string, stream: BehaviorStream): UserBaseline {
    const prev = this.userBaselineMap.get(userId) ?? { avgSteps: stream.actualStepsCount, avgTime: stream.timeSpentSeconds, streamCount: 0 };
    const n = prev.streamCount + 1;
    const updated: UserBaseline = {
      avgSteps: (prev.avgSteps * prev.streamCount + stream.actualStepsCount) / n,
      avgTime: (prev.avgTime * prev.streamCount + stream.timeSpentSeconds) / n,
      streamCount: n,
    };
    this.userBaselineMap.set(userId, updated);
    return updated;
  }

  private recordStream(userId: string, stream: BehaviorStream): void {
    const history = this.streamHistory.get(userId) ?? [];
    history.push(stream);
    if (history.length > 50) history.shift();
    this.streamHistory.set(userId, history);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** 模拟高天分行为流（用于演示触发） */
export function simulateTalentStream(userId: string, category: TaskCategory): BehaviorStream {
  const profiles: Record<TaskCategory, Partial<BehaviorStream>> = {
    SPATIAL_ART: { actualStepsCount: 2, draftStepsCount: 8, errorRetryCount: 1, timeSpentSeconds: 90, isCorrect: true },
    LOGIC: { actualStepsCount: 6, draftStepsCount: 12, errorRetryCount: 7, timeSpentSeconds: 95, isCorrect: true },
    MATHEMATICS: { actualStepsCount: 3, draftStepsCount: 10, errorRetryCount: 2, timeSpentSeconds: 60, isCorrect: true, crossSubjectLinkCount: 1 },
    SPEECH: { actualStepsCount: 4, draftStepsCount: 6, errorRetryCount: 3, timeSpentSeconds: 80, isCorrect: true },
  };

  return {
    userId,
    taskCategory: category,
    timeSpentSeconds: 90,
    draftStepsCount: 10,
    actualStepsCount: 5,
    errorRetryCount: 3,
    isCorrect: true,
    crossSubjectLinkCount: 2,
    mousePauseVariance: 0.3,
    emotionPulseStability: 0.75,
    ...profiles[category],
  };
}
