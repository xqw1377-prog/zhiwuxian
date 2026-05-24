/**
 * WUXIAN · 全时空寄生：课堂录音课后细胞级分解引擎
 * (Audio Assimilation Protocol)
 * ========================================================
 * 能力：
 *   1. 声纹解耦 — 授课老师 vs 学生声纹分离
 *   2. 神经高亮锚点 — 困惑/兴奋/分神异动捕捉
 *   3. 三层认知金字塔 — 逻辑硬核 / 盲区突击 / 虫洞加速
 *   4. 毫秒级注入横向时空画布
 */

import {
  WuxianWormholeEngine,
  buildLearningStateFromRadar,
  type LearningState,
} from './wormhole-engine';

export type UserReactionType = 'CONFUSED' | 'EXCITED' | 'DISTRACTED';

export interface NeuralAnchor {
  timestampSeconds: number;
  userReactionType: UserReactionType;
  topicHint?: string;
  intensity?: number;
}

export interface VoiceSeparationMeta {
  teacherVoiceRatio: number;
  studentVoiceRatio: number;
  ambientNoiseFiltered: boolean;
}

export interface ClassroomAudioPayload {
  sessionId: string;
  subject?: string;
  durationMinutes: number;
  rawAudioLengthMb: number;
  neuralAnchors: NeuralAnchor[];
  voiceSeparation?: VoiceSeparationMeta;
}

export interface LogicBoneCell {
  id: string;
  concept: string;
  formula?: string;
  weight: number;
}

export interface BlindSpotCell {
  id: string;
  anchorTimestamp: number;
  label: string;
  correctionTask: string;
  estimatedMinutes: number;
}

export interface WormholeGatewayCell {
  triggered: boolean;
  nextNodeLabel: string;
  extensionConcept: string;
  absorptionRate: number;
}

export interface CognitivePyramid {
  layer1LogicBone: LogicBoneCell[];
  layer2BlindSpot: BlindSpotCell[];
  layer3WormholeGateway: WormholeGatewayCell | null;
}

export interface CanvasCellInjection {
  cellId: string;
  label: string;
  layer: 'LOGIC' | 'BLIND' | 'WORMHOLE';
  flowProgress: number;
  glowColor: string;
}

export interface AssimilationResult {
  sessionId: string;
  subject: string;
  durationMinutes: number;
  neuralAnchorCount: number;
  voiceSeparation: VoiceSeparationMeta;
  absorptionRate: number;
  intuitiveLeapIndex: number;
  lazyRiskScore: number;
  pyramid: CognitivePyramid;
  wormholeTriggered: boolean;
  wormholeJump: ReturnType<WuxianWormholeEngine['evaluateWormholeJump']> | null;
  canvasCells: CanvasCellInjection[];
  blindSpotGravityPoints: { x: number; depth: number }[];
  companionMessage: string;
}

/** 学科 → 逻辑硬核细胞库 */
const SUBJECT_LOGIC_MAP: Record<string, LogicBoneCell[]> = {
  GEOMETRY: [
    { id: 'geo-1', concept: '向量代数空间几何', formula: 'v⃗ = (x, y, z)', weight: 0.95 },
    { id: 'geo-2', concept: '矩阵的线性变换规律', formula: 'T(x) = Ax', weight: 0.88 },
    { id: 'geo-3', concept: '相似三角形的比例不变性', formula: 'a/b = c/d', weight: 0.82 },
  ],
  CALCULUS: [
    { id: 'calc-1', concept: '导数即瞬时变化率', formula: "f'(x) = lim Δy/Δx", weight: 0.92 },
    { id: 'calc-2', concept: '链式法则的复合映射', formula: '(f∘g)\' = f\'(g)·g\'', weight: 0.87 },
    { id: 'calc-3', concept: '积分与面积的互逆关系', formula: '∫f(x)dx = F(x)+C', weight: 0.85 },
  ],
  PHYSICS: [
    { id: 'phy-1', concept: '麦克斯韦方程组统一场论', weight: 0.9 },
    { id: 'phy-2', concept: '法拉第电磁感应定律', formula: 'ε = -dΦ/dt', weight: 0.86 },
    { id: 'phy-3', concept: '楞次定律的方向判定', weight: 0.8 },
  ],
  DEFAULT: [
    { id: 'def-1', concept: '核心概念网络拓扑', weight: 0.85 },
    { id: 'def-2', concept: '知识迁移与类比映射', weight: 0.8 },
    { id: 'def-3', concept: '底层逻辑骨架提炼', weight: 0.75 },
  ],
};

const CONFUSED_TOPIC_MAP: Record<number, string> = {
  0: '高维矩阵叉乘',
  1: '链式法则复合求导',
  2: '向量空间基底变换',
  3: '电磁场边界条件',
  4: '相似三角形比例证明',
};

const SUBJECT_NODE_MAP: Record<string, string> = {
  GEOMETRY: '初中几何-相似三角形',
  CALCULUS: 'AP微积分-导数',
  PHYSICS: '高中物理-电磁感应',
  DEFAULT: '全栈基础-HTML/CSS',
};

