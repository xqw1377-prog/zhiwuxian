/**
 * 梦校航标 · 院校+专业情报包与倒计时进度表（唤醒时生成，问答时直出）
 */

import {
  getMentorPlanView,
  getSchoolMatrixView,
  type DynamicMilestone,
  type MentorPlanView,
  type SchoolMatrixView,
  type TimelineMilestone,
} from '../db/school-matrix';
import { getSchoolAnchorProfile, type SchoolAnchorProfile } from '../db/zhi-cloud-schema';
import {
  hasUserBaselinePhotos,
  normalizeGapDetails,
  ZHI_BASELINE_PHOTO_INVITE_BLOCK,
  ZHI_BASELINE_PHOTO_INVITE_SHORT,
} from './zhi-baseline-invite';
import {
  detectSchoolPathway,
  filterMetricsForPathway,
  mergeMetricsForPathway,
  normalizeAnchorMajorName,
  normalizeAnchorSchoolName,
  PATHWAY_LABEL,
  type SchoolPathway,
} from './school-pathway';

export type SchoolIntelPack = {
  schoolLabel: string;
  majorLabel: string;
  admissionFacts: string[];
  requiredMetrics: Record<string, string>;
  dataNote: string;
};

const CMU_CS: SchoolIntelPack = {
  schoolLabel: '卡内基梅隆大学',
  majorLabel: '计算机（SCS）',
  admissionFacts: [
    '全校本科录取率近年约 11%–14%，SCS 计算机显著低于全校均值（竞争最激烈梯队）',
    '国际生约占本科新生 15%–20%（公开区间，每年波动）',
    '中国籍本科国际生约占国际生池 15%–22%；全届估算约 80–120 人（含 CS 相关分流，非官方精确值）',
    '录取偏好：数学与算法证据链、可验证项目/竞赛、叙事一致性；纯分数堆叠不足以通关',
    '典型轮次：ED/EA 11 月初 · RD 1 月初（以当年官网为准）',
  ],
  requiredMetrics: {
    托福: '102+（单项建议 ≥23）',
    SAT: '1520+ 或 ACT 34+',
    GPA: '3.9+/4.0 或年级 Top 5%',
    AP: 'Calculus BC + 至少 2 门 STEM 4/5',
    算法与项目: 'CSP/USACO/科研/开源至少一项可追问的深度成果',
    文书与活动: '主线单一、可量化、与 CS 因果链一致',
  },
  dataNote: '招生人数为公开资料与历年区间估算，仅供战略对标；申请前以 CMU/SCS 官网当年 Common Data Set 为准。',
};

const TSINGHUA_CS: SchoolIntelPack = {
  schoolLabel: '清华大学',
  majorLabel: '计算机',
  admissionFacts: [
    '本科录取率极低，计算机类（计科/姚班/未央等方向）竞争为全国最激烈梯队之一',
    '主流路径：高考统招 / 强基计划 / 学科竞赛保送或降分（信息学、数学等）',
    '计算机方向极重：数学、物理、信息学竞赛或 CSP 等高阶证据，而非 AP/托福体系',
    '综合评价看三年学业稳定性、竞赛层级、科研/项目深度与专业志向一致性',
  ],
  requiredMetrics: {
    高考总分: '690+（视省份划线，仅供参考）',
    数学: '145+ 或 竞赛省一+/国赛奖项',
    物理: '90+ 或 竞赛相应层级',
    英语: '140+',
    信息学: 'CSP-S 提高级 / NOI 省一+ 或同等硬核成果',
    强基综评: '与清华当年简章对齐的竞赛/学业组合',
  },
  dataNote: '以上为战略对标区间；请以清华大学本科招生网及当年强基/竞赛政策为准。',
};

