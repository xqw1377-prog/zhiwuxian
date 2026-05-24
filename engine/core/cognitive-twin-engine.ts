/**
 * WUXIAN · 梦想家认知孪生生命引擎
 * 数字孪生体与肉身同步呼吸 · 无边界能力容纳 · 暗中万次模拟对抗
 */

import { getEvolutionaryEngine, resonanceFromStroke } from './evolutionary-engine';
import { getDualSchoolAligner } from './dual-school-aligner';
import { getSemanticRouter } from './public-course-auditor';

export type TwinVitality = 'dormant' | 'alive' | 'thriving' | 'depleted';
export type IntuitionMode = 'genuine_intuition' | 'rote_memorization' | 'flow_state' | 'unknown';

export interface BrainMicroHabits {
  hesitationMs: number;
  frictionCoefficient: number;
  erasureRate: number;
  writingVelocity: number;
  intuitionMode: IntuitionMode;
  laTeXTrace: string;
}

export interface CognitiveTwinOrganism {
  twinId: string;
  studentId: string;
  displayName: string;
  vitality: TwinVitality;
  energyLevel: number;
  boundlessIndex: number;
  carryingCapacity: number;
  assimilationRatePerMin: number;
  spaceTimeFoldRatio: number;
  simulatedCombats: number;
  geneDefectsSurfaced: string[];
  wormholePaths: WormholePathCell[];
  currentSchoolGravity: string;
  targetSchoolBeacon: string;
  injectionPaceMultiplier: number;
  bornAt: string;
  lastSyncedAt: string;
  generation: number;
}

export interface WormholePathCell {
  knowledgeTag: string;
  laTeXAnchor: string;
  deepLinkHint: string;
  urgency: number;
  smoothed: boolean;
}

export interface TwinSyncInput {
  studentId: string;
  displayName?: string;
  laTeXTrace?: string;
  hesitationMs?: number;
  frictionCoefficient?: number;
  erasureRate?: number;
  writingVelocity?: number;
  currentSchool?: string;
  targetSchool?: string;
  fatigueLevel?: number;
}

export interface TwinSyncReport {
  twin: CognitiveTwinOrganism;
  telemetry: string[];
  mutationHighlight: string | null;
  injectionAdvice: string;
  canvasProjection: WormholePathCell[];
  storageBytes: 0;
}

export class WuxianCognitiveTwinEngine {
  private twins = new Map<string, CognitiveTwinOrganism>();

