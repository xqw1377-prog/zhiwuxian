/**

 * ZHI · 梦校学习路径知识工程（强化版）

 * 评估 → 知识点掌握 → 省情时间轴 → 有学必考 → 今日攻坚

 */



import { getBaselineStatus, parseBaseline } from '../db/baseline-schema';

import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';

import {

  getLearningPathDocument,

  upsertLearningPathDocument,

  type LearningPathDocument,

  type PathKnowledgeUnit,

  type PathPhase,

} from '../db/learning-path-schema';

import {

  getMentorPlanView,

  getSchoolMatrixView,

  upsertMentorPlan,

  upsertSchoolTargetMetrics,

  type TimelineMilestone,

} from '../db/school-matrix';

import { listTextbooksForUser, parseTextbookOutline } from '../db/zhi-textbook-catalog-schema';

import { listAssessmentPapers } from '../db/zhi-assessment-schema';

import { buildLearnerProfile, type CurriculumTrack } from './learner-profile';

import {

  detectSchoolPathway,

  PATHWAY_LABEL,

  type SchoolPathway,

} from './school-pathway';

import { daysUntilApply, milestonesToDynamic } from './school-anchor-brief';

import { buildLearningProgressDashboard } from './learning-progress-dashboard';

import { resolveUserLlm } from './deepseek-client';

import { gatewayJsonCompletion } from './llm-gateway';
import { buildSandboxedSystemContent } from '../../server/agents/zhi-tools';

import { WARP_COST } from './billing-hub';

import {

  allocatePhaseDeadlines,

  buildCriticalDates,

  buildPhasesFromTemplates,

  computeWeeklyCheckpoints,

  pickTodayFocus,

  resolvePhaseTemplates,

  rollupMasteryPct,

  type PathTemplateContext,

} from './learning-path-templates';

import {
  aggregateLearnerEvidence,
  pickFocusFromWeaknesses,
  weaknessesToPathUnits,
  type LearnerEvidencePack,
} from './learner-evidence-hub';

export type LearningPathDto = LearningPathDocument;

const PATH_DOC_VERSION = 4;

/** 任一证据更新后重算路径（不抛错） */
export async function rebuildLearningPathFromEvidence(userId: string): Promise<LearningPathDto | null> {
  try {
    return await buildAndPersistLearningPath(userId);
  } catch {
    return null;
  }
}



const PATH_LLM_SYSTEM = `你是 WUXIAN 梦校路径知识工程官。输出 JSON（禁止 markdown）。

必须遵守：阶段 id 与输入草案的 phase id 一致；deadline 单调递增且早于入学月；每阶段 2-5 个可验收知识点；学完必考 requiresAssessment=true。

{

  "summaryLine": "一句话（含本周攻坚）",

  "phases": [

    {

      "id": "P0_BASELINE",

      "phase": "阶段名",

      "deadline": "YYYY-MM-DD",

      "goalSummary": "可验证目标",

      "exitCriteria": "过关标准",

      "knowledgeUnits": [

        { "id": "kp1", "title": "具体知识点", "subjectId": "math", "subjectName": "数学", "masteryTargetPct": 85, "dueDate": "YYYY-MM-DD", "requiresAssessment": true }

      ]

    }

  ]

}`;



function fmtDate(d: Date): string {

  return d.toISOString().slice(0, 10);

}



function addDays(base: Date, days: number): Date {

  return new Date(base.getTime() + days * 86400000);

}



function collectTextbookUnits(userId: string, limit = 12): PathKnowledgeUnit[] {

  const units: PathKnowledgeUnit[] = [];

  const books = listTextbooksForUser(userId);

  const due = fmtDate(addDays(new Date(), 14));

  for (const b of books.slice(0, 3)) {

    const outline = parseTextbookOutline(b);

    const ch = outline.find((c) => c.index === (b.progress_chapter ?? 1));

    const totalCh = Math.max(1, outline.length);

    for (const kp of (ch?.knowledgePoints ?? []).slice(0, 4)) {

      units.push({

        id: `tb-${b.id}-${kp.slice(0, 12)}`,

        title: kp,

        subjectId: b.subject?.toLowerCase().includes('数') ? 'math' : 'gpa',

        subjectName: b.subject ?? '综合',

        masteryTargetPct: 85,

        currentPct: Math.min(99, Math.round(((b.progress_chapter ?? 1) / totalCh) * 100)),

        dueDate: due,

        status: 'in_progress',

        source: 'textbook',

        requiresAssessment: true,

      });

    }

  }

  return units.slice(0, limit);

}