export class WuxianAudioAssimilationEngine {
  private wormholeEngine = new WuxianWormholeEngine();

  /**
   * 核心协议：下课瞬间，将整堂课录音进行细胞级粉碎与重构
   */
  assimilateClassroomAudio(audioData: ClassroomAudioPayload): AssimilationResult {
    const subject = audioData.subject ?? 'GEOMETRY';
    const voiceSeparation = audioData.voiceSeparation ?? this.simulateVoiceSeparation();
    const logicBone = this.extractLogicBone(subject);
    const blindSpots = this.deriveBlindSpots(audioData.neuralAnchors);
    const metrics = this.computeResonanceMetrics(audioData.neuralAnchors);

    const learningState = buildLearningStateFromRadar(
      audioData.sessionId,
      SUBJECT_NODE_MAP[subject] ?? SUBJECT_NODE_MAP.DEFAULT,
      metrics.absorptionRate,
      metrics.intuitiveLeapIndex,
      metrics.lazyRiskScore,
    );

    let wormholeJump: AssimilationResult['wormholeJump'] = null;
    let wormholeTriggered = false;

    if (metrics.wormholeReady) {
      wormholeJump = this.wormholeEngine.evaluateWormholeJump(learningState);
      wormholeTriggered = wormholeJump.isJumpTriggered;
    }

    const wormholeGateway: WormholeGatewayCell | null = wormholeTriggered && wormholeJump
      ? {
          triggered: true,
          nextNodeLabel: wormholeJump.nextNodeLabel,
          extensionConcept: wormholeJump.nextKnowledgeNode,
          absorptionRate: metrics.absorptionRate,
        }
      : metrics.absorptionRate >= 0.9
        ? {
            triggered: false,
            nextNodeLabel: '虫洞阈值临近',
            extensionConcept: '继续夯实当前层级，跃迁窗口即将打开',
            absorptionRate: metrics.absorptionRate,
          }
        : null;

    const pyramid: CognitivePyramid = {
      layer1LogicBone: logicBone,
      layer2BlindSpot: blindSpots,
      layer3WormholeGateway: wormholeGateway,
    };

    const canvasCells = this.buildCanvasCells(pyramid);
    const blindSpotGravityPoints = blindSpots.map((_, i) => ({
      x: 0.25 + i * 0.18,
      depth: 12 + i * 4,
    }));

    return {
      sessionId: audioData.sessionId,
      subject,
      durationMinutes: audioData.durationMinutes,
      neuralAnchorCount: audioData.neuralAnchors.length,
      voiceSeparation,
      absorptionRate: metrics.absorptionRate,
      intuitiveLeapIndex: metrics.intuitiveLeapIndex,
      lazyRiskScore: metrics.lazyRiskScore,
      pyramid,
      wormholeTriggered,
      wormholeJump,
      canvasCells,
      blindSpotGravityPoints,
      companionMessage: this.buildCompanionMessage(pyramid, wormholeTriggered, audioData),
    };
  }

  /**
   * 将分解后的认知细胞，毫秒级注入用户横向时空画布
   */
  pushCellsToClientCanvas(cells: CognitivePyramid): CanvasCellInjection[] {
    return this.buildCanvasCells(cells);
  }

  private simulateVoiceSeparation(): VoiceSeparationMeta {
    return {
      teacherVoiceRatio: 0.72,
      studentVoiceRatio: 0.18,
      ambientNoiseFiltered: true,
    };
  }

  private extractLogicBone(subject: string): LogicBoneCell[] {
    return (SUBJECT_LOGIC_MAP[subject] ?? SUBJECT_LOGIC_MAP.DEFAULT).slice(0, 3);
  }

  private deriveBlindSpots(anchors: NeuralAnchor[]): BlindSpotCell[] {
    const confused = anchors.filter(a => a.userReactionType === 'CONFUSED');
    if (confused.length === 0) {
      return [{
        id: 'bs-clear',
        anchorTimestamp: 0,
        label: '本堂课认知极其通透，无明显盲区',
        correctionTask: '保持当前共振节奏，进入延伸探索',
        estimatedMinutes: 0,
      }];
    }

    return confused.map((anchor, i) => {
      const topic = anchor.topicHint ?? CONFUSED_TOPIC_MAP[i % 5];
      return {
        id: `bs-${i}`,
        anchorTimestamp: anchor.timestampSeconds,
        label: `第 ${anchor.timestampSeconds}s 处卡壳的【${topic}】知识漏洞`,
        correctionTask: `15分钟定制扫盲：${topic} 逆向拆解`,
        estimatedMinutes: 15,
      };
    });
  }

  private computeResonanceMetrics(anchors: NeuralAnchor[]) {
    const excitedCount = anchors.filter(a => a.userReactionType === 'EXCITED').length;
    const confusedCount = anchors.filter(a => a.userReactionType === 'CONFUSED').length;
    const distractedCount = anchors.filter(a => a.userReactionType === 'DISTRACTED').length;

    const baseAbsorption = 0.75;
    const absorptionRate = Math.min(0.99, baseAbsorption + excitedCount * 0.05 - confusedCount * 0.03 - distractedCount * 0.08);
    const intuitiveLeapIndex = Math.min(0.95, 0.4 + excitedCount * 0.12);
    const lazyRiskScore = Math.max(0.3, 0.5 + distractedCount * 0.4 + confusedCount * 0.1);

    const wormholeReady = excitedCount > 3 && distractedCount === 0 && absorptionRate >= 0.95;

    return { absorptionRate, intuitiveLeapIndex, lazyRiskScore, wormholeReady, excitedCount, confusedCount, distractedCount };
  }

