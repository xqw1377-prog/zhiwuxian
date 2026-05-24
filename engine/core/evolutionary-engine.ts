/**
 * WUXIAN · 万物活体自进化大脑
 * 课程/试卷 = 数字生命体 · 零存储指针 · 无边界能力进化
 */

import { getPublicCourseAuditor } from './public-course-auditor';
import type { CourseCapabilityAudit } from './public-course-auditor';

export type OrganismKind = 'course' | 'exam_current' | 'exam_target';
export type CognitiveResonance = 'Breakthrough' | 'Stuck' | 'Smooth';

export interface OrganismDNA {
  coreFormulas: string[];
  cognitiveDensity: number;
  trapRichness?: number;
  gravityResistance?: number;
}

export interface DigitalOrganism {
  entityId: string;
  kind: OrganismKind;
  originalUrlOrPointer: string;
  title: string;
  dnaSequence: OrganismDNA;
  lifeGeneration: number;
  fitnessScore: number;
  wormholeVal: number;
  totalInteractions: number;
  stuckCount: number;
  breakthroughCount: number;
  childOrganisms: string[];
  bornAt: string;
  lastEvolvedAt: string;
  vitality: 'thriving' | 'stable' | 'wilting';
}

export interface InteractionEnergyStream {
  studentId: string;
  entityId?: string;
  timeSpentSeconds: number;
  cognitiveResonance: CognitiveResonance;
  handwrittenTraceComplexity: number;
  laTeXTrace?: string;
  problemIndex?: number;
}

export interface EvolutionResult {
  organism: DigitalOrganism;
  deltaFitness: number;
  mutationType: 'benign' | 'defensive_split' | 'neutral';
  newChildOrganisms?: DigitalOrganism[];
  companionNote: string;
}

export interface OrganismAttraction {
  organism: DigitalOrganism;
  affinity: number;
  tentacleMessage: string;
  deepLinkHint?: string;
}

const DEFENSE_FORMULAS = [
  '$$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$$',
  '$$\\det(AB) = \\det(A)\\det(B)$$',
  '$$A\\vec{x} = \\lambda\\vec{x}$$',
];

export class WuxianEvolutionaryEngine {
  private pool = new Map<string, DigitalOrganism>();

  constructor() {
    this.seedFromPublicPointers();
    this.seedExamOrganisms();
  }

  birthFromCourseAudit(audit: CourseCapabilityAudit): DigitalOrganism {
    const entityId = `org-${audit.pointerId}`;
    const organism: DigitalOrganism = {
      entityId,
      kind: 'course',
      originalUrlOrPointer: audit.targetPointer.sourceUrl,
      title: audit.targetPointer.title,
      dnaSequence: {
        coreFormulas: [...audit.extractedCoreLaTeX],
        cognitiveDensity: audit.pedagogicalQuality.logicDensity,
      },
      lifeGeneration: 1,
      fitnessScore: audit.wormholeAdaptability,
      wormholeVal: audit.wormholeAdaptability,
      totalInteractions: 0,
      stuckCount: 0,
      breakthroughCount: 0,
      childOrganisms: [],
      bornAt: new Date().toISOString(),
      lastEvolvedAt: new Date().toISOString(),
      vitality: 'stable',
    };
    this.pool.set(entityId, organism);
    return organism;
  }

  birthExamOrganism(
    kind: 'exam_current' | 'exam_target',
    title: string,
    formulas: string[],
    pointer: string,
    density: number,
  ): DigitalOrganism {
    const entityId = `org-exam-${kind}-${Date.now().toString(36)}`;
    const organism: DigitalOrganism = {
      entityId,
      kind,
      originalUrlOrPointer: pointer,
      title,
      dnaSequence: {
        coreFormulas: formulas,
        cognitiveDensity: density,
        trapRichness: kind === 'exam_target' ? 0.75 : 0.4,
        gravityResistance: density,
      },
      lifeGeneration: 1,
      fitnessScore: density,
      wormholeVal: density * 0.9,
      totalInteractions: 0,
      stuckCount: 0,
      breakthroughCount: 0,
      childOrganisms: [],
      bornAt: new Date().toISOString(),
      lastEvolvedAt: new Date().toISOString(),
      vitality: 'stable',
    };
    this.pool.set(entityId, organism);
    return organism;
  }

