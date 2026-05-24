/**
 * WUXIAN 3.0 · 航标指标精算与动态时间线引擎
 * 锁定学校 → 拆解指标 → 精算差距 → 定制节点
 */

import { resolveUserLlm } from './deepseek-client';
import { detectSchoolPathway, filterMetricsForPathway, mergeMetricsForPathway } from './school-pathway';
import { matchSchoolIntel } from './school-anchor-brief';
import { WARP_COST } from './billing-hub';
import { gatewayJsonCompletion } from './llm-gateway';
import {
  upsertSchoolTargetMetrics,
  type TimelineMilestone,
  type SchoolMatrixView,
} from '../db/school-matrix';
import { initializeReversingMatrixSystem, upsertReversingMatrix } from '../db/milestone-schema';
import { getLearningDb } from '../../server/wuxian-learning-db';

export interface CompileMetricsInput {
  userId: string;
  targetSchool: string;
  currentBaseline: Record<string, unknown>;
  daysToDeadline?: number;
}

export interface CompileMetricsOutput {
  requiredMetrics: Record<string, unknown>;
  gapDetails: string[];
  challengeIndex: number;
  timelineMilestones: TimelineMilestone[];
  targetSchool: string;
  activePhase: string | null;
}

function systemPromptForPathway(pathway: ReturnType<typeof detectSchoolPathway>): string {
  if (pathway === 'domestic_cn') {
    return `你是中国顶尖高校本科升学规划专家（高考统招/强基/竞赛）。
根据目标院校与现状，返回 JSON：
1. requiredMetrics：仅用国内键，如 高考总分、数学、物理、英语、信息学、竞赛/强基 等。禁止出现 TOEFL、SAT、GPA、AP、Common App。
2. gapDetails：核心差距（中文短句数组）
3. challengeIndex：1-100
4. timelineMilestones：phase、deadline(YYYY-MM-DD)、action
严格 JSON，无 markdown。`;
  }
  return `你是美本/国际本科升学规划专家。
根据目标学校与现状返回 JSON：requiredMetrics（TOEFL/SAT/GPA/AP 等）、gapDetails、challengeIndex、timelineMilestones。
严格 JSON，无 markdown。`;
}

function clampChallenge(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 55;
  return Math.max(1, Math.min(100, Math.round(x)));
}

function parseModelJson(content: string): CompileMetricsOutput | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    const milestones = Array.isArray(raw.timelineMilestones)
      ? (raw.timelineMilestones as TimelineMilestone[]).filter((m) => m?.phase && m?.deadline)
      : [];
    return {
      requiredMetrics:
        raw.requiredMetrics && typeof raw.requiredMetrics === 'object'
          ? (raw.requiredMetrics as Record<string, unknown>)
          : {},
      gapDetails: Array.isArray(raw.gapDetails)
        ? (raw.gapDetails as unknown[]).map(String).filter(Boolean)
        : [],
      challengeIndex: clampChallenge(raw.challengeIndex),
      timelineMilestones: milestones,
      targetSchool: '',
      activePhase: milestones[0]?.phase ?? null,
    };
  } catch {
    return null;
  }
}

