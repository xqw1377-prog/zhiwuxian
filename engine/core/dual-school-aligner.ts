/**
 * WUXIAN · 双端时空重力场审计矩阵
 * 就读校（起点）× 目标校（终点）→ 四维度价值匹配 → 虫洞配速报告
 */

import { getSemanticRouter } from './public-course-auditor';
import { getSchoolIntelligence } from './school-intelligence';

export interface SchoolMatrixInput {
  currentSchool: {
    name: string;
    examPapers?: string[];
    gpaDistribution?: string;
    curriculumTrack?: string;
    apClassCount?: number;
    tuitionTier?: string;
    ivyRate?: number;
  };
  targetSchool: {
    name: string;
    admissionExams?: string[];
    enrollmentBar?: string;
    curriculumTrack?: string;
    apClassCount?: number;
    tuitionTier?: string;
    ivyRate?: number;
  };
  studentId?: string;
}

export interface ActionRouteCell {
  knowledgeTag: string;
  urgencyMultiplier: number;
  matchedExamPointer?: string;
  coursePointerHint?: string;
}

export interface CurriculumGravityValue {
  gapScore: number;
  currentTrack: string;
  targetTrack: string;
  apClassGap: number;
  injectionDensityBoost: number;
  summary: string;
}

export interface ExamHardnessValue {
  currentLogicDensity: number;
  targetLogicDensity: number;
  latexTagsCurrent: string[];
  latexTagsTarget: string[];
  falseProsperity: boolean;
  riskWarning: string | null;
}

export interface EcologicalPeerValue {
  currentTuitionTier: string;
  targetTuitionTier: string;
  ivyRateCurrent: number;
  ivyRateTarget: number;
  saasExpansionValue: number;
  peerProfile: string;
}

export interface GravityGapIndex {
  score: number;
  label: 'LOW' | 'MODERATE' | 'SEVERE' | 'CRITICAL';
  wormholeRequired: boolean;
}

export interface SchoolValueDimensions {
  curriculumGravity: CurriculumGravityValue;
  examHardness: ExamHardnessValue;
  ecologicalPeerDensity: EcologicalPeerValue;
  gravityGapIndex: GravityGapIndex;
}

export interface WormholeVelocityReport {
  gravityGapScore: number;
  bottleneckAnalysis: string[];
  actionRouteCells: ActionRouteCell[];
  valueDimensions: SchoolValueDimensions;
  gravityCurve: {
    currentSchoolLine: number[];
    targetSchoolLine: number[];
    labels: string[];
  };
  companionBrief: string;
  storageBytes: 0;
}

const CURRENT_SCHOOL_SEEDS: Record<string, Partial<SchoolMatrixInput['currentSchool']>> = {
  '某普通国内高中': {
    curriculumTrack: '国内普高 · 人教版',
    apClassCount: 0,
    gpaDistribution: '通胀型给分 · 期末均分虚高',
    tuitionTier: '公立/低学费',
    ivyRate: 0.02,
    examPapers: ['一元二次方程求根', '平面几何相似三角形', '基础函数图像'],
  },
  '某市重点公立高中': {
    curriculumTrack: '国内重点 · 竞赛分流',
    apClassCount: 0,
    gpaDistribution: '中度严格',
    tuitionTier: '公立',
    ivyRate: 0.08,
    examPapers: ['二次函数压轴', '立体几何初步', '数列与不等式'],
  },
};

const TARGET_SCHOOL_DEFAULTS: Record<string, Partial<SchoolMatrixInput['targetSchool']>> = {
  '上海某国际学校 AP 班': {
    curriculumTrack: 'AP + 双语融合',
    apClassCount: 12,
    enrollmentBar: '托福 90+ / 校内笔试 85th',
    tuitionTier: '¥22-28万/年',
    ivyRate: 0.35,
    admissionExams: ['矩阵基底变换', 'AP Calculus BC 预备', '空间向量散度'],
  },
  '北京某顶尖美高预备部': {
    curriculumTrack: '美高预备 + AP 全栈',
    apClassCount: 15,
    enrollmentBar: 'SSAT 85th / 面试必过',
    tuitionTier: '¥35万/年',
    ivyRate: 0.42,
    admissionExams: ['特征值分解 $A=U\\Sigma V^T$', '高维几何直觉', '学术英语写作'],
  },
};