const GENERIC_TOP_CS: SchoolIntelPack = {
  schoolLabel: '顶尖 CS 项目',
  majorLabel: '计算机',
  admissionFacts: [
    '录取率通常低于 15%，国际生竞争高于本国平均',
    '中国籍申请者需用标化+专业课深度+项目证据链证明「可教且可成才」',
  ],
  requiredMetrics: {
    托福: '100–110+',
    SAT: '1480–1540+',
    GPA: '3.8+/4.0',
    AP: '微积分 BC + 物理/CS 相关 4/5',
    项目: '可验证的编程/竞赛/科研深度',
  },
  dataNote: '以下为战略对标区间，请同步查阅目标校当年官方 Common Data Set。',
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function matchSchoolIntel(school: string, major: string): SchoolIntelPack {
  const s = normalize(school);
  const m = normalize(major);
  const isTsinghua =
    s.includes('清华') || s.includes('tsinghua') || s.includes('thu');
  const isCsMajor =
    m.includes('计算机') || m.includes('computer') || m.includes('cs') || m.includes('软件');
  if (isTsinghua) {
    return {
      ...TSINGHUA_CS,
      schoolLabel: school.trim() || TSINGHUA_CS.schoolLabel,
      majorLabel: major.trim() || TSINGHUA_CS.majorLabel,
      admissionFacts: isCsMajor
        ? TSINGHUA_CS.admissionFacts
        : [
            ...TSINGHUA_CS.admissionFacts.slice(0, 3),
            `你锁定的专业方向：${major.trim() || '待细化'}，请以清华该院系当年招生简章为准。`,
          ],
    };
  }
  const isCmu =
    s.includes('cmu') ||
    s.includes('carnegie') ||
    s.includes('卡内基') ||
    s.includes('卡耐基') ||
    s.includes('卡梅');
  const isCs = m.includes('计算机') || m.includes('computer') || m.includes('cs') || m.includes('scs');
  if (isCmu && isCs) {
    return { ...CMU_CS, schoolLabel: school.trim() || CMU_CS.schoolLabel, majorLabel: major.trim() || CMU_CS.majorLabel };
  }
  if (isCmu) {
    return {
      ...CMU_CS,
      schoolLabel: school.trim(),
      majorLabel: major.trim() || '目标专业',
      admissionFacts: [
        ...CMU_CS.admissionFacts.slice(0, 3),
        `你锁定的专业方向：${major.trim() || '待细化'}，请以该院系官网录取画像为准。`,
      ],
    };
  }
  return {
    ...GENERIC_TOP_CS,
    schoolLabel: school.trim() || '目标院校',
    majorLabel: major.trim() || '目标专业',
  };
}

export function daysUntilApply(targetApplyAt: string): number {
  const raw = targetApplyAt.trim();
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  const target = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, 1)
    : new Date(raw);
  if (Number.isNaN(target.getTime())) return 365;
  const now = new Date();
  return Math.max(30, Math.ceil((target.getTime() - now.getTime()) / 86400000));
}

export function buildTimelineFromApply(
  targetApplyAt: string,
  currentGrade: string,
  opts?: { pathway?: import('./school-pathway').SchoolPathway },
): TimelineMilestone[] {
  const days = daysUntilApply(targetApplyAt);
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const enroll = /^(\d{4})-(\d{2})$/.exec(targetApplyAt.trim());
  const enrollLabel = enroll ? `${enroll[1]}年${Number(enroll[2])}月入学` : targetApplyAt;
  const domestic = opts?.pathway === 'domestic_cn';

  const ratios = domestic ? [0.15, 0.35, 0.55, 0.75, 0.9] : [0.2, 0.45, 0.7, 0.88];
  const labels = domestic
    ? [
        { phase: `P0 // 现状验收（${currentGrade}）`, action: '主动评估+错题拓扑，建立省情基线' },
        { phase: 'P1 // 章节筑基', action: '教材/新课标章节闭环+章节验收卷' },
        { phase: 'P2 // 专题突破', action: '弱项专题限时练+专题评估≥75%' },
        { phase: 'P3 // 限时模考链', action: '省卷全真/半真模考+涂卡节奏' },
        { phase: `P4 // 冲刺合流 · ${enrollLabel}`, action: '错题清零+志愿/强基材料对齐梦校线' },
      ]
    : [
        { phase: `T1 // 底盘重组（${currentGrade}）`, action: '标化+专业课拉到梦校竞争带' },
        { phase: 'T2 // 标化/国际课程节点', action: '托福/SAT/AP 模考达阶段线' },
        { phase: 'T3 // 叙事与材料', action: '活动+文书因果链可追问' },
        { phase: `T4 // 申请合流`, action: `对齐 ${enrollLabel} 提交节点` },
      ];

  return labels.map((l, i) => ({
    phase: l.phase,
    deadline: fmt(new Date(now.getTime() + Math.round(days * (ratios[i] ?? 0.9)) * 86400000)),
    action: l.action,
  }));
}

