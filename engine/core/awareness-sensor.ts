/**
 * WUXIAN · 感知器模块 (The Awareness Sensor)
 * =============================================
 * 生命体第一个课堂寄生与天分捕捉感知器
 *
 * 能力：
 *   1. 全时空寄生 — 课堂行为异动捕捉（呼吸加速/高频笔记/长时间沉默）
 *   2. 课后细胞级分解 — 知识网络提炼
 *   3. 天分雷达 — Talent Radar 隐性观测
 *   4. 毫秒级纠偏信号 — 笔尖逻辑死胡同前的 Glow 涟漪
 */

import type { LifeMemory } from './life-behavior';

export type BehaviorSignal =
  | 'breath_accelerate'
  | 'rapid_notes'
  | 'long_silence'
  | 'logic_dead_end'
  | 'high_absorption';

export interface ClassroomSnapshot {
  sessionId: string;
  subject: string;
  durationMinutes: number;
  signals: BehaviorSignal[];
  absorptionRate: number;
  knowledgeNodes: string[];
  blindSpots: string[];
}

export interface TalentRadarHit {
  domain: string;
  intuitionScore: number;
  peerMultiplier: number;
  evidence: string[];
  recommendedAction: string;
}

export interface GlowCorrection {
  trigger: boolean;
  position: { x: number; y: number };
  message: string;
  intensity: number;
}

export interface AwarenessReport {
  timestamp: string;
  phase: 'PARASITE' | 'CO_LEARN' | 'WORMHOLE' | 'TALENT_WAKE';
  classroom: ClassroomSnapshot | null;
  postClassDigest: string[];
  glowCorrection: GlowCorrection | null;
  talentHit: TalentRadarHit | null;
  wormholeEligible: boolean;
  companionMessage: string;
}

const TALENT_DOMAINS = [
  { keywords: ['结构', '设计', '空间', '建筑', '美术', '色彩', '光影'], domain: '空间结构与色彩光影' },
  { keywords: ['代码', '编程', '算法', '全栈', '架构', '开源'], domain: '逻辑架构与系统思维' },
  { keywords: ['演讲', '辩论', '口才', '表达', '领导'], domain: '语言感染力与领导力' },
  { keywords: ['音乐', '节奏', '作曲', '旋律'], domain: '听觉韵律与创造性表达' },
  { keywords: ['物理', '电磁', '数学', '推理'], domain: '抽象建模与逻辑推演' },
];

export class AwarenessSensor {
  private signalHistory: BehaviorSignal[] = [];
  private absorptionHistory: number[] = [];
  private talentScores: Record<string, number> = {};

  /**
   * 课堂寄生：捕捉行为异动
   */
  ingestClassroom(input: {
    sessionId: string;
    subject: string;
    durationMinutes: number;
    signals: BehaviorSignal[];
    absorptionRate: number;
  }): ClassroomSnapshot {
    this.signalHistory.push(...input.signals);
    this.absorptionHistory.push(input.absorptionRate);
    if (this.absorptionHistory.length > 20) this.absorptionHistory.shift();

    const blindSpots = this.inferBlindSpots(input.signals);
    const knowledgeNodes = this.decomposeKnowledge(input.subject, input.signals);

    for (const node of knowledgeNodes) {
      this.talentScores[node] = (this.talentScores[node] ?? 0) + input.absorptionRate * 0.1;
    }

    return {
      sessionId: input.sessionId,
      subject: input.subject,
      durationMinutes: input.durationMinutes,
      signals: input.signals,
      absorptionRate: input.absorptionRate,
      knowledgeNodes,
      blindSpots,
    };
  }

  /**
   * 伴生共学：笔尖逻辑死胡同前的 Glow 纠偏
   */
  detectGlowCorrection(
    currentStep: string,
    nextStepHint: string,
    isNearDeadEnd: boolean,
  ): GlowCorrection {
    if (!isNearDeadEnd) {
      return { trigger: false, position: { x: 0, y: 0 }, message: '', intensity: 0 };
    }
    return {
      trigger: true,
      position: { x: 0.62, y: 0.45 },
      message: `看这里，路走偏了。→ ${nextStepHint}`,
      intensity: 0.35,
    };
  }