function collectSubjectUnits(userId: string): PathKnowledgeUnit[] {

  const dash = buildLearningProgressDashboard(userId);

  const due = fmtDate(addDays(new Date(), 21));

  return dash.subjects.slice(0, 6).map((s) => ({

    id: `subj-${s.id}`,

    title: `${s.name} · 对标梦校线`,

    subjectId: s.id,

    subjectName: s.name,

    masteryTargetPct: 80,

    currentPct: s.progressPct,

    dueDate: due,

    status: s.progressPct >= 80 ? 'mastered' : s.progressPct >= 40 ? 'in_progress' : 'locked',

    source: 'syllabus',

    requiresAssessment: true,

  }));

}



function collectBaselineGapTitles(userId: string): string[] {

  const row = getBaselineStatus(userId);

  if (!row) return [];

  try {

    const b = parseBaseline(row);

    const weak = Array.isArray(b.weakSubjects) ? b.weakSubjects.map(String) : [];

    const scores = Object.entries(b.currentScores ?? {})

      .filter(([, v]) => /%|分|待/.test(String(v)))

      .map(([k]) => `${k} 待提升`);

    return [...weak, ...scores].slice(0, 6);

  } catch {

    return [];

  }

}



function applyRecentAssessments(userId: string, phases: PathPhase[]): void {

  const papers = listAssessmentPapers(userId.trim(), 12).filter((p) => p.status === 'reckoned');

  for (const p of papers) {

    const score = parseInt(String(p.score_summary ?? '').replace(/%/g, ''), 10);

    const pct = Number.isFinite(score) ? score : 0;

    for (const ph of phases) {

      for (const u of ph.knowledgeUnits) {

        if (u.subjectId === p.subject_id || u.subjectName === p.subject_name) {

          u.currentPct = Math.max(u.currentPct, pct);

          if (pct >= 80) u.status = 'mastered';

          else if (pct >= 60) u.status = 'in_progress';

        }

      }

    }

  }

}



function buildHeuristicPhases(
  ctx: PathTemplateContext,
  userId: string,
  gapDetails: string[],
  evidence: LearnerEvidencePack,
): PathPhase[] {
  const due = evidence.weaknesses[0]?.actionDue ?? fmtDate(addDays(new Date(), 3));
  const weaknessUnits = weaknessesToPathUnits(evidence.weaknesses.slice(0, 6), due);
  const pool = [...weaknessUnits, ...collectTextbookUnits(userId, 8), ...collectSubjectUnits(userId)];
  const gapTitles = [
    ...evidence.weaknesses.map((w) => w.title),
    ...gapDetails,
    ...collectBaselineGapTitles(userId),
  ];
  const phases = buildPhasesFromTemplates(ctx, { extraUnits: pool, gapTitles });
  const p0 = phases.find((p) => p.id === 'P0_BASELINE' || p.id.startsWith('P0') || p.id.startsWith('I0')) ?? phases[0];
  if (p0 && weaknessUnits.length) {
    const merged = [...weaknessUnits, ...p0.knowledgeUnits.filter((u) => !u.id.startsWith('weak-'))];
    p0.knowledgeUnits = merged.slice(0, 8);
    p0.goalSummary = `短板驱动：${evidence.weaknesses[0]?.title ?? '待评估'} — ${p0.goalSummary}`;
    p0.exitCriteria = `TOP 短板验收≥70% 或 评估≥65% · ${p0.exitCriteria}`;
    p0.milestoneStatus = 'IN_PROGRESS';
  }
  return phases;
}