export function milestonesToDynamic(
  timeline: TimelineMilestone[],
  challengeIndex: number,
): DynamicMilestone[] {
  return timeline.map((t, i) => ({
    codeName: t.phase,
    deadline: t.deadline,
    mission: t.action,
    mentorWhisper: i === 0 ? '从这一刻起，每一天都在和分母赛跑。' : '别拖，节点过期就是崩盘。',
    status: i === 0 ? ('IN_PROGRESS' as const) : ('LOCKED' as const),
  }));
}

export type AnchorBriefPayload = {
  intel: SchoolIntelPack;
  daysRemaining: number;
  targetApplyAt: string;
  challengeIndex: number;
  requiredMetrics: Record<string, unknown>;
  gapDetails: string[];
  timelineMilestones: TimelineMilestone[];
  dynamicMilestones: DynamicMilestone[];
  mentorWakeUpCall: string;
  chatText: string;
  pathway: SchoolPathway;
  pathwayLabel: string;
};

export function formatAnchorBriefChat(
  payload: AnchorBriefPayload,
  opts?: { userId?: string },
): string {
  const { intel, daysRemaining, challengeIndex, requiredMetrics, gapDetails, timelineMilestones, dynamicMilestones, mentorWakeUpCall, targetApplyAt } = payload;

  const metricsLines = Object.entries(requiredMetrics)
    .map(([k, v]) => `  · ${k}：${String(v)}`)
    .join('\n');

  const intelLines = intel.admissionFacts.map((f) => `  · ${f}`).join('\n');

  const gapLines = gapDetails.length
    ? gapDetails.map((g) => `  · ${g}`).join('\n')
    : '  · 尚未收到你的试卷/教材建档，差距为战略区间估算（见文末拍照指引）';

  const tableRows = dynamicMilestones.length
    ? dynamicMilestones
    : milestonesToDynamic(timelineMilestones, challengeIndex);

  const countdownLines = tableRows
    .map((m) => {
      const status =
        m.status === 'IN_PROGRESS' ? '▶ 进行中' : m.status === 'COMPLETED' ? '✓ 已完成' : '○ 待解锁';
      return `  ${status}  ${m.deadline}  ${m.codeName}\n      → ${m.mission}`;
    })
    .join('\n');

  const showBaselineInvite = !opts?.userId || !hasUserBaselinePhotos(opts.userId);
  const baselineBlock = showBaselineInvite ? ['', ZHI_BASELINE_PHOTO_INVITE_BLOCK] : [];

  return [
    mentorWakeUpCall,
    '',
    `【${intel.schoolLabel} · ${intel.majorLabel} · 招生情报】`,
    intelLines,
    '',
    `【你需要达成的硬指标】（命运阻力 ${challengeIndex}%）`,
    metricsLines,
    '',
    '【当前差距预判】',
    gapLines,
    '',
    `【倒计时进度表】距 ${targetApplyAt} 入学还有 ${daysRemaining} 天`,
    countdownLines,
    ...baselineBlock,
    '',
    `📌 ${intel.dataNote}`,
  ].join('\n');
}