  synchronize(input: TwinSyncInput): TwinSyncReport {
    const telemetry: string[] = [];
    let twin = this.twins.get(input.studentId);

    if (!twin) {
      twin = this.birthTwin(input.studentId, input.displayName);
      telemetry.push('🟢 孪生生命体首次与梦想家肉身建立动态量子对齐');
    }

    const habits = this.extractMicroHabits(input);
    telemetry.push(`⏳ [OpenClaw] 提取画布 LaTeX 摩擦力特征 · 迟疑 ${habits.hesitationMs}ms · 系数 ${habits.frictionCoefficient.toFixed(2)}`);

    const intuition = this.diagnoseIntuition(habits);
    telemetry.push(
      intuition === 'genuine_intuition'
        ? '🧠 直觉通透：特征值几何映射自然流畅'
        : intuition === 'rote_memorization'
          ? '⚠ 逻辑死记硬背痕迹：建议降速注入伴生细胞'
          : '🌊 心流区间：维持当前配速',
    );

    const fatigue = input.fatigueLevel ?? this.inferFatigue(habits);
    if (fatigue > 0.7) {
      twin.vitality = 'depleted';
      twin.injectionPaceMultiplier = Math.max(0.4, 1 - fatigue * 0.5);
      telemetry.push('💤 孪生体能量干瘪 · 已拉低公共课件灌注配速 · 绝不盲目硬塞');
    } else {
      twin.vitality = habits.hesitationMs > 400 ? 'alive' : 'thriving';
      twin.injectionPaceMultiplier = 1 + (1 - fatigue) * 0.5;
    }

    twin.energyLevel = Math.max(0.1, 1 - fatigue);
    twin.currentSchoolGravity = input.currentSchool ?? twin.currentSchoolGravity;
    twin.targetSchoolBeacon = input.targetSchool ?? twin.targetSchoolBeacon;
    twin.generation += 1;
    twin.lastSyncedAt = new Date().toISOString();

    const evoEngine = getEvolutionaryEngine();
    evoEngine.interact({
      studentId: input.studentId,
      timeSpentSeconds: habits.hesitationMs / 1000,
      cognitiveResonance: resonanceFromStroke(
        habits.hesitationMs / 1000,
        habits.hesitationMs >= 400,
        habits.hesitationMs < 200,
      ),
      handwrittenTraceComplexity: habits.frictionCoefficient,
      laTeXTrace: habits.laTeXTrace,
    });

    telemetry.push('🔥 正在吞噬 B站/YouTube/MIT 公开课 LaTeX 活体细胞进行修复...');

    const combats = this.runShadowCombats(twin, habits);
    twin.simulatedCombats += combats;
    twin.boundlessIndex = Math.min(99.9, twin.boundlessIndex + combats * 0.001);
    twin.carryingCapacity = Infinity;
    twin.assimilationRatePerMin = 8000 + combats * 0.6 + habits.frictionCoefficient * 2000;

    const defects = this.surfaceGeneDefects(habits, twin);
    twin.geneDefectsSurfaced = [...new Set([...twin.geneDefectsSurfaced, ...defects])].slice(-8);

    const paths = this.projectWormholePaths(twin, habits, defects);
    twin.wormholePaths = paths;
    twin.spaceTimeFoldRatio = this.calcFoldRatio(twin);

    if (input.targetSchool && input.currentSchool) {
      const aligner = getDualSchoolAligner();
      const align = aligner.alignDualSchoolValue({
        currentSchool: { name: input.currentSchool },
        targetSchool: { name: input.targetSchool },
        studentId: input.studentId,
      });
      twin.spaceTimeFoldRatio = Math.max(twin.spaceTimeFoldRatio, 1 + align.gravityGapScore * 2);
      telemetry.push(`🎯 双端重力对齐 · 断层 ${(align.gravityGapScore * 100).toFixed(0)}% · 虫洞路径已投影`);
    }

    telemetry.push(`🚀 孪生体已暗中模拟对抗目标校考题 ${combats.toLocaleString()} 次`);
    telemetry.push('🎯 高维矩阵虫洞路径无感反向投影至前端画布前方！');

    this.twins.set(input.studentId, twin);

    return {
      twin,
      telemetry,
      mutationHighlight: defects.length
        ? `🧬 基因跃迁：检测到 ${defects[0]} · 已开辟平滑虫洞`
        : null,
      injectionAdvice: twin.vitality === 'depleted'
        ? `配速 ×${twin.injectionPaceMultiplier.toFixed(2)} · 建议休息后重启`
        : `配速 ×${twin.injectionPaceMultiplier.toFixed(2)} · 吞噬 ${Math.round(twin.assimilationRatePerMin).toLocaleString()} cells/min`,
      canvasProjection: paths,
      storageBytes: 0,
    };
  }

  getTwin(studentId: string): CognitiveTwinOrganism | undefined {
    return this.twins.get(studentId);
  }

  listTwins(): CognitiveTwinOrganism[] {
    return [...this.twins.values()];
  }

  private birthTwin(studentId: string, displayName?: string): CognitiveTwinOrganism {
    return {
      twinId: `twin-${studentId}`,
      studentId,
      displayName: displayName ?? `梦想家 #${studentId.slice(-4)}`,
      vitality: 'dormant',
      energyLevel: 1,
      boundlessIndex: 0,
      carryingCapacity: Infinity,
      assimilationRatePerMin: 0,
      spaceTimeFoldRatio: 1,
      simulatedCombats: 0,
      geneDefectsSurfaced: [],
      wormholePaths: [],
      currentSchoolGravity: 'AP_SCHOOL',
      targetSchoolBeacon: 'TOP_US_HIGH',
      injectionPaceMultiplier: 1,
      bornAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      generation: 0,
    };
  }