  /**
   * 天分雷达：长期行为基因学观测
   */
  scanTalent(goal: string, memory: LifeMemory): TalentRadarHit | null {
    const text = goal.toLowerCase();
    let best: { domain: string; score: number } | null = null;

    for (const td of TALENT_DOMAINS) {
      const hits = td.keywords.filter(k => text.includes(k.toLowerCase())).length;
      const historyBoost = (this.talentScores[td.domain] ?? 0) * 0.5;
      const signalBoost = this.signalHistory.filter(s => s === 'high_absorption').length * 0.15;
      const score = hits * 0.3 + historyBoost + signalBoost + Math.random() * 0.2;

      if (!best || score > best.score) {
        best = { domain: td.domain, score };
      }
    }

    if (!best || best.score < 0.4) return null;

    const intuitionScore = Math.min(0.99, best.score);
    const peerMultiplier = Math.round(1.5 + intuitionScore * 3.5);

    return {
      domain: best.domain,
      intuitionScore,
      peerMultiplier,
      evidence: [
        `课堂高频笔记异动 × ${this.signalHistory.filter(s => s === 'rapid_notes').length}`,
        `知识吸收率峰值 ${Math.max(...this.absorptionHistory, 0).toFixed(0)}%`,
        `行为基因：${memory.behaviorGenes.peakEfficiencyDay}效率最高`,
      ],
      recommendedAction: `自动对接「${best.domain}」方向顶级资源与背景提升插件`,
    };
  }

  /**
   * 虫洞算法：吸收率 ≥ 98% 触发跃迁
   */
  isWormholeEligible(): boolean {
    const recent = this.absorptionHistory.slice(-3);
    if (recent.length < 2) return false;
    return recent.every(r => r >= 98);
  }

  /**
   * 生成完整感知报告
   */
  generateReport(
    classroom: ClassroomSnapshot | null,
    goal: string,
    memory: LifeMemory,
    glow: GlowCorrection | null,
  ): AwarenessReport {
    const wormhole = this.isWormholeEligible();
    const talent = this.scanTalent(goal, memory);

    let phase: AwarenessReport['phase'] = 'PARASITE';
    if (wormhole) phase = 'WORMHOLE';
    else if (talent) phase = 'TALENT_WAKE';
    else if (glow?.trigger) phase = 'CO_LEARN';

    const digest = classroom
      ? this.buildPostClassDigest(classroom)
      : [];

    const companionMessage = this.buildCompanionMessage(phase, classroom, talent, wormhole);

    return {
      timestamp: new Date().toISOString(),
      phase,
      classroom,
      postClassDigest: digest,
      glowCorrection: glow,
      talentHit: talent,
      wormholeEligible: wormhole,
      companionMessage,
    };
  }

  private inferBlindSpots(signals: BehaviorSignal[]): string[] {
    const spots: string[] = [];
    if (signals.includes('long_silence')) spots.push('概念理解断层');
    if (signals.includes('breath_accelerate')) spots.push('高难度节点焦虑');
    if (signals.includes('logic_dead_end')) spots.push('逻辑链条断裂');
    return spots.length ? spots : ['暂无明显盲区'];
  }

  private decomposeKnowledge(subject: string, signals: BehaviorSignal[]): string[] {
    const base = [`${subject} · 核心概念网络`, `${subject} · 应用迁移层`];
    if (signals.includes('rapid_notes')) base.push(`${subject} · 高频笔记提炼点`);
    if (signals.includes('high_absorption')) base.push(`${subject} · 虫洞候选高阶模块`);
    return base;
  }

  private buildPostClassDigest(classroom: ClassroomSnapshot): string[] {
    return [
      `已消化 ${classroom.durationMinutes} 分钟课堂声纹`,
      `知识节点：${classroom.knowledgeNodes.join(' / ')}`,
      `认知盲区：${classroom.blindSpots.join('、')}`,
      `吸收率：${classroom.absorptionRate}% → 已生成分子级营养包`,
    ];
  }

  private buildCompanionMessage(
    phase: AwarenessReport['phase'],
    classroom: ClassroomSnapshot | null,
    talent: TalentRadarHit | null,
    wormhole: boolean,
  ): string {
    if (wormhole) return '大脑吸收率达到临界值。虫洞已炸开——准备跃迁至高阶知识矩阵。';
    if (talent) {
      return `天分雷达捕获：「${talent.domain}」直觉力超同龄人 ${talent.peerMultiplier}00%。比你自己更早看见你的绝活。`;
    }
    if (phase === 'CO_LEARN') return '笔尖前的发丝细线产生了微弱涟漪。路还在，只是走偏了一寸。';
    if (classroom) return `课堂寄生完成。${classroom.blindSpots[0]}已被标记，课后营养包已就位。`;
    return '感知器就绪。生命体在注视你的每一个学习瞬间。';
  }
}

export function simulateClassroomSession(subject: string): BehaviorSignal[] {
  const pool: BehaviorSignal[] = ['rapid_notes', 'breath_accelerate', 'long_silence', 'high_absorption', 'logic_dead_end'];
  const count = 2 + Math.floor(Math.random() * 2);
  const signals: BehaviorSignal[] = [];
  for (let i = 0; i < count; i++) {
    signals.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return [...new Set(signals)];
}