function heuristicCompile(input: CompileMetricsInput): CompileMetricsOutput {
  const school = input.targetSchool.trim();
  const baseline = input.currentBaseline ?? {};
  const parts = school.split('·').map((s) => s.trim());
  const pathway = detectSchoolPathway(
    String(baseline.school ?? parts[0] ?? school),
    String(baseline.major ?? parts[1] ?? ''),
    {
      currentSchool: String(baseline.currentSchool ?? ''),
      currentRegion: String(baseline.currentRegion ?? ''),
      targetSchoolRegion: String(baseline.targetSchoolRegion ?? ''),
      currentGrade: String(baseline.grade ?? baseline.currentGrade ?? ''),
    },
  );

  if (pathway === 'domestic_cn') {
    const math = Number(baseline.数学 ?? baseline.Math ?? baseline.math ?? 0);
    const physics = Number(baseline.物理 ?? baseline.Physics ?? 0);
    const english = Number(baseline.英语 ?? baseline.English ?? 0);
    const gaokao = Number(baseline.高考 ?? baseline.Gaokao ?? baseline.总分 ?? 0);
    const csp = Number(baseline.CSP ?? baseline.NOI ?? baseline.OI ?? baseline.信息学 ?? 0);

    const requiredMetrics: Record<string, unknown> = {
      高考总分: school.includes('清华') || school.includes('北大') ? '690+' : '650+',
      数学: '145+ 或 竞赛省一+',
      物理: '90+',
      英语: '140+',
      信息学: 'CSP-S / NOI 省一+ 或同等成果',
      强基综评: '与当年简章对齐的竞赛组合',
    };

    const gapDetails: string[] = [];
    if (gaokao > 0 && gaokao < 680) {
      gapDetails.push(`高考总分估算尚距梦校线有差距，需按省份划线逆向拆解月度增量`);
    }
    if (math > 0 && math < 140) {
      gapDetails.push('数学得分或竞赛层级需拉升，建议同步错题本与限时模考');
    }
    if (physics > 0 && physics < 85) {
      gapDetails.push('物理模型与计算稳定性不足，需专项突破力学/电磁高频题型');
    }
    if (csp < 1) {
      gapDetails.push('信息学/CSP 硬核成果尚未建立，计科方向建议尽快启动竞赛轨或项目证据链');
    }
    if (gapDetails.length === 0) {
      gapDetails.push('学业基础尚可，需强化强基/竞赛材料与专业课因果链一致性');
    }

    const challengeIndex = clampChallenge(
      42 + gapDetails.length * 11 + (school.includes('清华') ? 18 : 10),
    );
    const days = Math.max(30, input.daysToDeadline ?? 180);
    const now = new Date();
    const m1 = new Date(now.getTime() + (days * 0.33) * 86400000);
    const m2 = new Date(now.getTime() + (days * 0.66) * 86400000);
    const m3 = new Date(now.getTime() + days * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const timelineMilestones: TimelineMilestone[] = [
      {
        phase: 'T1 // 高考学科阵地',
        deadline: fmt(m1),
        action: '数学/物理/英语按清华计科对标线建立周节奏与错题闭环',
      },
      {
        phase: 'T2 // 竞赛与强基材料',
        deadline: fmt(m2),
        action: '信息学/CSP 或等效竞赛成果 + 强基/综评材料包对齐',
      },
      {
        phase: 'T3 // 冲刺与志愿策略',
        deadline: fmt(m3),
        action: '模考清算、志愿与复试/校测预案（按当年政策）',
      },
    ];
    return {
      requiredMetrics,
      gapDetails,
      challengeIndex,
      timelineMilestones,
      targetSchool: school,
      activePhase: timelineMilestones[0]?.phase ?? null,
    };
  }

  const toefl = Number(baseline.TOEFL ?? baseline.toefl ?? 0);
  const sat = Number(baseline.SAT ?? baseline.sat ?? 0);
  const ap = Number(baseline.AP_Count ?? baseline.AP ?? 0);

  const requiredMetrics: Record<string, unknown> = {
    TOEFL: school.match(/CMU|Stanford|MIT|Ivy/i) ? 110 : 100,
    SAT: school.match(/CMU|Stanford|MIT/i) ? 1520 : 1450,
    GPA: '3.8+',
    AP: '4-6 门 4 分以上',
  };

  const gapDetails: string[] = [];
  if (toefl > 0 && toefl < Number(requiredMetrics.TOEFL)) {
    gapDetails.push(`托福尚差约 ${Number(requiredMetrics.TOEFL) - toefl} 分，听力和学术写作需专项突破`);
  }
  if (sat > 0 && sat < Number(requiredMetrics.SAT)) {
    gapDetails.push(`SAT 现存差距约 ${Number(requiredMetrics.SAT) - sat} 分，数学需追求接近满分`);
  }
  if (ap < 3) {
    gapDetails.push('AP 门数与分数尚未达到梦校竞争带，需逆向重组高阶学科认知节点');
  }
  if (gapDetails.length === 0) {
    gapDetails.push('标化基础尚可，需强化竞赛/科研叙事与专业课因果链深度');
  }

  const challengeIndex = clampChallenge(
    40 + gapDetails.length * 12 + (school.length > 12 ? 15 : 8) + (toefl < 95 ? 20 : 0),
  );

  const days = Math.max(30, input.daysToDeadline ?? 180);
  const now = new Date();
  const m1 = new Date(now.getTime() + (days * 0.33) * 86400000);
  const m2 = new Date(now.getTime() + (days * 0.66) * 86400000);
  const m3 = new Date(now.getTime() + days * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const timelineMilestones: TimelineMilestone[] = [
    {
      phase: 'T1 // 基础阵地重组',
      deadline: fmt(m1),
      action: '强行打通语言与核心学科弱项节点，建立每日逆向撞击节奏',
    },
    {
      phase: 'T2 // 标化核心破局',
      deadline: fmt(m2),
      action: '在 Warp 中继算力支持下，刷穿标化高难真题库并锁定错题拓扑',
    },
    {
      phase: 'T3 // 终极因果合流',
      deadline: fmt(m3),
      action: '完成文书与活动叙事图谱，锁死梦校冲刺全部分母节点',
    },
  ];

  return {
    requiredMetrics,
    gapDetails,
    challengeIndex,
    timelineMilestones,
    targetSchool: school,
    activePhase: timelineMilestones[0]?.phase ?? null,
  };
}

function syncReversingMatrix(userId: string, output: CompileMetricsOutput, daysToDeadline: number): void {
  initializeReversingMatrixSystem();
  const now = Math.floor(Date.now() / 1000);
  const deadlineTimestamp = now + daysToDeadline * 86400;
  const totalUnits = 100;
  const completedUnits = Math.max(1, Math.min(totalUnits - 1, Math.round((100 - output.challengeIndex) * 0.4)));

  upsertReversingMatrix({
    userId,
    targetDestination: output.targetSchool,
    baselineScore: 100 - output.challengeIndex,
    deadlineTimestamp,
    totalUnits,
    completedUnits,
  });

  const db = getLearningDb();
  db.prepare(`
    UPDATE goal_reversing_matrix SET difficulty_index = ? WHERE user_id = ?
  `).run(output.challengeIndex, userId);
}

export class SchoolMetricsCompiler {
  /**
   * 依据学校目标，解码门槛、计算差距并定制高压自学时间线
   */
  static async compileGoalAndPlan(input: CompileMetricsInput): Promise<SchoolMatrixView> {
    const userId = input.userId.trim();
    const targetSchool = input.targetSchool.trim();
    if (!userId || !targetSchool) {
      throw new Error('缺少 userId 或 targetSchool');
    }

    const daysToDeadline = Math.max(30, Math.min(1095, input.daysToDeadline ?? 180));
    const baseline = input.currentBaseline ?? {};
    const pathway = detectSchoolPathway(targetSchool, String(baseline.major ?? ''), {
      currentSchool: String(baseline.currentSchool ?? ''),
      currentRegion: String(baseline.currentRegion ?? ''),
      targetSchoolRegion: String(baseline.targetSchoolRegion ?? ''),
    });
    const intel = matchSchoolIntel(
      String(baseline.school ?? targetSchool.split('·')[0]?.trim() ?? targetSchool),
      String(baseline.major ?? targetSchool.split('·')[1]?.trim() ?? ''),
    );
    let output: CompileMetricsOutput;

    if (resolveUserLlm(userId) || process.env.DEEPSEEK_API_KEY?.trim()) {
      const gw = await gatewayJsonCompletion<CompileMetricsOutput>(userId, [
        { role: 'system', content: systemPromptForPathway(pathway) },
        {
          role: 'user',
          content: `【目标学校】: ${targetSchool}\n【升学路径】: ${pathway}\n【用户现状】: ${JSON.stringify(baseline)}\n【备考天数】: ${daysToDeadline}`,
        },
      ], {
        traceId: `metrics_compile_${userId}`,
        maxTokens: 1200,
        flatWarp: { cost: WARP_COST.METRICS_COMPILE, reason: 'METRICS_COMPILE' },
      });

      if (!gw.chargeOk) {
        output = heuristicCompile({ ...input, daysToDeadline });
      } else if (gw.data) {
        output = gw.data;
        output.targetSchool = targetSchool;
        output.requiredMetrics = mergeMetricsForPathway(
          intel.requiredMetrics,
          output.requiredMetrics,
          pathway,
        );
        output.gapDetails = output.gapDetails.filter(
          (g) => pathway !== 'domestic_cn' || !/托福|SAT|AP|GPA|Common/i.test(g),
        );
      } else {
        if (gw.usedFallback) console.warn('[MetricsCompiler] LLM 降级为启发式精算:', gw.error);
        output = heuristicCompile({ ...input, daysToDeadline });
      }
    } else {
      output = heuristicCompile({ ...input, daysToDeadline });
      output.requiredMetrics = mergeMetricsForPathway(intel.requiredMetrics, output.requiredMetrics, pathway);
    }

    syncReversingMatrix(userId, output, daysToDeadline);

    return upsertSchoolTargetMetrics({
      userId,
      targetSchool,
      requiredMetrics: filterMetricsForPathway(output.requiredMetrics, pathway),
      currentBaseline: input.currentBaseline,
      gapDetails: output.gapDetails,
      challengeIndex: output.challengeIndex,
      timelineMilestones: output.timelineMilestones,
      activePhase: output.activePhase,
    });
  }
}