function mergeLlmPhases(heuristic: PathPhase[], llm: PathPhase[]): PathPhase[] {

  const byId = new Map(llm.map((p) => [p.id, p]));

  return heuristic.map((h, i) => {

    const l = byId.get(h.id) ?? llm[i];

    if (!l) return h;

    const units =

      (l.knowledgeUnits?.length ?? 0) >= 2

        ? l.knowledgeUnits.map((u, j) => ({

            ...u,

            status: (h.knowledgeUnits[j]?.status ?? u.status) as PathKnowledgeUnit['status'],

            currentPct: h.knowledgeUnits[j]?.currentPct ?? u.currentPct ?? 0,

            source: u.source ?? ('syllabus' as const),

          }))

        : h.knowledgeUnits;

    return {

      ...h,

      phase: l.phase || h.phase,

      deadline: l.deadline && l.deadline <= h.deadline ? l.deadline : h.deadline,

      goalSummary: l.goalSummary || h.goalSummary,

      exitCriteria: l.exitCriteria || h.exitCriteria,

      knowledgeUnits: units,

      milestoneStatus: h.milestoneStatus,

    };

  });

}



function finalizeDocument(
  userId: string,
  anchor: { school: string; major: string; targetApplyAt: string; currentGrade: string },
  ctx: PathTemplateContext,
  pathway: SchoolPathway,
  phases: PathPhase[],
  challengeIndex: number,
  evidence: LearnerEvidencePack,
  summaryOverride?: string,
): LearningPathDocument {
  applyRecentAssessments(userId, phases);

  const active = phases.find((p) => p.milestoneStatus === 'IN_PROGRESS') ?? phases[0];

  const nextUnit = phases

    .flatMap((p) => p.knowledgeUnits)

    .filter((u) => u.requiresAssessment && u.status !== 'mastered')

    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const todayFocus =
    pickFocusFromWeaknesses(evidence.weaknesses, pickTodayFocus(phases)) ?? pickTodayFocus(phases);

  const masteryPct = rollupMasteryPct(phases);

  const criticalDates = buildCriticalDates(ctx);

  const weeklyCheckpoints = computeWeeklyCheckpoints(phases);



  const summaryLine =

    summaryOverride ??

    `【${ctx.province ?? '升学'}·${ctx.grade}】${phases.length} 阶段 · ${phases.reduce((n, p) => n + p.knowledgeUnits.length, 0)} 知识点 · 综合掌握 ${masteryPct}% · 有学必考`;



  return {

    version: PATH_DOC_VERSION,

    targetSchool: `${anchor.school} · ${anchor.major}`,

    targetApplyAt: anchor.targetApplyAt,

    pathway,

    pathwayLabel: PATHWAY_LABEL[pathway],

    daysRemaining: ctx.daysRemaining,

    challengeIndex,

    phases,

    activePhaseId: active?.id ?? null,

    nextAssessmentDue: nextUnit?.dueDate ?? fmtDate(addDays(new Date(), 7)),

    summaryLine,

    updatedAt: 0,

    masteryPct,

    todayFocus,

    criticalDates,

    weeklyCheckpoints,

    provinceOrRegion: ctx.province,

    gradeBand: ctx.grade,

    curriculumTrack: ctx.curriculumTrack,
    weaknessLedger: evidence.weaknesses.map((w) => ({
      id: w.id,
      title: w.title,
      subjectId: w.subjectId,
      subjectName: w.subjectName,
      severity: w.severity,
      sources: w.sources,
      evidence: w.evidence,
      actionDue: w.actionDue,
    })),
    pushHeadline: evidence.pushHeadline,
    pushActions: evidence.pushActions.map((a) => ({
      id: a.id,
      label: a.label,
      reason: a.reason,
      subjectId: a.subjectId,
      kind: a.kind,
    })),
    dataCompletenessPct: evidence.dataCompletenessPct,
    missingSignals: evidence.missingSignals,
  };
}



/** 将路径写入 mentor / matrix 时间轴 */

export function timelineFromLearningPath(doc: LearningPathDocument): TimelineMilestone[] {

  return doc.phases.map((p) => ({

    phase: p.phase,

    deadline: p.deadline,

    action: `${p.goalSummary}｜过关：${p.exitCriteria}`,

  }));

}