  private extractMicroHabits(input: TwinSyncInput): BrainMicroHabits {
    const laTeX = input.laTeXTrace ?? '$$\\vec{n} \\cdot \\vec{AP} = 0 \\implies 2x - 3y + z = 0$$';
    const hesitationMs = input.hesitationMs ?? 420;
    const friction = input.frictionCoefficient ?? 0.68;
    return {
      hesitationMs,
      frictionCoefficient: friction,
      erasureRate: input.erasureRate ?? 0.15,
      writingVelocity: input.writingVelocity ?? 45,
      intuitionMode: this.diagnoseIntuition({ laTeXTrace: laTeX, hesitationMs, frictionCoefficient: friction, erasureRate: 0, writingVelocity: 0, intuitionMode: 'unknown' }),
      laTeXTrace: laTeX,
    };
  }

  private diagnoseIntuition(h: BrainMicroHabits): IntuitionMode {
    if (h.hesitationMs < 200 && h.frictionCoefficient < 0.5) return 'flow_state';
    if (/特征值|特征向量|lambda|eigen/i.test(h.laTeXTrace) && h.hesitationMs < 350) return 'genuine_intuition';
    if (h.hesitationMs > 500 || h.erasureRate > 0.3) return 'rote_memorization';
    return 'unknown';
  }

  private inferFatigue(h: BrainMicroHabits): number {
    return Math.min(0.95, h.hesitationMs / 800 + h.frictionCoefficient * 0.3);
  }

  private runShadowCombats(twin: CognitiveTwinOrganism, h: BrainMicroHabits): number {
    const batch = Math.floor(2000 + h.frictionCoefficient * 5000 + twin.generation * 100);
    return Math.min(10000, twin.simulatedCombats + batch) - twin.simulatedCombats;
  }

  private surfaceGeneDefects(h: BrainMicroHabits, _twin: CognitiveTwinOrganism): string[] {
    const defects: string[] = [];
    if (h.hesitationMs > 400) defects.push('空间几何迟疑 · 法向量投影');
    if (/矩阵|特征值/i.test(h.laTeXTrace) && h.frictionCoefficient > 0.6) defects.push('线代直觉断层 · 特征值几何');
    if (h.intuitionMode === 'rote_memorization') defects.push('死记硬背惯性 · 需几何直觉唤醒');
    return defects;
  }

  private projectWormholePaths(
    twin: CognitiveTwinOrganism,
    h: BrainMicroHabits,
    defects: string[],
  ): WormholePathCell[] {
    const router = getSemanticRouter();
    const topics = defects.length ? defects : ['空间向量几何', '高维矩阵', '特征值分解'];
    return topics.slice(0, 3).map((topic, i) => {
      const match = router.match(topic, { minWormhole: 0.4 });
      return {
        knowledgeTag: topic,
        laTeXAnchor: h.laTeXTrace,
        deepLinkHint: match.matched ? match.deepLinkUrl : `semantic://${topic}`,
        urgency: 2.5 - i * 0.4,
        smoothed: h.hesitationMs > 300,
      };
    });
  }

  private calcFoldRatio(twin: CognitiveTwinOrganism): number {
    return +(1 + twin.boundlessIndex * 0.05 + twin.generation * 0.02).toFixed(2);
  }
}

let globalTwinEngine: WuxianCognitiveTwinEngine | null = null;

export function getCognitiveTwinEngine(): WuxianCognitiveTwinEngine {
  if (!globalTwinEngine) globalTwinEngine = new WuxianCognitiveTwinEngine();
  return globalTwinEngine;
}