export function buildAnchorBriefPayload(input: {
  school: string;
  major: string;
  currentGrade: string;
  targetApplyAt: string;
  challengeIndex?: number;
  gapDetails?: string[];
}): AnchorBriefPayload {
  const intel = matchSchoolIntel(input.school, input.major);
  const daysRemaining = daysUntilApply(input.targetApplyAt);
  const timelineMilestones = buildTimelineFromApply(input.targetApplyAt, input.currentGrade);
  const challengeIndex = input.challengeIndex ?? Math.min(92, 58 + Math.round(daysRemaining / 45));
  const requiredMetrics: Record<string, unknown> = { ...intel.requiredMetrics };
  const pathway = detectSchoolPathway(input.school, input.major);
  const gapDetails =
    input.gapDetails ??
    (pathway === 'domestic_cn'
      ? [
          `距 ${input.targetApplyAt} 入学，需按高考/强基/竞赛节奏拆解数学、物理与信息学节点`,
          '计科方向建议尽早建立 CSP/竞赛或等效成果链',
        ]
      : [
          `距 ${input.targetApplyAt} 入学时间窗偏紧，需按周拆解标化与专业课节点`,
          '申请者池竞争激烈，叙事与成果必须可验证、可追问',
        ]);
  const dynamicMilestones = milestonesToDynamic(timelineMilestones, challengeIndex);
  const mentorWakeUpCall = `曦宝，航标已锁死【${input.school} · ${input.major}】。下面是招生画像、硬指标与倒推进度表。想让我更快对准你的真差距，把各科试卷和教材进度拍给我（见文末）。`;

  const payload: AnchorBriefPayload = {
    intel,
    daysRemaining,
    targetApplyAt: input.targetApplyAt,
    challengeIndex,
    requiredMetrics: mergeMetricsForPathway(intel.requiredMetrics, requiredMetrics, pathway),
    gapDetails,
    timelineMilestones,
    dynamicMilestones,
    mentorWakeUpCall,
    chatText: '',
    pathway,
    pathwayLabel: PATHWAY_LABEL[pathway],
  };
  payload.chatText = formatAnchorBriefChat(payload);
  return payload;
}

export function finalizeAnchorBriefChat(payload: AnchorBriefPayload, userId?: string): void {
  payload.chatText = formatAnchorBriefChat(payload, { userId });
}

export function isSchoolIntelQuery(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  return /招生|录取|录取率|多少人|中国人|国际生|门槛|指标|标化|托福|SAT|GPA|申[\s\S]*要求|需要.*什么|查人数|官网/.test(t);
}

function anchorTargetLabel(school: string, major: string): string {
  return `${normalizeAnchorSchoolName(school)} · ${normalizeAnchorMajorName(major)}`;
}

function isAnchorPlanStale(
  anchor: SchoolAnchorProfile,
  matrix: SchoolMatrixView | null,
  pathway: SchoolPathway,
): boolean {
  const schoolKey = normalizeAnchorSchoolName(anchor.school);
  const blob = `${matrix?.targetSchool ?? ''}`;
  if (blob && !blob.includes(schoolKey)) return true;
  if (pathway !== 'domestic_cn' || !matrix) return false;
  const metricKeys = Object.keys(matrix.requiredMetrics ?? {});
  if (metricKeys.some((k) => /TOEFL|SAT|托福|AP\b|GPA|Common/i.test(k))) return true;
  if ((matrix.gapDetails ?? []).some((g) => /托福|SAT|AP|标化|CMU|美本|国际课程/i.test(g))) return true;
  return false;
}