export class WuxianDualSchoolAligner {

  alignDualSchoolValue(matrix: SchoolMatrixInput): WormholeVelocityReport {
    const current = this.resolveCurrent(matrix.currentSchool);
    const target = this.resolveTarget(matrix.targetSchool);

    const curriculumGravity = this.evalCurriculumGravity(current, target);
    const examHardness = this.evalExamHardness(current, target);
    const ecologicalPeerDensity = this.evalEcologicalPeer(current, target);
    const gravityGapScore = this.calcGravityGap(curriculumGravity, examHardness, ecologicalPeerDensity);

    const gravityGapIndex: GravityGapIndex = {
      score: gravityGapScore,
      label: gravityGapScore >= 0.75 ? 'CRITICAL'
        : gravityGapScore >= 0.55 ? 'SEVERE'
        : gravityGapScore >= 0.35 ? 'MODERATE' : 'LOW',
      wormholeRequired: gravityGapScore >= 0.65,
    };

    const valueDimensions: SchoolValueDimensions = {
      curriculumGravity,
      examHardness,
      ecologicalPeerDensity,
      gravityGapIndex,
    };

    const bottleneckAnalysis = this.buildBottlenecks(valueDimensions);
    const actionRouteCells = this.buildActionCells(examHardness, target, gravityGapScore);
    const gravityCurve = this.buildGravityCurve(
      examHardness.currentLogicDensity,
      examHardness.targetLogicDensity,
    );

    return {
      gravityGapScore,
      bottleneckAnalysis,
      actionRouteCells,
      valueDimensions,
      gravityCurve,
      companionBrief: this.buildCompanionBrief(matrix, valueDimensions, actionRouteCells),
      storageBytes: 0,
    };
  }

  private resolveCurrent(raw: SchoolMatrixInput['currentSchool']) {
    const seed = CURRENT_SCHOOL_SEEDS[raw.name] ?? {};
    return { ...seed, ...raw };
  }

  private resolveTarget(raw: SchoolMatrixInput['targetSchool']) {
    const seed = TARGET_SCHOOL_DEFAULTS[raw.name] ?? {};
    const intel = getSchoolIntelligence();
    const profile = intel.getProfile(raw.name);
    return {
      ...seed,
      ...raw,
      admissionExams: raw.admissionExams ?? (
        profile ? [profile.admissionCriteria.mathRequirement] : seed.admissionExams
      ),
      enrollmentBar: raw.enrollmentBar ?? profile?.admissionCriteria.englishLevel,
    };
  }

  private evalCurriculumGravity(
    current: SchoolMatrixInput['currentSchool'],
    target: SchoolMatrixInput['targetSchool'],
  ): CurriculumGravityValue {
    const currentAp = current.apClassCount ?? 0;
    const targetAp = target.apClassCount ?? 8;
    const apClassGap = Math.max(0, targetAp - currentAp);
    const gapScore = Math.min(1, apClassGap / 12 + (currentAp === 0 && targetAp > 0 ? 0.35 : 0));

    return {
      gapScore: +gapScore.toFixed(2),
      currentTrack: current.curriculumTrack ?? '国内普高课程',
      targetTrack: target.curriculumTrack ?? 'AP/国际课程',
      apClassGap,
      injectionDensityBoost: 1 + gapScore * 2.5,
      summary: gapScore > 0.5
        ? `认知断层：就读校无 AP 体系，目标校要求 ${targetAp} 门 AP · 公共课件注入密度 ×${(1 + gapScore * 2.5).toFixed(1)}`
        : '课程体系基本衔接，维持标准注入密度',
    };
  }

