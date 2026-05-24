/**
 * 梦校学习路径 · 阶段模板与知识点种子（省情 × 年级 × 课程轨）
 * 与 metrics-compiler / anchor-brief 共用稳定 phaseCode
 */

import type { CurriculumTrack } from './learner-profile';
import type { SchoolPathway } from './school-pathway';
import type { PathKnowledgeUnit, PathPhase } from '../db/learning-path-schema';

export type PathPhaseCode =
  | 'P0_BASELINE'
  | 'P1_SYLLABUS'
  | 'P2_TOPIC_DRILL'
  | 'P3_MOCK_CHAIN'
  | 'P4_SPRINT'
  | 'P5_ENROLL_ALIGN'
  | 'I0_DIAG'
  | 'I1_UNIT'
  | 'I2_STANDARDIZED'
  | 'I3_APPLICATION'
  | 'U0_STD_SLICE'
  | 'U1_MAJOR'
  | 'U2_NARRATIVE'
  | 'U3_APPLY';

export type PathPhaseTemplate = {
  code: PathPhaseCode;
  phase: string;
  goalSummary: string;
  exitCriteria: string;
  weight: number;
  seeds: Array<{ title: string; subjectId: string; subjectName: string }>;
};

export type PathTemplateContext = {
  pathway: SchoolPathway;
  curriculumTrack: CurriculumTrack;
  grade: string;
  province: string | null;
  school: string;
  major: string;
  targetApplyAt: string;
  daysRemaining: number;
};

export type CriticalDate = { date: string; label: string; phaseCode?: PathPhaseCode };

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86400000);
}

function parseApplyMonth(targetApplyAt: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(targetApplyAt.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) };
}

function isGrade2(grade: string): boolean {
  return /高二|十年级|Grade\s*10|Y10/i.test(grade);
}

function isGrade3(grade: string): boolean {
  return /高三|十一年级|Grade\s*11|Y11|Gap/i.test(grade);
}

