/**
 * WUXIAN · 日常痕迹生命化引擎
 * 三大触角：随堂作业情绪 · 阶段期末重力 · 同学圈层生态
 */

import { getEvolutionaryEngine } from './evolutionary-engine';
import { getDualSchoolAligner } from './dual-school-aligner';
import { getSemanticRouter } from './public-course-auditor';
import { getCognitiveTwinEngine, type TwinSyncReport } from './cognitive-twin-engine';
import type { DigitalOrganism } from './evolutionary-engine';
import type { WormholeVelocityReport } from './dual-school-aligner';

export type TraceKind = 'homework' | 'exam_final' | 'ecosystem';

export interface HomeworkTracePayload {
  erasureCount: number;
  hesitationFriction: number;
  problemLaTeX: string;
  problemIndex: number;
}

export interface ExamTracePayload {
  logicDensity: number;
  gpaInflationRate: number;
  classAvgGpa: number;
  latexMatrix: string[];
}

export interface EcosystemTracePayload {
  ivyRate: number;
  usHighSchoolPlacement: number;
  tuitionTier: string;
  peerProfile: string;
}

export interface DailyTraceInput {
  schoolName: string;
  assetTitle: string;
  assetPointer?: string;
  traceKind: TraceKind;
  studentId?: string;
  targetSchoolName?: string;
  homework?: HomeworkTracePayload;
  exam?: ExamTracePayload;
  ecosystem?: EcosystemTracePayload;
}

export interface AnxietySmoothingCell {
  knowledgeTag: string;
  coursePointer: string;
  wormholeScore: number;
  message: string;
}

export interface TraceGenesisReport {
  traceId: string;
  organism: DigitalOrganism;
  traceKind: TraceKind;
  homeworkAnalysis?: {
    frictionField: number;
    distortionLevel: 'calm' | 'anxious' | 'tortured';
    erasureCount: number;
    smoothingCells: AnxietySmoothingCell[];
  };
  examAnalysis?: {
    logicDensity: number;
    gpaInflationRate: number;
    falseProsperity: boolean;
    gravityMatrix: string[];
    plannerAlert: string | null;
  };
  ecosystemAnalysis?: {
    vitalityClass: 'spring' | 'neutral' | 'mud';
    saasExpansionValue: number;
    peerSummary: string;
  };
  dualAlignment?: WormholeVelocityReport;
  wormholeVelocity: number;
  mutationRate: number;
  capacityLabel: string;
  evolutionLog: string[];
  twinReport?: TwinSyncReport;
  storageBytes: 0;
}

export class WuxianDailyTraceEngine {