  private evalExamHardness(
    current: SchoolMatrixInput['currentSchool'],
    target: SchoolMatrixInput['targetSchool'],
  ): ExamHardnessValue {
    const currentPapers = current.examPapers ?? ['基础代数', '平面几何'];
    const targetExams = target.admissionExams ?? ['矩阵运算', '空间几何'];

    const currentLogicDensity = this.latexHardnessFromTexts(currentPapers);
    const targetLogicDensity = this.latexHardnessFromTexts(targetExams);
    const falseProsperity = currentLogicDensity < 0.5 && targetLogicDensity >= 0.75;

    return {
      currentLogicDensity: +currentLogicDensity.toFixed(2),
      targetLogicDensity: +targetLogicDensity.toFixed(2),
      latexTagsCurrent: this.extractLatexTags(currentPapers, currentLogicDensity),
      latexTagsTarget: this.extractLatexTags(targetExams, targetLogicDensity),
      falseProsperity,
      riskWarning: falseProsperity
        ? `虚假繁荣预警：就读校期末逻辑密度 ${currentLogicDensity.toFixed(2)}，目标校入学考 ${targetLogicDensity.toFixed(2)} · 原校拿 A 不代表能考上`
        : null,
    };
  }

  private evalEcologicalPeer(
    current: SchoolMatrixInput['currentSchool'],
    target: SchoolMatrixInput['targetSchool'],
  ): EcologicalPeerValue {
    const ivyCurrent = current.ivyRate ?? 0.05;
    const ivyTarget = target.ivyRate ?? 0.3;
    const saasExpansionValue = Math.min(1, ivyTarget * 1.5 + (target.tuitionTier?.includes('35') ? 0.2 : 0));

    return {
      currentTuitionTier: current.tuitionTier ?? '公立/普通',
      targetTuitionTier: target.tuitionTier ?? '高学费国际',
      ivyRateCurrent: ivyCurrent,
      ivyRateTarget: ivyTarget,
      saasExpansionValue: +saasExpansionValue.toFixed(2),
      peerProfile: `目标校藤校率 ${(ivyTarget * 100).toFixed(0)}% · SaaS 圈层扩张价值 ${(saasExpansionValue * 100).toFixed(0)}%`,
    };
  }

  private calcGravityGap(
    curriculum: CurriculumGravityValue,
    exam: ExamHardnessValue,
    eco: EcologicalPeerValue,
  ): number {
    const examGap = Math.max(0, exam.targetLogicDensity - exam.currentLogicDensity);
    const raw = curriculum.gapScore * 0.35 + examGap * 0.45 + eco.saasExpansionValue * 0.1
      + (exam.falseProsperity ? 0.1 : 0);
    return +Math.min(0.99, raw).toFixed(2);
  }

  private buildBottlenecks(v: SchoolValueDimensions): string[] {
    const items: string[] = [];
    if (v.examHardness.falseProsperity) {
      items.push('当前就读学校的日常作业逻辑密度严重灌水，导致孩子产生虚假掌控感');
    }
    if (v.curriculumGravity.gapScore > 0.5) {
      items.push(`课程重力断层：${v.curriculumGravity.currentTrack} → ${v.curriculumGravity.targetTrack}`);
    }
    if (v.examHardness.targetLogicDensity >= 0.8) {
      items.push('目标学校对高维几何直觉要求极高，当前学校完全没有此类课程覆盖');
    }
    if (items.length === 0) {
      items.push('双端重力场基本平衡，建议维持当前配速并精细化查漏补缺');
    }
    return items;
  }

  private buildActionCells(
    exam: ExamHardnessValue,
    target: SchoolMatrixInput['targetSchool'],
    gapScore: number,
  ): ActionRouteCell[] {
    const router = getSemanticRouter();
    const cells: ActionRouteCell[] = [];
    const baseUrgency = 1.5 + gapScore * 2;

    const tags = exam.latexTagsTarget.length
      ? exam.latexTagsTarget
      : ['线性变换与矩阵本质 $$A = P D P^{-1}$$', '高维空间向量基底旋转'];

    tags.slice(0, 3).forEach((tag, i) => {
      const topic = tag.replace(/\$\$?[^$]+\$\$?/g, '').trim() || tag;
      const match = router.match(topic, { minWormhole: 0.4 });
      cells.push({
        knowledgeTag: tag,
        urgencyMultiplier: +(baseUrgency + (2 - i) * 0.5).toFixed(1),
        matchedExamPointer: `https://wuxian.internal.exam-match/${slugify(target.name)}/${i}`,
        coursePointerHint: match.matched ? match.deepLinkUrl : undefined,
      });
    });

    return cells;
  }