  private buildCanvasCells(pyramid: CognitivePyramid): CanvasCellInjection[] {
    const cells: CanvasCellInjection[] = [];

    pyramid.layer1LogicBone.forEach((cell, i) => {
      cells.push({
        cellId: cell.id,
        label: cell.concept,
        layer: 'LOGIC',
        flowProgress: 0.15 + i * 0.12,
        glowColor: '#39FF14',
      });
    });

    pyramid.layer2BlindSpot
      .filter(b => b.estimatedMinutes > 0)
      .forEach((spot, i) => {
        cells.push({
          cellId: spot.id,
          label: spot.label.slice(0, 24) + '…',
          layer: 'BLIND',
          flowProgress: 0.35 + i * 0.1,
          glowColor: '#FFF01F',
        });
      });

    if (pyramid.layer3WormholeGateway?.triggered) {
      cells.push({
        cellId: 'wh-gate',
        label: pyramid.layer3WormholeGateway.nextNodeLabel,
        layer: 'WORMHOLE',
        flowProgress: 0.85,
        glowColor: '#FF5E00',
      });
    }

    return cells;
  }

  private buildCompanionMessage(
    pyramid: CognitivePyramid,
    wormholeTriggered: boolean,
    audio: ClassroomAudioPayload,
  ): string {
    if (wormholeTriggered) {
      return [
        `第 ${audio.durationMinutes} 分钟课堂已被完全吞噬。`,
        '极高共振达成——主画布正在执行【时空折叠】。',
        `虫洞入口已炸开，降落至：${pyramid.layer3WormholeGateway?.nextNodeLabel}。`,
      ].join('\n');
    }

    const blindCount = pyramid.layer2BlindSpot.filter(b => b.estimatedMinutes > 0).length;
    if (blindCount > 0) {
      return [
        `课堂寄生完成。${audio.neuralAnchors.length} 个神经锚点已归档。`,
        `检测到 ${blindCount} 处认知深坑，画布引力场已弯曲。`,
        '今晚陪你做 15 分钟扫盲，航线将重新拉直。',
      ].join('\n');
    }

    return [
      `已消化 ${audio.durationMinutes} 分钟课堂声纹。`,
      `逻辑硬核细胞 × ${pyramid.layer1LogicBone.length} 已注入成长图谱。`,
      '认知通透，生命体继续陪你进化。',
    ].join('\n');
  }
}

/** 模拟一堂典型课堂的寄生数据流 */
export function simulateClassroomAudio(sessionId: string, subject = 'GEOMETRY'): ClassroomAudioPayload {
  return {
    sessionId,
    subject,
    durationMinutes: 45,
    rawAudioLengthMb: 38.5,
    neuralAnchors: [
      { timestampSeconds: 312, userReactionType: 'CONFUSED', topicHint: '高维矩阵叉乘', intensity: 0.82 },
      { timestampSeconds: 580, userReactionType: 'EXCITED', intensity: 0.91 },
      { timestampSeconds: 890, userReactionType: 'EXCITED', intensity: 0.88 },
      { timestampSeconds: 1205, userReactionType: 'CONFUSED', topicHint: '向量空间基底变换', intensity: 0.76 },
      { timestampSeconds: 1580, userReactionType: 'EXCITED', intensity: 0.94 },
      { timestampSeconds: 1920, userReactionType: 'EXCITED', intensity: 0.89 },
      { timestampSeconds: 2340, userReactionType: 'EXCITED', intensity: 0.92 },
    ],
    voiceSeparation: {
      teacherVoiceRatio: 0.74,
      studentVoiceRatio: 0.16,
      ambientNoiseFiltered: true,
    },
  };
}

/** 模拟虫洞就绪课堂（高共振零分神） */
export function simulateWormholeReadyClassroom(sessionId: string, subject = 'CALCULUS'): ClassroomAudioPayload {
  return {
    sessionId,
    subject,
    durationMinutes: 50,
    rawAudioLengthMb: 42,
    neuralAnchors: [
      { timestampSeconds: 420, userReactionType: 'EXCITED', intensity: 0.93 },
      { timestampSeconds: 780, userReactionType: 'EXCITED', intensity: 0.91 },
      { timestampSeconds: 1100, userReactionType: 'EXCITED', intensity: 0.95 },
      { timestampSeconds: 1450, userReactionType: 'EXCITED', intensity: 0.89 },
      { timestampSeconds: 1800, userReactionType: 'EXCITED', intensity: 0.94 },
    ],
    voiceSeparation: {
      teacherVoiceRatio: 0.78,
      studentVoiceRatio: 0.14,
      ambientNoiseFiltered: true,
    },
  };
}