  genesis(input: DailyTraceInput): TraceGenesisReport {
    const traceId = `trace-${Date.now().toString(36)}`;
    const evolutionLog: string[] = [];
    const engine = getEvolutionaryEngine();

    evolutionLog.push(`[OpenClaw 激活] 检测到就读校日常资产: ${input.assetTitle}`);

    let homeworkAnalysis: TraceGenesisReport['homeworkAnalysis'];
    let examAnalysis: TraceGenesisReport['examAnalysis'];
    let ecosystemAnalysis: TraceGenesisReport['ecosystemAnalysis'];

    const hw = input.homework ?? this.defaultHomework();
    const ex = input.exam ?? this.defaultExam();
    const eco = input.ecosystem ?? this.defaultEcosystem();

    if (input.traceKind === 'homework' || input.traceKind === 'exam_final') {
      homeworkAnalysis = this.analyzeHomework(hw, input.schoolName);
      evolutionLog.push(
        `[触角①] 笔迹墨度摩擦力 ${homeworkAnalysis.frictionField.toFixed(2)} · 涂改 ${homeworkAnalysis.erasureCount} 次 · ${homeworkAnalysis.distortionLevel}`,
      );
    }

    if (input.traceKind === 'exam_final') {
      examAnalysis = this.analyzeExamGravity(ex, input.schoolName);
      evolutionLog.push(
        `[触角②] 考点引力矩阵密度 ${examAnalysis.logicDensity.toFixed(2)} · 给分通胀 ${(examAnalysis.gpaInflationRate * 100).toFixed(0)}%`,
      );
      if (examAnalysis.plannerAlert) evolutionLog.push(`[规划师预警] ${examAnalysis.plannerAlert}`);
    }

    if (input.traceKind === 'ecosystem' || input.traceKind === 'exam_final') {
      ecosystemAnalysis = this.analyzeEcosystem(eco);
      evolutionLog.push(`[触角③] 圈层生命力: ${ecosystemAnalysis.vitalityClass} · SaaS ${(ecosystemAnalysis.saasExpansionValue * 100).toFixed(0)}%`);
    }

    const formulas = [
      ...ex.latexMatrix,
      hw.problemLaTeX,
      '$$\\mathbf{x}_{k+1} = A \\mathbf{x}_k + B \\mathbf{u}_k$$',
    ].filter(Boolean);

    const density = ex.logicDensity;
    const organism = engine.birthExamOrganism(
      'exam_current',
      `${input.schoolName} · ${input.assetTitle}`,
      formulas,
      input.assetPointer ?? `trace://${traceId}`,
      density,
    );

    const interact = engine.interact({
      studentId: input.studentId ?? 'planner-ingest',
      entityId: organism.entityId,
      timeSpentSeconds: hw.hesitationFriction * 10,
      cognitiveResonance: hw.erasureCount >= 3 ? 'Stuck' : 'Smooth',
      handwrittenTraceComplexity: hw.hesitationFriction,
      laTeXTrace: hw.problemLaTeX,
      problemIndex: hw.problemIndex,
    });

    const evolved = interact.organism;
    evolutionLog.push(`[生命化] 试卷生命体苏醒 · 第 ${evolved.lifeGeneration} 代 · 适应度 ${evolved.fitnessScore.toFixed(3)}`);

    if (interact.mutationType === 'defensive_split') {
      evolutionLog.push('[OpenClaw 进化] 防御性突变！衍生 v2 代自适应子代细胞');
    }

    let dualAlignment: WormholeVelocityReport | undefined;
    if (input.targetSchoolName) {
      const aligner = getDualSchoolAligner();
      dualAlignment = aligner.alignDualSchoolValue({
        currentSchool: {
          name: input.schoolName,
          examPapers: ex.latexMatrix,
          gpaDistribution: `通胀率 ${(ex.gpaInflationRate * 100).toFixed(0)}%`,
          ivyRate: eco.ivyRate * 0.5,
        },
        targetSchool: { name: input.targetSchoolName },
        studentId: input.studentId,
      });
      evolutionLog.push(
        `[双端对齐] 重力断层 ${(dualAlignment.gravityGapScore * 100).toFixed(0)}% · 虫洞 ${dualAlignment.valueDimensions.gravityGapIndex.wormholeRequired ? '已激活' : '待命'}`,
      );
    }

    const wormholeVelocity = dualAlignment
      ? 1.5 + dualAlignment.gravityGapScore * 3
      : evolved.wormholeVal * 2;
    const mutationRate = Math.min(0.99, evolved.lifeGeneration * 0.3 + (homeworkAnalysis?.erasureCount ?? 0) * 0.1);

    const twinEngine = getCognitiveTwinEngine();
    const twinReport = twinEngine.synchronize({
      studentId: input.studentId ?? 'planner-ingest',
      displayName: input.schoolName,
      laTeXTrace: hw.problemLaTeX,
      hesitationMs: Math.round(hw.hesitationFriction * 600),
      frictionCoefficient: hw.hesitationFriction,
      erasureRate: hw.erasureCount * 0.1,
      currentSchool: input.schoolName,
      targetSchool: input.targetSchoolName,
      fatigueLevel: homeworkAnalysis?.distortionLevel === 'tortured' ? 0.85 : 0.3,
    });
    evolutionLog.push(
      `[孪生喂养] 认知孪生体第 ${twinReport.twin.generation} 代 · 暗中对抗 ${twinReport.twin.simulatedCombats.toLocaleString()} 次`,
    );
    if (twinReport.twin.vitality === 'depleted') {
      evolutionLog.push(`[配速调控] 能量干瘪 · 课件灌注 ×${twinReport.twin.injectionPaceMultiplier.toFixed(2)}`);
    }

    return {
      traceId,
      organism: evolved,
      traceKind: input.traceKind,
      homeworkAnalysis,
      examAnalysis,
      ecosystemAnalysis,
      dualAlignment,
      wormholeVelocity: +wormholeVelocity.toFixed(2),
      mutationRate: +(mutationRate * 100).toFixed(1),
      capacityLabel: evolved.fitnessScore > 0.7 ? 'EXTENDED' : 'ACTIVATED',
      evolutionLog,
      twinReport,
      storageBytes: 0,
    };
  }