function syncMentorAndMatrix(userId: string, doc: LearningPathDocument): void {

  const timeline = timelineFromLearningPath(doc);

  const dynamic = milestonesToDynamic(timeline, doc.challengeIndex);

  const plan = getMentorPlanView(userId);

  const baseline = plan?.currentBaseline ?? {};

  const focusLine = doc.todayFocus

    ? `今日攻坚：${doc.todayFocus.title}（${doc.todayFocus.dueDate}）`

    : '';



  upsertMentorPlan({

    userId,

    targetSchool: doc.targetSchool,

    currentBaseline: baseline,

    mentorWakeUpCall:

      [focusLine, `梦校路径 v${doc.version}：${doc.phases.length} 阶段 · 掌握 ${doc.masteryPct ?? 0}%`]

        .filter(Boolean)

        .join(' · ') ||

      plan?.mentorWakeUpCall ||

      '梦校路径已生成。',

    challengeIndex: doc.challengeIndex,

    causalityGaps: (plan?.causalityGaps ?? []).slice(0, 8),

    dynamicMilestones: dynamic,

  });



  const matrix = getSchoolMatrixView(userId);

  upsertSchoolTargetMetrics({

    userId,

    targetSchool: doc.targetSchool,

    requiredMetrics: {
      ...(matrix?.requiredMetrics ?? {}),
      路径掌握度: `${doc.masteryPct ?? 0}%`,
      证据完备度: `${doc.dataCompletenessPct ?? 0}%`,
      下次必考: doc.nextAssessmentDue ?? '—',
      今日攻坚: doc.todayFocus?.title ?? '—',
      短板TOP1: doc.weaknessLedger?.[0]?.title ?? '—',
    },

    currentBaseline: matrix?.currentBaseline ?? baseline,

    gapDetails: matrix?.gapDetails ?? [],

    challengeIndex: doc.challengeIndex,

    timelineMilestones: timeline,

    activePhase: doc.phases.find((p) => p.milestoneStatus === 'IN_PROGRESS')?.phase ?? timeline[0]?.phase ?? null,

  });

}



async function llmEnhancePath(

  userId: string,

  ctx: {

    profileBlock: string;

    targetSchool: string;

    daysRemaining: number;

    pathwayLabel: string;

    gapDetails: string[];

    heuristic: PathPhase[];

    templateCtx: PathTemplateContext;

  },

): Promise<{ phases: PathPhase[] | null; summaryLine?: string }> {

  if (!resolveUserLlm(userId) && !process.env.DEEPSEEK_API_KEY?.trim()) return { phases: null };

  try {

    const templateHint = resolvePhaseTemplates(ctx.templateCtx)

      .map((t) => `${t.code}: ${t.goalSummary}`)

      .join('\n');

    const gw = await gatewayJsonCompletion<{

      summaryLine?: string;

      phases?: Array<{

        id?: string;

        phase?: string;

        deadline?: string;

        goalSummary?: string;

        exitCriteria?: string;

        knowledgeUnits?: Array<{

          id?: string;

          title?: string;

          subjectId?: string;

          subjectName?: string;

          masteryTargetPct?: number;

          dueDate?: string;

          requiresAssessment?: boolean;

        }>;

      }>;

    }>(

      userId,

      [

        {
          role: 'system',
          content: buildSandboxedSystemContent(PATH_LLM_SYSTEM, { userId }),
        },

        {

          role: 'user',

          content: [

            ctx.profileBlock,

            `梦校：${ctx.targetSchool}`,

            `路径：${ctx.pathwayLabel}`,

            `省情模板：\n${templateHint}`,

            `距入学：${ctx.daysRemaining} 天`,

            `差距：${ctx.gapDetails.join('；') || '待评估补齐'}`,

            `草案（保持 id）：${JSON.stringify(ctx.heuristic)}`,

          ].join('\n'),

        },

      ],

      {

        traceId: `learning_path_${userId}`,

        maxTokens: 2200,

        temperature: 0.25,

        flatWarp: { cost: WARP_COST.PLANNER_REGEN, reason: 'LEARNING_PATH' },

      },

    );

    const raw = gw.chargeOk ? gw.data : null;

    if (!raw?.phases?.length) return { phases: null };

    const llmPhases = raw.phases.slice(0, 8).map((p, i) => {

      const h = ctx.heuristic.find((x) => x.id === p.id) ?? ctx.heuristic[i];

      const deadline = String(p.deadline ?? h?.deadline ?? fmtDate(addDays(new Date(), 30))).slice(0, 10);

      return {

        id: String(p.id ?? h?.id ?? `phase-${i + 1}`),

        phase: String(p.phase ?? h?.phase ?? `阶段 ${i + 1}`).slice(0, 80),

        deadline,

        goalSummary: String(p.goalSummary ?? h?.goalSummary ?? '').slice(0, 220),

        exitCriteria: String(p.exitCriteria ?? h?.exitCriteria ?? '阶段评估过关').slice(0, 140),

        knowledgeUnits: (p.knowledgeUnits ?? h?.knowledgeUnits ?? []).slice(0, 6).map((u, j) => ({

          id: String(u.id ?? `kp-${i}-${j}`),

          title: String(u.title ?? '知识点').slice(0, 80),

          subjectId: String(u.subjectId ?? 'math').slice(0, 16),

          subjectName: String(u.subjectName ?? '综合').slice(0, 24),

          masteryTargetPct: Math.max(60, Math.min(100, Math.round(Number(u.masteryTargetPct ?? 85)))),

          currentPct: h?.knowledgeUnits[j]?.currentPct ?? 0,

          dueDate: String(u.dueDate ?? deadline).slice(0, 10),

          status: (h?.knowledgeUnits[j]?.status ??

            (i === 0 && j === 0 ? 'in_progress' : 'locked')) as PathKnowledgeUnit['status'],

          source: (h?.knowledgeUnits[j]?.source ?? 'syllabus') as PathKnowledgeUnit['source'],

          requiresAssessment: u.requiresAssessment !== false,

        })),

        milestoneStatus: (h?.milestoneStatus ??

          (i === 0 ? 'IN_PROGRESS' : 'LOCKED')) as PathPhase['milestoneStatus'],

      };

    });

    return { phases: llmPhases, summaryLine: raw.summaryLine?.slice(0, 200) };

  } catch {

    return { phases: null };

  }

}