/** 高考关键节点（相对入学年反推） */
export function buildCriticalDates(ctx: PathTemplateContext): CriticalDate[] {
  const out: CriticalDate[] = [];
  const apply = parseApplyMonth(ctx.targetApplyAt);
  const now = new Date();
  const y = apply?.y ?? now.getFullYear() + 1;

  if (ctx.curriculumTrack === 'cn_gaokao' || ctx.pathway === 'domestic_cn') {
    const gaokao = new Date(y - 1, 5, 7);
    if (gaokao.getTime() > now.getTime()) {
      out.push({ date: fmtDate(gaokao), label: '高考 · 全国统考', phaseCode: 'P4_SPRINT' });
    }
    if (isGrade2(ctx.grade)) {
      out.push({
        date: fmtDate(new Date(now.getFullYear(), 5, 15)),
        label: '高二下 · 期末定位考（省情卷）',
        phaseCode: 'P2_TOPIC_DRILL',
      });
      out.push({
        date: fmtDate(new Date(now.getFullYear(), 0, 20)),
        label: '寒假 · 专题突破窗口',
        phaseCode: 'P2_TOPIC_DRILL',
      });
    }
    if (isGrade3(ctx.grade)) {
      out.push({
        date: fmtDate(new Date(y - 1, 2, 1)),
        label: '一模 / 省市联考窗口',
        phaseCode: 'P3_MOCK_CHAIN',
      });
    }
    if (ctx.province === '湖南') {
      out.push({
        date: fmtDate(new Date(now.getFullYear(), 10, 1)),
        label: '湖南 · 学考/合格考节点（若未过）',
        phaseCode: 'P1_SYLLABUS',
      });
    }
  }

  if (ctx.curriculumTrack === 'intl_ib_ap') {
    out.push({
      date: fmtDate(new Date(now.getFullYear(), 4, 1)),
      label: 'AP 统考窗口（5月）',
      phaseCode: 'I2_STANDARDIZED',
    });
    out.push({
      date: fmtDate(new Date(y, 0, 15)),
      label: '申请文书 · 初稿截止（建议）',
      phaseCode: 'I3_APPLICATION',
    });
  }

  if (ctx.curriculumTrack === 'intl_us_uk') {
    out.push({
      date: fmtDate(new Date(now.getFullYear(), 7, 1)),
      label: '标化刷分黄金期（暑假）',
      phaseCode: 'U0_STD_SLICE',
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
}

function hunanG2Seeds(): PathPhaseTemplate['seeds'] {
  return [
    { title: '函数与导数初步（含参数讨论）', subjectId: 'math', subjectName: '数学' },
    { title: '力学综合（牛顿定律+能量）', subjectId: 'phys', subjectName: '物理' },
    { title: '阅读理解+七选五（新课标Ⅰ卷型）', subjectId: 'en', subjectName: '英语' },
    { title: '文言文+古诗鉴赏（湖南卷倾向）', subjectId: 'gpa', subjectName: '语文' },
  ];
}

function domesticTemplates(ctx: PathTemplateContext): PathPhaseTemplate[] {
  const prov = ctx.province ?? '本省';
  const g2 = isGrade2(ctx.grade);
  const g3 = isGrade3(ctx.grade);
  const p0Exit = g2
    ? '六科/主科主动评估≥60%，错题拓扑入库'
    : g3
      ? '主科模考切片≥65%，弱项清单锁定'
      : '全科摸底≥60%，弱项清单锁定';

  const topicSeeds =
    ctx.province === '湖南' && g2
      ? hunanG2Seeds()
      : [
          { title: '函数/数列专题', subjectId: 'math', subjectName: '数学' },
          { title: '电磁/力学综合', subjectId: 'phys', subjectName: '物理' },
          { title: '完形+阅读提速', subjectId: 'en', subjectName: '英语' },
        ];

  return [
    {
      code: 'P0_BASELINE',
      phase: `P0 // 现状验收（${ctx.grade}·${prov}）`,
      goalSummary: `建立${prov}卷型基线：主科分数带+错题拓扑+每周验收节奏`,
      exitCriteria: p0Exit,
      weight: 0.12,
      seeds: [
        { title: '主动评估卷（问答+填空）·主科', subjectId: 'math', subjectName: '数学' },
        { title: '学考/合格考风险排查（若适用）', subjectId: 'gpa', subjectName: '综合' },
      ],
    },
    {
      code: 'P1_SYLLABUS',
      phase: `P1 // 章节筑基（${g2 ? '新课标同步' : '一轮复习'}）`,
      goalSummary: g2
        ? '按人教/省情教材推进核心章，每日限时练+章节验收'
        : '一轮复习章节闭环，配套专题限时练',
      exitCriteria: '章节验收卷≥70%，错题周清零≥80%',
      weight: 0.22,
      seeds: [
        { title: '教材当前章 · 知识点清单', subjectId: 'math', subjectName: '数学' },
        { title: '校内同步作业证据链', subjectId: 'gpa', subjectName: '综合' },
      ],
    },
    {
      code: 'P2_TOPIC_DRILL',
      phase: `P2 // 专题突破（${prov}卷）`,
      goalSummary: '弱项专题（函数/力学/阅读等）限时训练+变式题',
      exitCriteria: '专题评估≥75%，同类错题不再错',
      weight: 0.2,
      seeds: topicSeeds,
    },
    {
      code: 'P3_MOCK_CHAIN',
      phase: `P3 // 限时模考链（${prov}）`,
      goalSummary: `${prov}卷全真/半真限时模考，涂卡节奏与心态`,
      exitCriteria: g3 ? '模考总分达阶段目标线±5%' : '主科模考达年级前X%目标',
      weight: 0.22,
      seeds: [
        { title: `${prov}卷限时模考 #1`, subjectId: 'math', subjectName: '数学' },
        { title: '理综/文综节奏训练（若选科）', subjectId: 'phys', subjectName: '物理' },
      ],
    },
    {
      code: 'P4_SPRINT',
      phase: 'P4 // 冲刺合流',
      goalSummary: '错题清零+全真模考+志愿/强基材料对齐',
      exitCriteria: '梦校对标线模考稳定，志愿策略可执行',
      weight: 0.14,
      seeds: [
        { title: '错题本清零验收', subjectId: 'math', subjectName: '数学' },
        { title: '强基/综评材料包（若适用）', subjectId: 'gpa', subjectName: '综合' },
      ],
    },
    {
      code: 'P5_ENROLL_ALIGN',
      phase: `P5 // 入学对齐 · ${ctx.school}`,
      goalSummary: `锁定 ${ctx.major} 录取最后一公里（${ctx.targetApplyAt}）`,
      exitCriteria: '入学前全科目验收绿灯',
      weight: 0.1,
      seeds: [{ title: `${ctx.school} · ${ctx.major} 录取指标核对`, subjectId: 'gpa', subjectName: '综合' }],
    },
  ];
}

function intlIbTemplates(ctx: PathTemplateContext): PathPhaseTemplate[] {
  const intlNote = ctx.province === '湖南' ? '（长沙/湖南国际部 syllabus）' : '';
  return [
    {
      code: 'I0_DIAG',
      phase: `I0 // 国际课程诊断${intlNote}`,
      goalSummary: 'AP/IB/A-Level 单元诊断+校内 syllabus 对齐',
      exitCriteria: '诊断卷≥65%，错因图入库',
      weight: 0.15,
      seeds: [
        { title: '校内 syllabus 当前单元', subjectId: 'ap', subjectName: 'AP/国际' },
        { title: '非高考教材 · 禁止省卷套题', subjectId: 'gpa', subjectName: '课程轨' },
      ],
    },
    {
      code: 'I1_UNIT',
      phase: 'I1 // Syllabus 单元推进',
      goalSummary: '按国际部课表推进单元，作业证据+单元测',
      exitCriteria: '单元测≥75%',
      weight: 0.3,
      seeds: [
        { title: 'Calculus / 微观经济 等当前 AP 单元', subjectId: 'ap', subjectName: 'AP' },
        { title: '英语学术写作段落', subjectId: 'en', subjectName: '英语' },
      ],
    },
    {
      code: 'I2_STANDARDIZED',
      phase: 'I2 // 标化/竞赛节点',
      goalSummary: '托福/雅思或 AP 模考块+竞赛成果',
      exitCriteria: '标化达阶段线，成果可追问',
      weight: 0.25,
      seeds: [
        { title: '托福/雅思 听说读写切片', subjectId: 'toefl', subjectName: '标化' },
        { title: 'AP 模考块（单科）', subjectId: 'ap', subjectName: 'AP' },
      ],
    },
    {
      code: 'I3_APPLICATION',
      phase: 'I3 // 申请合流',
      goalSummary: '文书/活动/推荐信锁叙事',
      exitCriteria: '申请材料齐套可提交',
      weight: 0.3,
      seeds: [
        { title: '活动线因果链', subjectId: 'essay', subjectName: '文书' },
        { title: '选校名单与 ED/EA 策略', subjectId: 'gpa', subjectName: '申请' },
      ],
    },
  ];
}

function usUkTemplates(ctx: PathTemplateContext): PathPhaseTemplate[] {
  return [
    {
      code: 'U0_STD_SLICE',
      phase: 'U0 // 标化基线切片',
      goalSummary: '托福/SAT 摸底+弱项切片',
      exitCriteria: '标化达阶段线',
      weight: 0.2,
      seeds: [
        { title: 'TOEFL 口语+听力切片', subjectId: 'toefl', subjectName: '托福' },
        { title: 'SAT 阅读/数学单节', subjectId: 'sat', subjectName: 'SAT' },
      ],
    },
    {
      code: 'U1_MAJOR',
      phase: 'U1 // 专业课阵地',
      goalSummary: '核心学科与 AP 对齐梦校',
      exitCriteria: '专业课评估≥70%',
      weight: 0.3,
      seeds: [
        { title: 'AP 核心课单元', subjectId: 'ap', subjectName: 'AP' },
        { title: '算法/CS 竞赛（若理工）', subjectId: 'algo', subjectName: '算法' },
      ],
    },
    {
      code: 'U2_NARRATIVE',
      phase: 'U2 // 叙事与活动',
      goalSummary: '活动线+文书因果链',
      exitCriteria: '材料经得起招生官追问',
      weight: 0.25,
      seeds: [
        { title: '主文书因果链', subjectId: 'essay', subjectName: '文书' },
        { title: '推荐信素材包', subjectId: 'gpa', subjectName: '综合' },
      ],
    },
    {
      code: 'U3_APPLY',
      phase: `U3 // 申请决战 · ${ctx.school}`,
      goalSummary: `对齐 ${ctx.targetApplyAt} 申请节点`,
      exitCriteria: '提交前全检通过',
      weight: 0.25,
      seeds: [{ title: `${ctx.school} 补充材料清单`, subjectId: 'essay', subjectName: '申请' }],
    },
  ];
}

export function resolvePhaseTemplates(ctx: PathTemplateContext): PathPhaseTemplate[] {
  if (ctx.pathway === 'domestic_cn' || ctx.curriculumTrack === 'cn_gaokao') {
    return domesticTemplates(ctx);
  }
  if (ctx.curriculumTrack === 'intl_ib_ap') return intlIbTemplates(ctx);
  if (ctx.curriculumTrack === 'intl_us_uk' || ctx.pathway === 'us_intl') return usUkTemplates(ctx);
  return domesticTemplates(ctx);
}

/** 按权重分配截止日期，且不超过入学月前 14 天 */
export function allocatePhaseDeadlines(
  templates: PathPhaseTemplate[],
  targetApplyAt: string,
  daysRemaining: number,
): string[] {
  const now = new Date();
  const apply = parseApplyMonth(targetApplyAt);
  const cap =
    apply != null
      ? new Date(apply.y, apply.m - 1, 15)
      : addDays(now, Math.max(30, daysRemaining));
  const capMs = cap.getTime();
  const totalW = templates.reduce((s, t) => s + t.weight, 0) || 1;
  let cursor = now.getTime();
  const span = Math.max(1, Math.min(daysRemaining, Math.ceil((capMs - cursor) / 86400000)));

  return templates.map((t, i) => {
    const slice = Math.max(7, Math.round((t.weight / totalW) * span));
    cursor += slice * 86400000;
    const d = new Date(Math.min(cursor, capMs));
    if (i === templates.length - 1) {
      return fmtDate(new Date(Math.min(capMs, d.getTime())));
    }
    return fmtDate(d);
  });
}

export function seedsToUnits(
  seeds: PathPhaseTemplate['seeds'],
  dueDate: string,
  phaseIndex: number,
): PathKnowledgeUnit[] {
  return seeds.map((s, j) => ({
    id: `seed-${s.subjectId}-${j}`,
    title: s.title,
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    masteryTargetPct: 85,
    currentPct: 0,
    dueDate,
    status: (phaseIndex === 0 && j === 0 ? 'in_progress' : 'locked') as PathKnowledgeUnit['status'],
    source: 'syllabus' as const,
    requiresAssessment: true,
  }));
}

export function buildPhasesFromTemplates(
  ctx: PathTemplateContext,
  opts: {
    extraUnits: PathKnowledgeUnit[];
    gapTitles: string[];
    phaseOverrides?: Partial<Record<PathPhaseCode, Partial<PathPhase>>>;
  },
): PathPhase[] {
  const templates = resolvePhaseTemplates(ctx);
  const deadlines = allocatePhaseDeadlines(templates, ctx.targetApplyAt, ctx.daysRemaining);
  const pool = opts.extraUnits;

  return templates.map((t, i) => {
    const deadline = deadlines[i] ?? fmtDate(addDays(new Date(), 14));
    const fromPool = pool.slice(i * 2, i * 2 + 2);
    const gapUnits: PathKnowledgeUnit[] = opts.gapTitles.slice(0, 2).map((g, j) => ({
      id: `gap-${t.code}-${j}`,
      title: g.slice(0, 80),
      subjectId: fromPool[0]?.subjectId ?? 'math',
      subjectName: fromPool[0]?.subjectName ?? '综合',
      masteryTargetPct: 80,
      currentPct: 0,
      dueDate: deadline,
      status: 'assessment_due',
      source: 'gap',
      requiresAssessment: true,
    }));
    const units =
      fromPool.length > 0
        ? fromPool.map((u) => ({
            ...u,
            dueDate: deadline,
            status: (i === 0 ? 'in_progress' : u.status === 'mastered' ? 'mastered' : 'locked') as PathKnowledgeUnit['status'],
          }))
        : seedsToUnits(t.seeds, deadline, i);
    const merged = [...gapUnits, ...units].slice(0, 6);
    const base: PathPhase = {
      id: t.code,
      phase: t.phase,
      deadline,
      goalSummary: t.goalSummary,
      exitCriteria: t.exitCriteria,
      knowledgeUnits: merged.length ? merged : seedsToUnits(t.seeds, deadline, i),
      milestoneStatus: i === 0 ? 'IN_PROGRESS' : 'LOCKED',
    };
    const ov = opts.phaseOverrides?.[t.code];
    return ov ? { ...base, ...ov, knowledgeUnits: ov.knowledgeUnits ?? base.knowledgeUnits } : base;
  });
}

export function computeWeeklyCheckpoints(phases: PathPhase[]): Array<{ weekStart: string; deliverable: string }> {
  const active = phases.find((p) => p.milestoneStatus === 'IN_PROGRESS') ?? phases[0];
  if (!active) return [];
  const now = new Date();
  const out: Array<{ weekStart: string; deliverable: string }> = [];
  for (let w = 0; w < 4; w++) {
    const ws = addDays(now, w * 7);
    const kps = active.knowledgeUnits.filter((u) => u.status !== 'mastered').slice(0, 2);
    out.push({
      weekStart: fmtDate(ws),
      deliverable:
        kps.length > 0
          ? `完成：${kps.map((k) => k.title).join('；')}（${active.exitCriteria}）`
          : active.goalSummary,
    });
  }
  return out;
}

export function pickTodayFocus(phases: PathPhase[]): {
  subjectId: string;
  title: string;
  dueDate: string;
  reason: string;
} | null {
  const ranked = phases
    .flatMap((p) =>
      p.knowledgeUnits.map((u) => ({
        ...u,
        phaseLabel: p.phase,
        phaseStatus: p.milestoneStatus,
      })),
    )
    .filter((u) => u.status === 'assessment_due' || u.status === 'in_progress')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const top = ranked[0];
  if (!top) return null;
  return {
    subjectId: top.subjectId,
    title: top.title,
    dueDate: top.dueDate,
    reason:
      top.status === 'assessment_due'
        ? `待验收 · ${top.phaseLabel}`
        : `今日攻坚 · ${top.phaseLabel}`,
  };
}

export function rollupMasteryPct(phases: PathPhase[]): number {
  const units = phases.flatMap((p) => p.knowledgeUnits);
  if (!units.length) return 0;
  const sum = units.reduce((s, u) => s + Math.min(100, u.currentPct), 0);
  return Math.round(sum / units.length);
}