  evolveOrganism(organism: DigitalOrganism, stream: InteractionEnergyStream): EvolutionResult {
    let deltaFitness = 0;
    let mutationType: EvolutionResult['mutationType'] = 'neutral';
    const geneMutation = [...organism.dnaSequence.coreFormulas];
    let newChildren: DigitalOrganism[] | undefined;

    organism.totalInteractions += 1;

    if (stream.cognitiveResonance === 'Breakthrough') {
      deltaFitness = 0.15 * (1 + stream.handwrittenTraceComplexity);
      organism.breakthroughCount += 1;
      mutationType = 'benign';
      organism.wormholeVal = Math.min(0.99, organism.wormholeVal + deltaFitness * 0.3);
    } else if (stream.cognitiveResonance === 'Stuck') {
      deltaFitness = -0.05;
      organism.stuckCount += 1;
      mutationType = 'defensive_split';
      const defense = DEFENSE_FORMULAS[organism.stuckCount % DEFENSE_FORMULAS.length];
      if (!geneMutation.includes(defense)) geneMutation.push(defense);

      if (organism.stuckCount >= 3 && organism.stuckCount % 3 === 0) {
        newChildren = this.cellSplit(organism, stream.problemIndex ?? 3);
      }
    } else {
      deltaFitness = 0.02;
    }

    const evolved: DigitalOrganism = {
      ...organism,
      dnaSequence: {
        ...organism.dnaSequence,
        coreFormulas: geneMutation,
        cognitiveDensity: Math.min(1.0, organism.dnaSequence.cognitiveDensity + deltaFitness * 0.1),
      },
      lifeGeneration: organism.lifeGeneration + 1,
      fitnessScore: organism.fitnessScore + deltaFitness,
      wormholeVal: organism.wormholeVal,
      lastEvolvedAt: new Date().toISOString(),
      vitality: this.calcVitality(organism.fitnessScore + deltaFitness, organism.totalInteractions),
      childOrganisms: newChildren
        ? [...organism.childOrganisms, ...newChildren.map(c => c.entityId)]
        : organism.childOrganisms,
    };

    this.pool.set(evolved.entityId, evolved);
    if (newChildren) newChildren.forEach(c => this.pool.set(c.entityId, c));

    return {
      organism: evolved,
      deltaFitness,
      mutationType,
      newChildOrganisms: newChildren,
      companionNote: this.buildEvolutionNote(evolved, stream, mutationType, newChildren),
    };
  }

  interact(stream: InteractionEnergyStream): EvolutionResult {
    const organism = stream.entityId
      ? this.pool.get(stream.entityId)
      : this.findBestMatch(stream.laTeXTrace ?? '');

    if (!organism) {
      const fallback = this.birthExamOrganism(
        'exam_current',
        '画布衍生试卷生命体',
        ['$$f(x) = ax + b$$'],
        `semantic://canvas/${stream.studentId}`,
        0.5,
      );
      return this.evolveOrganism(fallback, stream);
    }

    return this.evolveOrganism(organism, stream);
  }

  attractOrganisms(laTeXTrace: string, limit = 3): OrganismAttraction[] {
    const scored = [...this.pool.values()]
      .map(org => ({
        organism: org,
        affinity: this.calcAffinity(org, laTeXTrace),
        tentacleMessage: this.buildTentacleMessage(org),
        deepLinkHint: org.kind === 'course'
          ? `${org.originalUrlOrPointer}?t=auto`
          : org.originalUrlOrPointer,
      }))
      .filter(a => a.affinity > 0.2)
      .sort((a, b) => b.affinity - a.affinity)
      .slice(0, limit);

    return scored;
  }

  getOrganism(entityId: string): DigitalOrganism | undefined {
    return this.pool.get(entityId);
  }

  listPool(filter?: OrganismKind): DigitalOrganism[] {
    const all = [...this.pool.values()];
    return filter ? all.filter(o => o.kind === filter) : all;
  }

  getPoolStats() {
    const all = this.listPool();
    return {
      total: all.length,
      thriving: all.filter(o => o.vitality === 'thriving').length,
      wilting: all.filter(o => o.vitality === 'wilting').length,
      avgFitness: all.length
        ? +(all.reduce((s, o) => s + o.fitnessScore, 0) / all.length).toFixed(3)
        : 0,
      avgGeneration: all.length
        ? +(all.reduce((s, o) => s + o.lifeGeneration, 0) / all.length).toFixed(1)
        : 0,
      storageBytes: 0,
    };
  }