  private buildGravityCurve(current: number, target: number) {
    const labels = ['T-6月', 'T-4月', 'T-2月', 'T-0 入学考'];
    const currentLine = labels.map((_, i) =>
      +(current * (0.9 + i * 0.02)).toFixed(2),
    );
    const targetLine = labels.map((_, i) =>
      +(target * (0.85 + i * 0.04)).toFixed(2),
    );
    return { currentSchoolLine: currentLine, targetSchoolLine: targetLine, labels };
  }

  private latexHardnessFromTexts(texts: string[]): number {
    let score = 0.3;
    const joined = texts.join(' ').toLowerCase();
    if (/矩阵|特征值|svd|线代|基底|变换|eigen/i.test(joined)) score += 0.35;
    if (/散度|高维|拓扑|向量空间/i.test(joined)) score += 0.2;
    if (/二次函数|立体几何|数列/i.test(joined)) score += 0.1;
    if (/一元二次|相似三角形|基础/i.test(joined)) score -= 0.1;
    if (/ap|calculus|微积分/i.test(joined)) score += 0.15;
    return Math.max(0.15, Math.min(0.95, score));
  }

  private extractLatexTags(texts: string[], density: number): string[] {
    const tags: string[] = [];
    const joined = texts.join(' ');
    if (/矩阵|基底|变换/i.test(joined)) tags.push('线性变换 $$A = P D P^{-1}$$');
    if (/特征值|svd/i.test(joined)) tags.push('特征值分解 $$A = U\\Sigma V^T$$');
    if (/散度|高维/i.test(joined)) tags.push('高维向量散度 $$\\nabla \\cdot \\vec{F}$$');
    if (/二次函数|一元/i.test(joined)) tags.push('一元二次方程 $$ax^2+bx+c=0$$');
    if (/几何|三角形/i.test(joined)) tags.push('平面几何相似 $$\\triangle ABC \\sim \\triangle A\'B\'C\'$$');
    if (tags.length === 0) {
      tags.push(density > 0.6
        ? '矩阵基底变换 $$A\\vec{x}=\\lambda\\vec{x}$$'
        : '基础代数 $$f(x)=ax+b$$');
    }
    return tags;
  }

  private buildCompanionBrief(
    matrix: SchoolMatrixInput,
    v: SchoolValueDimensions,
    cells: ActionRouteCell[],
  ): string {
    return [
      `[OpenClaw 双端审计] 起点: ${matrix.currentSchool.name} → 终点: ${matrix.targetSchool.name}`,
      `重力断层指数 ${(v.gravityGapIndex.score * 100).toFixed(0)}% (${v.gravityGapIndex.label})`,
      `考题硬度: 就读校 ${v.examHardness.currentLogicDensity} vs 目标校 ${v.examHardness.targetLogicDensity}`,
      v.examHardness.riskWarning ?? '',
      `课程注入密度 ×${v.curriculumGravity.injectionDensityBoost.toFixed(1)}`,
      v.gravityGapIndex.wormholeRequired ? '⚡ 建议激活虫洞时空折叠' : '',
      `画布前方需排入 ${cells.length} 个冲刺细胞`,
    ].filter(Boolean).join('\n');
  }
}

function slugify(s: string): string {
  return s.replace(/\s+/g, '-').slice(0, 20).toLowerCase();
}

let globalAligner: WuxianDualSchoolAligner | null = null;

export function getDualSchoolAligner(): WuxianDualSchoolAligner {
  if (!globalAligner) globalAligner = new WuxianDualSchoolAligner();
  return globalAligner;
}