export function loadAnchorBriefForUser(userId: string): AnchorBriefPayload | null {
  const anchor = getSchoolAnchorProfile(userId);
  if (!anchor?.school) return null;

  const plan = getMentorPlanView(userId);
  const matrix = getSchoolMatrixView(userId);
  const intel = matchSchoolIntel(anchor.school, anchor.major);
  const pathway = detectSchoolPathway(anchor.school, anchor.major, {
    currentSchool: anchor.currentSchool,
    currentRegion: anchor.currentRegion,
    targetSchoolRegion: anchor.targetSchoolRegion,
    currentGrade: anchor.currentGrade,
  });

  if (plan || matrix) {
    const timeline =
      matrix?.timelineMilestones?.length
        ? matrix.timelineMilestones
        : buildTimelineFromApply(anchor.targetApplyAt, anchor.currentGrade);
    const dynamic =
      plan?.dynamicMilestones?.length
        ? plan.dynamicMilestones
        : milestonesToDynamic(timeline, plan?.challengeIndex ?? matrix?.challengeIndex ?? 70);

    let gapDetails = normalizeGapDetails(
      matrix?.gapDetails?.length
        ? matrix.gapDetails
        : plan?.causalityGaps?.map((g) => g.causalityEffect) ?? [],
    );
    let requiredMetrics = mergeMetricsForPathway(
      intel.requiredMetrics,
      (matrix?.requiredMetrics ?? {}) as Record<string, unknown>,
      pathway,
    );
    if (isAnchorPlanStale(anchor, matrix, pathway)) {
      gapDetails = gapDetails.filter(
        (g) => pathway !== 'domestic_cn' || !/托福|SAT|AP|CMU|标化|美本|国际课程/i.test(g),
      );
      if (gapDetails.length === 0 && pathway === 'domestic_cn') {
        gapDetails = [
          '备考窗口需按高考/强基/竞赛节奏拆解数学、物理与信息学节点',
          `现就读信息将用于对齐${anchorTargetLabel(anchor.school, anchor.major)}录取线差距`,
        ];
      }
      requiredMetrics = filterMetricsForPathway(requiredMetrics, pathway);
      if (Object.keys(requiredMetrics).length === 0 && pathway === 'domestic_cn') {
        requiredMetrics = {
          高考总分: anchor.school.includes('清华') || anchor.school.includes('北大') ? '690+' : '650+',
          数学: '145+ 或 竞赛省一+',
          物理: '90+',
          英语: '140+',
          信息学: 'CSP-S / NOI 省一+ 或同等成果',
        };
      }
    }

    const payload: AnchorBriefPayload = {
      intel,
      daysRemaining: daysUntilApply(anchor.targetApplyAt),
      targetApplyAt: anchor.targetApplyAt,
      challengeIndex: plan?.challengeIndex ?? matrix?.challengeIndex ?? 70,
      requiredMetrics,
      gapDetails,
      timelineMilestones: timeline,
      dynamicMilestones: dynamic,
      mentorWakeUpCall:
        plan?.mentorWakeUpCall ??
        `曦宝，【${anchor.school} · ${anchor.major}】情报与倒计时已就绪。`,
      chatText: '',
      pathway,
      pathwayLabel: PATHWAY_LABEL[pathway],
    };
    finalizeAnchorBriefChat(payload, userId);
    return payload;
  }

  const built = buildAnchorBriefPayload({
    school: anchor.school,
    major: anchor.major,
    currentGrade: anchor.currentGrade,
    targetApplyAt: anchor.targetApplyAt,
  });
  finalizeAnchorBriefChat(built, userId);
  return built;
}

export function intrusionFromBrief(
  brief: AnchorBriefPayload,
  plan?: MentorPlanView | null,
  userId?: string,
): {
  zhiOpening: string;
  zhiTip: string;
  zhiCoachNote: string;
  activatedTool: 'METRICS_INPUT' | 'NONE';
  challengeIndex: number;
  targetSchool: string;
} {
  const targetSchool = plan?.targetSchool ?? `${brief.intel.schoolLabel} · ${brief.intel.majorLabel}`;
  const node =
    brief.dynamicMilestones.find((m) => m.status === 'IN_PROGRESS')?.codeName ??
    brief.timelineMilestones[0]?.phase ??
    'T1';
  const baselineTip =
    userId && hasUserBaselinePhotos(userId) ? '' : ` ${ZHI_BASELINE_PHOTO_INVITE_SHORT}`;
  return {
    zhiOpening: brief.chatText,
    zhiTip: `当前战役节点：${node}，今晚完成表中第一项。${baselineTip}`,
    zhiCoachNote: brief.intel.dataNote.slice(0, 120),
    activatedTool: 'METRICS_INPUT',
    challengeIndex: brief.challengeIndex,
    targetSchool,
  };
}