export async function buildAndPersistLearningPath(userId: string): Promise<LearningPathDto> {

  const uid = userId.trim();

  const anchor = getSchoolAnchorProfile(uid);

  if (!anchor?.school?.trim()) throw new Error('请先完成梦校航标');



  const profile = buildLearnerProfile(uid);

  const pathway = profile?.pathway ?? detectSchoolPathway(anchor.school, anchor.major, {

    currentSchool: anchor.currentSchool,

    currentRegion: anchor.currentRegion,

    targetSchoolRegion: anchor.targetSchoolRegion,

    currentGrade: anchor.currentGrade,

  });

  const daysRemaining = daysUntilApply(anchor.targetApplyAt);

  const matrix = getSchoolMatrixView(uid);

  const plan = getMentorPlanView(uid);

  const gapDetails = matrix?.gapDetails ?? plan?.causalityGaps?.map((g) => g.causalityEffect) ?? [];

  const challengeIndex = matrix?.challengeIndex ?? plan?.challengeIndex ?? 55;



  const templateCtx: PathTemplateContext = {

    pathway,

    curriculumTrack: profile?.curriculumTrack ?? 'cn_gaokao',

    grade: anchor.currentGrade,

    province: profile?.provinceOrRegion ?? null,

    school: anchor.school,

    major: anchor.major,

    targetApplyAt: anchor.targetApplyAt,

    daysRemaining,

  };



  const evidence = aggregateLearnerEvidence(uid);
  const heuristic = buildHeuristicPhases(templateCtx, uid, gapDetails, evidence);

  const profileBlock = profile

    ? `【学习者画像】\n${profile.curriculumLabel}\n年级：${anchor.currentGrade}\n地区：${profile.provinceOrRegion ?? '待补'}\n评估形式：${profile.assessmentFormats.join('；')}`

    : '';



  const { phases: llmRaw, summaryLine: llmSummary } = await llmEnhancePath(uid, {

    profileBlock,

    targetSchool: `${anchor.school} · ${anchor.major}`,

    daysRemaining,

    pathwayLabel: PATHWAY_LABEL[pathway],

    gapDetails,

    heuristic,

    templateCtx,

  });



  const phases = llmRaw ? mergeLlmPhases(heuristic, llmRaw) : heuristic;

  const doc = finalizeDocument(uid, anchor, templateCtx, pathway, phases, challengeIndex, evidence, llmSummary);



  upsertLearningPathDocument(uid, doc);

  syncMentorAndMatrix(uid, doc);

  return doc;

}