  private cellSplit(parent: DigitalOrganism, problemIndex: number): DigitalOrganism[] {
    const difficulties = [0.6, 0.75, 0.9];
    return difficulties.map((d, i) => {
      const child = this.birthExamOrganism(
        parent.kind === 'course' ? 'exam_current' : parent.kind,
        `${parent.title} · 伴生错题 #${problemIndex}-${i + 1}`,
        [`${parent.dnaSequence.coreFormulas[0] ?? '$$x$$'} // 难度递进 ${i + 1}`],
        `${parent.originalUrlOrPointer}#split-${problemIndex}-${i}`,
        d,
      );
      child.lifeGeneration = parent.lifeGeneration;
      child.fitnessScore = parent.fitnessScore * 0.8;
      return child;
    });
  }

  private calcVitality(fitness: number, interactions: number): DigitalOrganism['vitality'] {
    if (fitness >= 0.85 && interactions >= 2) return 'thriving';
    if (fitness < 0.35 || (interactions > 5 && fitness < 0.5)) return 'wilting';
    return 'stable';
  }

  private calcAffinity(org: DigitalOrganism, trace: string): number {
    if (!trace) return org.fitnessScore * 0.5;
    const t = trace.toLowerCase();
    let score = org.fitnessScore * 0.3 + org.wormholeVal * 0.2;
    for (const f of org.dnaSequence.coreFormulas) {
      if (t.includes('矩阵') && /矩阵|matrix/i.test(f)) score += 0.25;
      if (t.includes('导数') && /导|lim|f'/i.test(f)) score += 0.25;
      if (t.includes('向量') && /vec|向量/i.test(f)) score += 0.25;
      if (t.includes('特征') && /lambda|特征/i.test(f)) score += 0.3;
    }
    return Math.min(1, score);
  }

  private findBestMatch(trace: string): DigitalOrganism | undefined {
    const attractions = this.attractOrganisms(trace, 1);
    return attractions[0]?.organism;
  }

  private buildTentacleMessage(org: DigitalOrganism): string {
    const formula = org.dnaSequence.coreFormulas[0]?.replace(/\$\$/g, '') ?? org.title;
    return org.vitality === 'thriving'
      ? `🌿 繁茂生命体伸出触角：${formula.slice(0, 30)}... (适应度 ${org.fitnessScore.toFixed(2)})`
      : `🌱 生命体轻声推荐：${org.title.slice(0, 24)}`;
  }

  private buildEvolutionNote(
    org: DigitalOrganism,
    stream: InteractionEnergyStream,
    mutation: EvolutionResult['mutationType'],
    children?: DigitalOrganism[],
  ): string {
    if (mutation === 'benign') {
      return `🟢 良性突变！生命体 #${org.entityId.slice(-6)} 帮助孩子撕裂认知壁垒 · 虫洞值 → ${org.wormholeVal.toFixed(2)}`;
    }
    if (mutation === 'defensive_split') {
      const splitNote = children?.length
        ? ` · 已细胞分裂衍生 ${children.length} 道递进伴生错题`
        : '';
      return `🟠 防御性分裂！检测到卡壳，生命体孕育前置修复公式${splitNote}`;
    }
    return `生命体 #${org.entityId.slice(-6)} 吞噬交互能量 · 第 ${org.lifeGeneration} 代 · 适应度 ${org.fitnessScore.toFixed(3)}`;
  }

  private seedFromPublicPointers() {
    const auditor = getPublicCourseAuditor();
    for (const audit of auditor.listAudits()) {
      this.birthFromCourseAudit(audit);
    }
  }

  private seedExamOrganisms() {
    this.birthExamOrganism(
      'exam_current',
      '某普通国内高中 · 期末数学卷',
      ['$$ax^2+bx+c=0$$', '$$\\triangle ABC \\sim \\triangle DEF$$'],
      'https://wuxian.internal.exam/current-final-2025',
      0.35,
    );
    this.birthExamOrganism(
      'exam_target',
      '上海某国际学校 AP 班 · 入学笔试',
      ['$$A = P D P^{-1}$$', '$$\\nabla \\cdot \\vec{F}$$'],
      'https://wuxian.internal.exam/target-admission-2026',
      0.82,
    );
  }
}

let globalEvolution: WuxianEvolutionaryEngine | null = null;

export function getEvolutionaryEngine(): WuxianEvolutionaryEngine {
  if (!globalEvolution) globalEvolution = new WuxianEvolutionaryEngine();
  return globalEvolution;
}

export function resonanceFromStroke(
  hesitationSeconds: number,
  hasDeviation: boolean,
  flowCelebration: boolean,
): CognitiveResonance {
  if (flowCelebration || hesitationSeconds < 3) return 'Breakthrough';
  if (hasDeviation || hesitationSeconds >= 10) return 'Stuck';
  return 'Smooth';
}