  private analyzeHomework(hw: HomeworkTracePayload, _school: string) {
    const frictionField = hw.hesitationFriction + hw.erasureCount * 0.08;
    const distortionLevel: 'calm' | 'anxious' | 'tortured' =
      hw.erasureCount >= 3 ? 'tortured' : hw.erasureCount >= 1 ? 'anxious' : 'calm';

    const router = getSemanticRouter();
    const match = router.match(hw.problemLaTeX.replace(/\$/g, ''), { minWormhole: 0.4 });

    const smoothingCells: AnxietySmoothingCell[] = [{
      knowledgeTag: hw.problemLaTeX,
      coursePointer: match.matched ? match.deepLinkUrl : 'https://www.bilibili.com/video/BV1xx411c7mD?t=765',
      wormholeScore: match.matched ? match.wormholeAdaptability : 0.85,
      message: distortionLevel === 'tortured'
        ? '孕育名师视频切片细胞 · 平滑二次函数焦虑'
        : '轻量推荐公共课件片段',
    }];

    return { frictionField, distortionLevel, erasureCount: hw.erasureCount, smoothingCells };
  }

  private analyzeExamGravity(ex: ExamTracePayload, schoolName: string) {
    const falseProsperity = ex.logicDensity < 0.45 && ex.gpaInflationRate > 0.6;
    return {
      logicDensity: ex.logicDensity,
      gpaInflationRate: ex.gpaInflationRate,
      falseProsperity,
      gravityMatrix: ex.latexMatrix,
      plannerAlert: falseProsperity
        ? `${schoolName} 虚假繁荣：考题硬度 ${ex.logicDensity.toFixed(2)} 但全班 GPA 虚高 · 引力断层报告已推送规划师`
        : null,
    };
  }

  private analyzeEcosystem(eco: EcosystemTracePayload) {
    const vitalityClass: 'spring' | 'neutral' | 'mud' =
      eco.ivyRate >= 0.25 ? 'spring' : eco.ivyRate >= 0.1 ? 'neutral' : 'mud';
    return {
      vitalityClass,
      saasExpansionValue: Math.min(1, eco.ivyRate * 1.8 + eco.usHighSchoolPlacement * 0.3),
      peerSummary: eco.peerProfile || `藤校率 ${(eco.ivyRate * 100).toFixed(0)}% · ${eco.tuitionTier}`,
    };
  }

  private defaultHomework(): HomeworkTracePayload {
    return {
      erasureCount: 3,
      hesitationFriction: 0.72,
      problemLaTeX: '$$f(x) = ax^2 + bx + c$$',
      problemIndex: 3,
    };
  }

  private defaultExam(): ExamTracePayload {
    return {
      logicDensity: 0.32,
      gpaInflationRate: 0.78,
      classAvgGpa: 3.85,
      latexMatrix: ['$$ax^2+bx+c=0$$', '$$\\triangle ABC \\sim \\triangle DEF$$'],
    };
  }

  private defaultEcosystem(): EcosystemTracePayload {
    return {
      ivyRate: 0.18,
      usHighSchoolPlacement: 0.35,
      tuitionTier: '¥22万/年',
      peerProfile: '国际部圈层 · 美高走向 35%',
    };
  }
}

let globalTrace: WuxianDailyTraceEngine | null = null;

export function getDailyTraceEngine(): WuxianDailyTraceEngine {
  if (!globalTrace) globalTrace = new WuxianDailyTraceEngine();
  return globalTrace;
}