export async function replanLearningPathAfterAssessment(

  userId: string,

  input: {

    subjectId: string;

    subjectName: string;

    scorePct: number;

    gaps: string[];

    strengths: string[];

  },

): Promise<LearningPathDto> {

  const uid = userId.trim();

  let doc = getLearningPathDocument(uid);

  if (!doc || (doc.version ?? 0) < PATH_DOC_VERSION) {

    doc = await buildAndPersistLearningPath(uid);

  }



  const assessDue = fmtDate(addDays(new Date(), input.scorePct >= 75 ? 14 : 3));

  const gapUnits: PathKnowledgeUnit[] = input.gaps.slice(0, 5).map((g, i) => ({

    id: `assess-gap-${Date.now()}-${i}`,

    title: g.slice(0, 80),

    subjectId: input.subjectId,

    subjectName: input.subjectName,

    masteryTargetPct: 85,

    currentPct: Math.round(input.scorePct),

    dueDate: assessDue,

    status: 'assessment_due',

    source: 'assessment',

    requiresAssessment: true,

  }));



  let activePhase = doc.phases.find((p) => p.milestoneStatus === 'IN_PROGRESS');

  if (!activePhase) {

    activePhase = doc.phases[0];

    if (activePhase) activePhase.milestoneStatus = 'IN_PROGRESS';

  }

  if (activePhase) {

    for (const u of gapUnits) {

      if (!activePhase.knowledgeUnits.some((k) => k.title === u.title)) {

        activePhase.knowledgeUnits.unshift(u);

      }

    }

    for (const u of activePhase.knowledgeUnits) {

      if (u.subjectId === input.subjectId) {

        u.currentPct = Math.max(u.currentPct, input.scorePct);

        if (input.scorePct >= 80) u.status = 'mastered';

      }

    }

    if (input.scorePct >= 80) {

      activePhase.exitCriteria = `评估 ${input.scorePct}% · 阶段过关前再验收 1 次`;

    } else {

      activePhase.goalSummary = `${activePhase.goalSummary.split('（评估')[0]}（评估 ${input.scorePct}%：${input.gaps[0] ?? '需补强'}）`;

    }

  }



  if (input.scorePct >= 78 && doc.phases.length > 1) {

    const idx = doc.phases.findIndex((p) => p.id === activePhase?.id);

    if (idx >= 0 && doc.phases[idx]) {

      doc.phases[idx].milestoneStatus = 'COMPLETED';

      const next = doc.phases[idx + 1];

      if (next) {

        next.milestoneStatus = 'IN_PROGRESS';

        doc.activePhaseId = next.id;

        next.knowledgeUnits.forEach((u, j) => {

          if (j === 0 && u.status === 'locked') u.status = 'in_progress';

        });

      }

    }

  }



  doc.challengeIndex = Math.max(

    1,

    Math.min(100, Math.round(doc.challengeIndex * 0.65 + (100 - input.scorePct) * 0.35)),

  );

  doc.nextAssessmentDue = assessDue;

  doc.masteryPct = rollupMasteryPct(doc.phases);
  const evidence = aggregateLearnerEvidence(uid);
  doc.todayFocus =
    pickFocusFromWeaknesses(evidence.weaknesses, pickTodayFocus(doc.phases)) ?? pickTodayFocus(doc.phases);
  doc.weeklyCheckpoints = computeWeeklyCheckpoints(doc.phases);
  doc.summaryLine = `评估 ${input.scorePct}% · 薄弱 ${gapUnits.length} 项已插队 · 掌握 ${doc.masteryPct}% · 下次必考 ${assessDue}`;
  doc.weaknessLedger = evidence.weaknesses.map((w) => ({
    id: w.id,
    title: w.title,
    subjectId: w.subjectId,
    subjectName: w.subjectName,
    severity: w.severity,
    sources: w.sources,
    evidence: w.evidence,
    actionDue: w.actionDue,
  }));
  doc.pushHeadline = evidence.pushHeadline;
  doc.pushActions = evidence.pushActions.map((a) => ({
    id: a.id,
    label: a.label,
    reason: a.reason,
    subjectId: a.subjectId,
    kind: a.kind,
  }));
  doc.dataCompletenessPct = evidence.dataCompletenessPct;
  doc.missingSignals = evidence.missingSignals;

  upsertLearningPathDocument(uid, doc);

  syncMentorAndMatrix(uid, doc);

  return doc;

}



export function getLearningPath(userId: string): LearningPathDto | null {

  const cached = getLearningPathDocument(userId.trim());

  if (cached?.phases?.length) return cached;

  return null;

}



export async function ensureLearningPath(userId: string): Promise<LearningPathDto> {

  const existing = getLearningPathDocument(userId.trim());

  if (existing?.phases?.length && (existing.version ?? 0) >= PATH_DOC_VERSION) {

    return existing;

  }

  return buildAndPersistLearningPath(userId);

}



export function formatLearningPathChatSummary(doc: LearningPathDocument): string {

  const lines = [

    `【梦校学习路径 · 知识工程】${doc.targetSchool}`,

    doc.summaryLine,

    `入学 ${doc.targetApplyAt}（剩 ${doc.daysRemaining} 天）· ${doc.pathwayLabel}`,

    doc.masteryPct != null ? `综合掌握度：${doc.masteryPct}%` : '',

  ].filter(Boolean);



  if (doc.pushHeadline) {
    lines.push('', `【推动】${doc.pushHeadline}`);
  }
  if (doc.missingSignals?.length) {
    lines.push(`待补齐证据：${doc.missingSignals.join('、')}`);
  }
  if (doc.weaknessLedger?.length) {
    lines.push('', '短板清单（按严重度）：');
    for (const w of doc.weaknessLedger.slice(0, 5)) {
      lines.push(`  · [${w.severity}] ${w.title} ← ${w.evidence.slice(0, 36)}`);
    }
  }
  if (doc.todayFocus) {
    lines.push(
      '',
      `★ 今日攻坚：${doc.todayFocus.title}（${doc.todayFocus.dueDate}）`,
      `  ${doc.todayFocus.reason}`,
    );
  }



  if (doc.criticalDates?.length) {

    lines.push('', '关键考期：');

    for (const c of doc.criticalDates.slice(0, 5)) {

      lines.push(`  · ${c.date} ${c.label}`);

    }

  }



  lines.push('', '阶段时间轴：');

  for (const p of doc.phases) {

    const st =

      p.milestoneStatus === 'IN_PROGRESS' ? '▶' : p.milestoneStatus === 'COMPLETED' ? '✓' : '○';

    lines.push(`  ${st} ${p.deadline}  ${p.phase}`);

    lines.push(`      目标：${p.goalSummary}`);

    lines.push(`      过关：${p.exitCriteria}`);

    const kps = p.knowledgeUnits.slice(0, 5);

    if (kps.length) {

      lines.push(

        `      知识点：${kps.map((k) => `${k.title}[${k.currentPct}%→${k.masteryTargetPct}%·${k.dueDate}${k.requiresAssessment ? '·必考' : ''}]`).join('；')}`,

      );

    }

  }



  if (doc.weeklyCheckpoints?.length) {

    lines.push('', '四周交付：');

    for (const w of doc.weeklyCheckpoints.slice(0, 2)) {

      lines.push(`  · ${w.weekStart}：${w.deliverable}`);

    }

  }



  if (doc.nextAssessmentDue) {

    lines.push('', `下次必考验收：${doc.nextAssessmentDue}`);

  }

  return lines.join('\n');

}



export function recentAssessmentCount(userId: string, hours = 48): number {

  const since = Math.floor(Date.now() / 1000) - hours * 3600;

  return listAssessmentPapers(userId.trim(), 20).filter(

    (p) => p.status === 'reckoned' && p.created_at >= since,

  ).length;

}


