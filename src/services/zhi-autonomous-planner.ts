/**
 * ZHI · 自主规划引擎
 * 根据时间节点+用户能力，主动规划课程/知识点/时间/学后评估
 * 数据缺失时主动索要，评估后自动调整，达成梦校目标
 */

import { randomUUID } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { getBaselineStatus, parseBaseline, upsertBaselineStatus } from '../db/baseline-schema';
import { detectSchoolPathway, PATHWAY_LABEL } from './school-pathway';
import { syncAnchorDirectories } from '../api/zhi-cloud-api';
import { gatewayJsonCompletion } from './llm-gateway';
import { WARP_COST } from './billing-hub';
import { resolveUserLlm } from './deepseek-client';

// ── 公开类型 ──

export type PlanStatus = 'uninitialized' | 'gathering_data' | 'planned' | 'active' | 'paused' | 'completed';

export type DataGapItem = {
  field: string;
  label: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
};

export type DataCollectionRequest = {
  requestId: string;
  questions: string[];
  gaps: DataGapItem[];
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
};

export type KnowledgePlanNode = {
  id: string;
  subject: string;
  nodeTitle: string;
  prerequisites: string[];
  estimatedMinutes: number;
  masteryTarget: number;
  currentMastery: number;
  status: string;
  seqOrder: number;
  scheduledDate: string | null;
  assessmentType: string;
};

export type TimeSlot = {
  id: string;
  planDate: string;
  slotHour: number;
  subject: string;
  activity: string;
  knowledgeNodeId: string | null;
  durationMinutes: number;
  energyLevel: string;
  status: string;
};

export type AssessmentScheduleItem = {
  id: string;
  subject: string;
  scheduledDate: string;
  assessmentType: string;
  status: string;
  paperId: string | null;
  scorePct: number | null;
};

export type PhaseInfo = {
  index: number;
  name: string;
  startDate: string;
  endDate: string;
  focusSubject: string;
  targetOutcome: string;
};

export type AutonomousPlanDto = {
  userId: string;
  status: PlanStatus;
  targetSchool: string;
  targetMajor: string;
  examDate: string | null;
  daysUntilExam: number | null;
  currentPhase: PhaseInfo | null;
  phases: PhaseInfo[];
  dataGaps: DataGapItem[];
  pendingRequest: DataCollectionRequest | null;
  planSummary: string;
  knowledgeNodes: KnowledgePlanNode[];
  todaySlots: TimeSlot[];
  nextAssessment: AssessmentScheduleItem | null;
  dataCompleteness: number;
};

export type PlanGenerationInput = {
  anchor: {
    school: string;
    major: string;
    currentGrade: string;
    targetApplyAt: string;
    currentSchool: string;
  };
  baseline: {
    scores: Record<string, string>;
    weakSubjects: string[];
    hoursPerDay: number | null;
  };
  daysRemaining: number;
  pathway: string;
};

// ── LLM Prompt Templates ──

const PLAN_GENERATION_SYSTEM_PROMPT = `你是 WUXIAN 自主规划引擎的核心规划官。你的任务是根据用户的梦校目标、当前能力基线、剩余时间，生成一套完整的学业规划方案。

你需要输出严格的 JSON，包含以下结构：
{
  "planSummary": "整体规划的一句话概述",
  "phases": [
    {
      "index": 0,
      "name": "阶段名称",
      "focusSubject": "主攻科目",
      "targetOutcome": "该阶段结束时必须达到的目标",
      "weekCount": 4
    }
  ],
  "knowledgeNodes": [
    {
      "subject": "科目名",
      "nodeTitle": "知识点名称",
      "prerequisites": ["前置知识点ID"],
      "estimatedMinutes": 45,
      "masteryTarget": 0.8,
      "phaseIndex": 0,
      "assessmentType": "knowledge_check|chapter_test|full_mock|none",
      "seqOrder": 1
    }
  ],
  "weeklyRhythm": {
    "monday": { "subject": "主攻科目", "hours": 2, "focus": "知识点范围" },
    "tuesday": { "subject": "科目", "hours": 1.5, "focus": "知识点范围" },
    "wednesday": { "subject": "科目", "hours": 2, "focus": "知识点范围" },
    "thursday": { "subject": "科目", "hours": 1.5, "focus": "知识点范围" },
    "friday": { "subject": "科目", "hours": 2, "focus": "知识点范围" },
    "saturday": { "subject": "科目", "hours": 3, "focus": "综合/模考" },
    "sunday": { "subject": "复盘", "hours": 1, "focus": "错题归档/评估" }
  },
  "assessmentCadence": "每章结束后立即评估|每周六模考"
}

约束：
1. knowledgeNodes 至少 10 个，最多 60 个
2. phases 2-4 个阶段，从基础到冲刺
3. 每个知识点必须标明所属阶段 (phaseIndex)
4. 根据剩余天数合理分配，不要过度紧凑也不要太松散
5. 弱项科目应该分配更多时间
6. 重要程度用 seqOrder 表示（1=最重要，数值越大越次要）

示例输出（仅供参考，请根据用户实际情况修改）：
{
  "planSummary": "90天托福从85冲到105，分三阶段：基础强化→技巧突破→模考冲刺",
  "phases": [
    { "index": 0, "name": "基础强化", "focusSubject": "阅读", "targetOutcome": "阅读25+，听力24+", "weekCount": 4 },
    { "index": 1, "name": "技巧突破", "focusSubject": "口语", "targetOutcome": "口语23+，写作25+", "weekCount": 6 },
    { "index": 2, "name": "模考冲刺", "focusSubject": "综合", "targetOutcome": "总分105+", "weekCount": 4 }
  ],
  "knowledgeNodes": [
    { "subject": "阅读", "nodeTitle": "长难句解析·句子简化题", "prerequisites": [], "estimatedMinutes": 45, "masteryTarget": 0.8, "phaseIndex": 0, "assessmentType": "knowledge_check", "seqOrder": 1 }
  ],
  "weeklyRhythm": {
    "monday": { "subject": "阅读", "hours": 2, "focus": "题型专练" },
    "saturday": { "subject": "综合", "hours": 3, "focus": "全真模考" },
    "sunday": { "subject": "复盘", "hours": 1, "focus": "错题归档" }
  },
  "assessmentCadence": "每章结束后立即评估，每周六模考"
}
`;

const DATA_GAP_ANALYSIS_PROMPT = `你是 WUXIAN 自主规划引擎的数据分析师。分析用户的现有数据，找出缺失的关键信息，生成需要主动向用户询问的问题。

返回 JSON:
{
  "gaps": [
    {
      "field": "unique_field_id",
      "label": "中文标签",
      "description": "为什么需要这个数据",
      "priority": "high|medium|low"
    }
  ],
  "questions": [
    "向用户提问的具体问题"
  ],
  "completeness": 0-100,
  "canPlan": true|false
}`;

const PLAN_ADJUSTMENT_PROMPT = `你是 WUXIAN 自主规划引擎的调整官。用户刚完成了一次评估，需要根据评估结果调整规划。

返回 JSON:
{
  "adjustments": [
    {
      "knowledgeNodeId": "被影响的知识点ID",
      "action": "reschedule|reinforce|skip|master",
      "reason": "调整原因"
    }
  ],
  "newFocus": "新的短期攻坚方向",
  "rescheduleSlots": [
    {
      "originalDate": "原日期",
      "newDate": "新日期",
      "reason": "原因"
    }
  ],
  "planSummary": "调整后的整体概述"
}`;

// ── 简单 LRU 缓存 ──

const planCache = new Map<string, { result: AutonomousPlanDto; expiresAt: number }>();
const CACHE_TTL_MS = 5000;

function getCachedPlan(userId: string): AutonomousPlanDto | null {
  const entry = planCache.get(userId);
  if (entry && Date.now() < entry.expiresAt) return entry.result;
  planCache.delete(userId);
  return null;
}

function setCachedPlan(userId: string, plan: AutonomousPlanDto): void {
  if (planCache.size >= 100) {
    const oldest = planCache.keys().next().value;
    if (oldest) planCache.delete(oldest);
  }
  planCache.set(userId, { result: plan, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidatePlanCache(userId: string): void {
  planCache.delete(userId);
}

// ── 内部工具 ──

function newId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

function nowStr(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 365;
  return Math.ceil((db.getTime() - da.getTime()) / 86400000);
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function clampFloat(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

function localDateStr(dayOffset: number): string {
  const d = new Date();
  if (dayOffset) d.setDate(d.getDate() + dayOffset);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// ── 核心函数 ──

/**
 * 确保规划 schema 已初始化
 */
function ensureSchema(): void {
  getLearningDb().exec(`
    CREATE TABLE IF NOT EXISTS zhi_autonomous_plans (
      user_id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'uninitialized',
      target_school TEXT DEFAULT '',
      target_major TEXT DEFAULT '',
      exam_date TEXT,
      current_ability_label TEXT DEFAULT 'unknown',
      data_gaps_json TEXT DEFAULT '[]',
      active_request_json TEXT,
      plan_json TEXT,
      plan_version INTEGER DEFAULT 0,
      generated_at TEXT,
      last_adjusted_at TEXT,
      current_phase_index INTEGER DEFAULT 0,
      total_phases INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_planned_knowledge (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      directory_id TEXT,
      subject TEXT NOT NULL,
      node_title TEXT NOT NULL,
      prerequisites_json TEXT DEFAULT '[]',
      estimated_minutes INTEGER DEFAULT 30,
      mastery_target REAL DEFAULT 0.8,
      current_mastery REAL DEFAULT 0,
      status TEXT DEFAULT 'locked',
      seq_order INTEGER DEFAULT 0,
      scheduled_date TEXT,
      completed_at TEXT,
      assessment_type TEXT DEFAULT 'none',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_planned_slots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_date TEXT NOT NULL,
      slot_hour INTEGER,
      subject TEXT,
      activity TEXT,
      knowledge_node_id TEXT,
      duration_minutes INTEGER DEFAULT 30,
      energy_level TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'planned',
      actual_minutes INTEGER,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS zhi_assessment_schedule (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      knowledge_node_id TEXT,
      subject TEXT NOT NULL,
      scheduled_date TEXT,
      assessment_type TEXT,
      status TEXT DEFAULT 'pending',
      paper_id TEXT,
      score_pct REAL,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_zhi_planned_knowledge_user ON zhi_planned_knowledge(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_zhi_planned_slots_user_date ON zhi_planned_slots(user_id, plan_date);
    CREATE INDEX IF NOT EXISTS idx_zhi_assessment_schedule_user ON zhi_assessment_schedule(user_id, status);
  `);
}

// ── 公开 API ──

/**
 * 获取或初始化用户的自主规划状态
 */
export function getOrCreatePlan(userId: string): AutonomousPlanDto {
  const cached = getCachedPlan(userId);
  if (cached) return cached;

  ensureSchema();
  const uidStr = userId.trim();
  const db = getLearningDb();

  let plan = db.prepare(`SELECT * FROM zhi_autonomous_plans WHERE user_id = ?`).get(uidStr) as Record<string, unknown> | undefined;

  if (!plan) {
    db.prepare(`
      INSERT INTO zhi_autonomous_plans (user_id, status, created_at, updated_at)
      VALUES (?, 'uninitialized', datetime('now'), datetime('now'))
    `).run(uidStr);
    plan = db.prepare(`SELECT * FROM zhi_autonomous_plans WHERE user_id = ?`).get(uidStr) as Record<string, unknown>;
  }

  const result = buildPlanDto(uidStr, plan);
  setCachedPlan(userId, result);
  return result;
}

/**
 * 分析用户数据缺口
 */
export function assessDataGaps(userId: string): { gaps: DataGapItem[]; completeness: number; canPlan: boolean } {
  const uidStr = userId.trim();
  const anchor = getSchoolAnchorProfile(uidStr);
  const baseline = getBaselineStatus(uidStr);
  const parsedBaseline = baseline ? parseBaseline(baseline) : null;

  const gaps: DataGapItem[] = [];

  if (!anchor?.school?.trim()) {
    gaps.push({ field: 'target_school', label: '梦校目标', description: '目标大学/学院', priority: 'high' });
  }
  if (!anchor?.major?.trim()) {
    gaps.push({ field: 'target_major', label: '目标专业', description: '想学的专业', priority: 'high' });
  }
  if (!anchor?.currentGrade?.trim()) {
    gaps.push({ field: 'current_grade', label: '当前年级', description: '在读年级', priority: 'high' });
  }
  if (!anchor?.targetApplyAt?.trim()) {
    gaps.push({ field: 'target_date', label: '目标入学时间', description: '预计申请/考试时间', priority: 'high' });
  }

  if (!parsedBaseline || Object.keys(parsedBaseline.currentScores).length === 0) {
    gaps.push({ field: 'baseline_scores', label: '当前成绩基线', description: '各科当前成绩/水平', priority: 'high' });
  }

  if (!parsedBaseline || parsedBaseline.weakSubjects.length === 0) {
    gaps.push({ field: 'weak_subjects', label: '薄弱科目', description: '需要重点提升的科目', priority: 'medium' });
  }

  if (parsedBaseline && parsedBaseline.estimatedHoursPerDay === null) {
    gaps.push({ field: 'study_hours', label: '每日学习时间', description: '每天可用学习小时数', priority: 'medium' });
  }

  const missingHigh = gaps.filter(g => g.priority === 'high').length;
  const totalFields = 7;
  const presentFields = totalFields - gaps.length;
  const completeness = Math.round((presentFields / totalFields) * 100);

  const canPlan = missingHigh === 0;

  return { gaps, completeness, canPlan };
}

/**
 * 生成主动数据采集请求（当用户未主动提供数据时调用）
 */
export function generateDataRequest(userId: string): DataCollectionRequest | null {
  const uid = userId.trim();
  const { gaps } = assessDataGaps(uid);
  if (gaps.length === 0) return null;

  const db = getLearningDb();
  const requestId = newId();

  const questions: string[] = [];
  for (const gap of gaps) {
    switch (gap.field) {
      case 'target_school':
        questions.push('你的梦校是哪所大学？（例如：清华大学、CMU、牛津）');
        break;
      case 'target_major':
        questions.push('你想学的专业是什么？（例如：计算机、数学、经济学）');
        break;
      case 'current_grade':
        questions.push('你现在在读几年级？');
        break;
      case 'target_date':
        questions.push('你预计什么时候申请/参加考试？（YYYY-MM-DD）');
        break;
      case 'baseline_scores':
        questions.push('请告诉我你各科目前的成绩/水平（可以发一张试卷/成绩单照片）');
        break;
      case 'weak_subjects':
        questions.push('你觉得哪些科目比较薄弱，需要重点提升？');
        break;
      case 'study_hours':
        questions.push('你每天大概能花多少时间在学习上？');
        break;
    }
  }

  const request: DataCollectionRequest = {
    requestId,
    questions,
    gaps,
    priority: gaps.some(g => g.priority === 'high') ? 'high' : 'medium',
    createdAt: nowStr(),
  };

  db.prepare(`UPDATE zhi_autonomous_plans SET
    status = 'gathering_data',
    data_gaps_json = ?,
    active_request_json = ?,
    updated_at = datetime('now')
  WHERE user_id = ?`).run(
    JSON.stringify(gaps),
    JSON.stringify(request),
    uid,
  );

  return request;
}

/**
 * 用户提交数据响应后，处理并更新规划状态
 */
export async function submitUserData(
  userId: string,
  data: Record<string, string>,
): Promise<{ ok: boolean; nextAction: string; plan?: AutonomousPlanDto }> {
  const uid = userId.trim();
  const db = getLearningDb();

  const plan = db.prepare(`SELECT * FROM zhi_autonomous_plans WHERE user_id = ?`).get(uid) as Record<string, unknown> | undefined;
  if (!plan) {
    getOrCreatePlan(uid);
  }

  // Sync anchor data to the authoritative zhi-cloud-schema
  const anchor = getSchoolAnchorProfile(uid);
  const school = data.target_school || data.school || anchor?.school || '';
  const major = data.target_major || data.major || anchor?.major || '';
  const currentGrade = data.current_grade || data.grade || anchor?.currentGrade || '';
  const targetApplyAt = data.target_date || data.exam_date || anchor?.targetApplyAt || '';

  if (school || major || currentGrade || targetApplyAt) {
    try {
      await syncAnchorDirectories({
        userId: uid,
        school,
        major,
        currentGrade,
        targetApplyAt,
        currentSchool: anchor?.currentSchool || data.current_school || '',
        currentRegion: anchor?.currentRegion || data.current_region || '',
        targetSchoolRegion: anchor?.targetSchoolRegion || data.target_region || '',
      });
    } catch (err) {
      console.warn(`[AutonomousPlanner] syncAnchorDirectories failed:`, err);
    }
  }

  // Sync scores/weak subjects to baseline
  const scores: Record<string, string> = {};
  if (data.baseline_scores) {
    try {
      const parsed = JSON.parse(data.baseline_scores);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.assign(scores, parsed);
      }
    } catch {
      scores['综合评估'] = data.baseline_scores;
    }
  }
  const weakSubjects: string[] = data.weak_subjects
    ? data.weak_subjects.split(/[,，、\s]+/).filter(Boolean)
    : [];

  if (Object.keys(scores).length > 0 || weakSubjects.length > 0) {
    try {
      const { applyStructuredBaseline } = await import('./zhi-baseline-intake');
      applyStructuredBaseline(uid, { scores, weakSubjects });
    } catch (err) {
      console.warn(`[AutonomousPlanner] applyStructuredBaseline failed:`, err);
    }
  }

  // Update local planner table
  if (school) {
    db.prepare(`UPDATE zhi_autonomous_plans SET target_school = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(school, uid);
  }
  if (major) {
    db.prepare(`UPDATE zhi_autonomous_plans SET target_major = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(major, uid);
  }
  if (targetApplyAt) {
    db.prepare(`UPDATE zhi_autonomous_plans SET exam_date = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(targetApplyAt, uid);
  }

  const { gaps, completeness, canPlan } = assessDataGaps(uid);

  if (canPlan) {
    invalidatePlanCache(uid);
  db.prepare(`UPDATE zhi_autonomous_plans SET status = 'planned', data_gaps_json = '[]', active_request_json = NULL, updated_at = datetime('now') WHERE user_id = ?`)
      .run(uid);
    return { ok: true, nextAction: 'generate_plan' };
  }

  db.prepare(`UPDATE zhi_autonomous_plans SET data_gaps_json = ?, updated_at = datetime('now') WHERE user_id = ?`)
    .run(JSON.stringify(gaps), uid);

  invalidatePlanCache(uid);
  return {
    ok: true,
    nextAction: gaps.length > 0 ? 'collect_more_data' : 'ready',
    plan: getOrCreatePlan(uid),
  };
}

/**
 * 生成完整规划（核心 LLM 驱动）
 */
export async function generatePlan(userId: string): Promise<AutonomousPlanDto> {
  const uid = userId.trim();
  const db = getLearningDb();

  const anchor = getSchoolAnchorProfile(uid);
  const baseline = getBaselineStatus(uid);
  const parsedBaseline = baseline ? parseBaseline(baseline) : null;
  if (!anchor?.school?.trim()) {
    throw new Error('请先完成梦校航标设置');
  }

  const today = localDateStr(0);
  const daysRemaining = anchor?.targetApplyAt
    ? daysBetween(today, anchor.targetApplyAt)
    : 365;
  const scores = parsedBaseline?.currentScores ?? {};
  const weakSubjects = parsedBaseline?.weakSubjects ?? [];
  const hoursPerDay = parsedBaseline?.estimatedHoursPerDay ?? null;
  const pathway = detectSchoolPathway(anchor.school, anchor.major, {
    currentSchool: anchor.currentSchool ?? '',
    currentRegion: anchor.currentRegion ?? '',
    targetSchoolRegion: anchor.targetSchoolRegion ?? '',
    currentGrade: anchor.currentGrade ?? '',
  });

  const llmInput: PlanGenerationInput = {
    anchor: {
      school: anchor.school,
      major: anchor.major,
      currentGrade: anchor.currentGrade ?? '',
      targetApplyAt: anchor.targetApplyAt ?? '',
      currentSchool: anchor.currentSchool ?? '',
    },
    baseline: {
      scores,
      weakSubjects,
      hoursPerDay,
    },
    daysRemaining,
    pathway,
  };

  let planResult: {
    planSummary: string;
    phases: Array<{ index: number; name: string; focusSubject: string; targetOutcome: string; weekCount: number }>;
    knowledgeNodes: Array<{
      subject: string;
      nodeTitle: string;
      prerequisites: string[];
      estimatedMinutes: number;
      masteryTarget: number;
      phaseIndex: number;
      assessmentType: string;
      seqOrder: number;
    }>;
    weeklyRhythm: Record<string, { subject: string; hours: number; focus: string }>;
    assessmentCadence: string;
  } | null = null;

  const llm = resolveUserLlm(uid);
  if (llm || process.env.DEEPSEEK_API_KEY?.trim()) {
    const gw = await gatewayJsonCompletion<typeof planResult>(uid, [
      { role: 'system', content: PLAN_GENERATION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `【梦校】${anchor.school} · ${anchor.major}`,
          `【当前年级】${anchor.currentGrade ?? '未知'}`,
          `【入学时间】${anchor.targetApplyAt ?? '未知'}`,
          `【剩余天数】${daysRemaining}`,
          `【升学路径】${PATHWAY_LABEL[pathway] ?? pathway}`,
          `【当前成绩】${JSON.stringify(scores)}`,
          `【薄弱科目】${JSON.stringify(weakSubjects)}`,
          `【每日可用小时】${hoursPerDay ?? '未知'}`,
          `【当前学校】${anchor.currentSchool ?? '未知'}`,
        ].join('\n'),
      },
    ], {
      traceId: `plan_generate_${uid}`,
      maxTokens: 4096,
      temperature: 0.5,
      flatWarp: { cost: WARP_COST.PLANNER_REGEN, reason: 'AUTONOMOUS_PLAN' },
    });

    if (gw.data) {
      planResult = gw.data;
    }
  }

  if (!planResult) {
    planResult = generateFallbackPlan(llmInput);
  }

  // Convert LLM output to database records
  const dbInsert = db.transaction(() => {
    db.prepare(`DELETE FROM zhi_planned_knowledge WHERE user_id = ?`).run(uid);
    db.prepare(`DELETE FROM zhi_planned_slots WHERE user_id = ?`).run(uid);
    db.prepare(`DELETE FROM zhi_assessment_schedule WHERE user_id = ?`).run(uid);

    // Calculate phase dates
    const phaseDates = calculatePhaseDates(planResult!.phases, today, daysRemaining);

    // Insert knowledge nodes
    const insertNode = db.prepare(`
      INSERT INTO zhi_planned_knowledge (id, user_id, directory_id, subject, node_title, prerequisites_json, estimated_minutes, mastery_target, current_mastery, status, seq_order, scheduled_date, assessment_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'locked', ?, ?, ?, datetime('now'))
    `);

    for (let i = 0; i < planResult!.knowledgeNodes.length; i++) {
      const kn = planResult!.knowledgeNodes[i];
      const nodeId = `kp_${newId()}`;

      const phase = phaseDates.find(p => p.index === kn.phaseIndex);
      const scheduledDate = phase ? localDateStr(
        Math.floor(
          daysBetween(today, phase.startDate) +
          (i / Math.max(planResult!.knowledgeNodes.length, 1)) * daysBetween(phase.startDate, phase.endDate)
        )
      ) : null;

      insertNode.run(
        nodeId, uid, null,
        kn.subject, kn.nodeTitle, JSON.stringify(kn.prerequisites),
        kn.estimatedMinutes, kn.masteryTarget,
        kn.seqOrder, scheduledDate, kn.assessmentType,
      );
    }

    // Unlock first phase nodes
    const firstPhase = planResult!.phases[0]?.index ?? 0;
    db.prepare(`UPDATE zhi_planned_knowledge SET status = 'available' WHERE user_id = ? AND seq_order <= 3 AND status = 'locked'`).run(uid);

    // Generate time slots based on weekly rhythm
    const insertSlot = db.prepare(`
      INSERT INTO zhi_planned_slots (id, user_id, plan_date, slot_hour, subject, activity, knowledge_node_id, duration_minutes, energy_level, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'medium', 'planned', datetime('now'))
    `);

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const maxPlanDays = planResult!.phases.reduce((sum, p) => sum + (p.weekCount || 4) * 7, 0);
    const slotDaysCeiling = Math.min(daysRemaining, maxPlanDays || 90, 365);

    for (let dayOffset = 0; dayOffset < slotDaysCeiling; dayOffset++) {
      const date = localDateStr(dayOffset);
      const dayIndex = new Date(date).getDay();
      const dayKey = dayNames[dayIndex];
      const dayRhythm = planResult!.weeklyRhythm[dayKey];

      if (dayRhythm && dayRhythm.subject && dayRhythm.hours > 0) {
        const totalMinutes = Math.round(dayRhythm.hours * 60);
        const slotsPerDay = Math.max(1, Math.round(totalMinutes / 45));

        for (let slot = 0; slot < slotsPerDay; slot++) {
          const slotMinutes = slot === slotsPerDay - 1
            ? totalMinutes - slot * 45
            : 45;
          if (slotMinutes < 15) continue;

          const hour = 9 + slot * 2;

          const availableNodes = db.prepare(
            `SELECT id, node_title FROM zhi_planned_knowledge WHERE user_id = ? AND subject = ? AND status IN ('available','in_progress') AND (scheduled_date IS NULL OR scheduled_date <= ?) ORDER BY seq_order ASC LIMIT 1`
          ).all(uid, dayRhythm.subject, date) as Array<{ id: string; node_title: string }>;

          const nodeId = availableNodes[0]?.id ?? null;
          const activity = nodeId
            ? `攻克：${availableNodes[0].node_title}`
            : `${dayRhythm.focus || dayRhythm.subject} 学习`;

          insertSlot.run(
            newId(), uid, date, hour,
            dayRhythm.subject, activity, nodeId,
            Math.max(15, slotMinutes),
          );
        }
      }
    }

    // Generate assessment schedule
    const insertAssessment = db.prepare(`
      INSERT INTO zhi_assessment_schedule (id, user_id, knowledge_node_id, subject, scheduled_date, assessment_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `);

    const assessmentNodes = db.prepare(
      `SELECT id, subject, scheduled_date FROM zhi_planned_knowledge WHERE user_id = ? AND assessment_type != 'none' ORDER BY seq_order ASC`
    ).all(uid) as Array<{ id: string; subject: string; scheduled_date: string | null }>;

    for (const node of assessmentNodes.slice(0, 20)) {
      if (node.scheduled_date) {
        insertAssessment.run(
          newId(), uid, node.id, node.subject,
          node.scheduled_date, 'knowledge_check',
        );
      }
    }

    // Schedule weekly mock assessments
    for (let weekOffset = 0; weekOffset < Math.min(Math.ceil(daysRemaining / 7), 12); weekOffset++) {
      const satDate = localDateStr(weekOffset * 7 + 5);
      insertAssessment.run(
        newId(), uid, null, '综合',
        satDate, 'full_mock',
      );
    }

    // Update plan state
    const totalPhases = planResult!.phases.length;
    db.prepare(`UPDATE zhi_autonomous_plans SET
      status = 'active',
      plan_version = plan_version + 1,
      plan_json = ?,
      generated_at = datetime('now'),
      current_phase_index = 0,
      total_phases = ?,
      current_ability_label = ?,
      updated_at = datetime('now')
    WHERE user_id = ?`).run(
      JSON.stringify(planResult),
      totalPhases,
      determineAbilityLevel(scores, weakSubjects),
      uid,
    );
  });

  dbInsert();
  invalidatePlanCache(uid);

  return getOrCreatePlan(uid);
}

/**
 * 获取今天的规划
 */
export function getTodayPlan(userId: string): {
  date: string;
  slots: TimeSlot[];
  knowledgeNodes: KnowledgePlanNode[];
  pendingAssessment: AssessmentScheduleItem | null;
} {
  const uid = userId.trim();
  const db = getLearningDb();
  const today = localDateStr(0);

  const slots = db.prepare(
    `SELECT * FROM zhi_planned_slots WHERE user_id = ? AND plan_date = ? ORDER BY slot_hour ASC`
  ).all(uid, today) as Array<Record<string, unknown>>;

  const pendingAssessment = db.prepare(
    `SELECT * FROM zhi_assessment_schedule WHERE user_id = ? AND scheduled_date = ? AND status = 'pending' LIMIT 1`
  ).all(uid, today) as Array<Record<string, unknown>>;

  const todaySubject = slots[0]?.subject as string | undefined;
  let nodes: Array<Record<string, unknown>> = [];
  if (todaySubject) {
    nodes = db.prepare(
      `SELECT * FROM zhi_planned_knowledge WHERE user_id = ? AND subject = ? AND status IN ('available', 'in_progress') ORDER BY seq_order ASC LIMIT 5`
    ).all(uid, todaySubject) as Array<Record<string, unknown>>;
  }

  return {
    date: today,
    slots: slots.map(mapSlot),
    knowledgeNodes: nodes.map(mapKnowledgeNode),
    pendingAssessment: pendingAssessment.length > 0 ? mapAssessment(pendingAssessment[0]) : null,
  };
}

/**
 * 根据评估结果调整规划
 */
export async function adjustPlanFromAssessment(
  userId: string,
  paperId: string,
  scorePct: number,
): Promise<AutonomousPlanDto> {
  const uid = userId.trim();
  const db = getLearningDb();

  const assessment = db.prepare(
    `SELECT * FROM zhi_assessment_schedule WHERE user_id = ? AND paper_id = ?`
  ).get(uid, paperId) as Record<string, unknown> | undefined;

  if (assessment) {
    db.prepare(`UPDATE zhi_assessment_schedule SET status = 'completed', score_pct = ?, completed_at = datetime('now') WHERE id = ?`)
      .run(scorePct, assessment.id);
  }

  const relatedNodeId = assessment?.knowledge_node_id as string | undefined;
  if (relatedNodeId) {
    if (scorePct >= 80) {
      db.prepare(`UPDATE zhi_planned_knowledge SET status = 'mastered', current_mastery = ?, completed_at = datetime('now') WHERE id = ?`)
        .run(scorePct / 100, relatedNodeId);
    } else if (scorePct >= 60) {
      db.prepare(`UPDATE zhi_planned_knowledge SET current_mastery = ? WHERE id = ?`)
        .run(scorePct / 100, relatedNodeId);
      db.prepare(`UPDATE zhi_planned_knowledge SET status = 'available' WHERE id = ? AND prerequisites_json LIKE ?`)
        .run(`%"${relatedNodeId}"%`, relatedNodeId);
    } else {
      db.prepare(`UPDATE zhi_planned_knowledge SET current_mastery = ? WHERE id = ?`)
        .run(scorePct / 100, relatedNodeId);
    }
  }

  if (scorePct >= 80 && relatedNodeId) {
    unlockNextNodes(uid, relatedNodeId);
  }

  if (scorePct < 60 && relatedNodeId) {
    const tomorrow = localDateStr(1);
    db.prepare(`
      INSERT INTO zhi_planned_slots (id, user_id, plan_date, slot_hour, subject, activity, knowledge_node_id, duration_minutes, energy_level, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'high', 'planned', datetime('now'))
    `).run(newId(), uid, tomorrow, 20, '复习巩固', '薄弱知识点强化复习', relatedNodeId, 30);
  }

  invalidatePlanCache(uid);
  db.prepare(`UPDATE zhi_autonomous_plans SET last_adjusted_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?`)
    .run(uid);

  return getOrCreatePlan(uid);
}

/**
 * 主动巡检——检测是否需要干预
 */
export function proactivePatrol(userId: string): {
  needsIntervention: boolean;
  type: 'data_gap' | 'plan_expired' | 'slump_detected' | 'assessment_due' | 'none';
  message: string;
  request: DataCollectionRequest | null;
} {
  const uid = userId.trim();
  const plan = getOrCreatePlan(uid);

  if (plan.status === 'uninitialized' || plan.dataGaps.length > 0) {
    const request = generateDataRequest(uid);
    return {
      needsIntervention: true,
      type: 'data_gap',
      message: `缺少关键规划数据：${plan.dataGaps.map(g => g.label).join('、')}。请先完成数据填写。`,
      request,
    };
  }

  if (plan.status === 'gathering_data') {
    return {
      needsIntervention: true,
      type: 'data_gap',
      message: '等待你提供数据后才能生成完整规划。请回答上面的问题。',
      request: null,
    };
  }

  if (plan.status === 'planned') {
    return {
      needsIntervention: true,
      type: 'plan_expired',
      message: '规划已就绪，需要启动执行。是否开始执行规划？',
      request: null,
    };
  }

  const today = localDateStr(0);
  const db = getLearningDb();

  const dueAssessment = db.prepare(
    `SELECT * FROM zhi_assessment_schedule WHERE user_id = ? AND scheduled_date <= ? AND status = 'pending' ORDER BY scheduled_date ASC LIMIT 1`
  ).get(uid, today) as Record<string, unknown> | undefined;

  if (dueAssessment) {
    return {
      needsIntervention: true,
      type: 'assessment_due',
      message: `今天有 ${dueAssessment.subject} 的评估测试，请完成。`,
      request: null,
    };
  }

  const recentSlots = db.prepare(
    `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done FROM zhi_planned_slots WHERE user_id = ? AND plan_date >= ? AND plan_date <= ?`
  ).get(uid, localDateStr(-3), today) as { total: number; done: number } | undefined;

  if (recentSlots && recentSlots.total >= 3 && recentSlots.done / recentSlots.total < 0.3) {
    return {
      needsIntervention: true,
      type: 'slump_detected',
      message: `最近完成率仅 ${Math.round(recentSlots.done / recentSlots.total * 100)}%，是否需要调整计划强度？`,
      request: null,
    };
  }

  return {
    needsIntervention: false,
    type: 'none',
    message: '一切按计划进行。',
    request: null,
  };
}

/**
 * 标记时间段为已完成
 */
export function completeSlot(userId: string, slotId: string, actualMinutes?: number): { ok: boolean } {
  const uid = userId.trim();
  const db = getLearningDb();

  const slot = db.prepare(`SELECT * FROM zhi_planned_slots WHERE id = ? AND user_id = ?`).get(slotId, uid) as Record<string, unknown> | undefined;
  if (!slot) return { ok: false };

  invalidatePlanCache(uid);
  db.prepare(`UPDATE zhi_planned_slots SET status = 'completed', actual_minutes = ?, completed_at = datetime('now') WHERE id = ?`)
    .run(actualMinutes ?? slot.duration_minutes, slotId);

  const nodeId = slot.knowledge_node_id as string | null;
  if (nodeId) {
    const node = db.prepare(`SELECT * FROM zhi_planned_knowledge WHERE id = ?`).get(nodeId) as Record<string, unknown> | undefined;
    if (node && node.status === 'available') {
      db.prepare(`UPDATE zhi_planned_knowledge SET status = 'in_progress' WHERE id = ?`).run(nodeId);
    }
  }

  return { ok: true };
}

/**
 * 启动规划执行（从 planned → active）
 */
export function activatePlan(userId: string): { ok: boolean; plan: AutonomousPlanDto } {
  const uid = userId.trim();
  const db = getLearningDb();

  const plan = db.prepare(`SELECT * FROM zhi_autonomous_plans WHERE user_id = ?`).get(uid) as Record<string, unknown> | undefined;
  if (!plan || plan.status !== 'planned') {
    return { ok: false, plan: getOrCreatePlan(uid) };
  }

  invalidatePlanCache(uid);
  db.prepare(`UPDATE zhi_autonomous_plans SET status = 'active', updated_at = datetime('now') WHERE user_id = ?`).run(uid);

  return { ok: true, plan: getOrCreatePlan(uid) };
}

/**
 * 重规划——强制重新生成
 */
export async function replan(userId: string): Promise<AutonomousPlanDto> {
  const uid = userId.trim();
  const db = getLearningDb();

  invalidatePlanCache(uid);
  db.prepare(`UPDATE zhi_autonomous_plans SET status = 'planned', updated_at = datetime('now') WHERE user_id = ?`).run(uid);

  return generatePlan(uid);
}

// ── 内部辅助 ──

function buildPlanDto(userId: string, planRow: Record<string, unknown>): AutonomousPlanDto {
  const uid = userId.trim();
  const db = getLearningDb();
  const anchor = getSchoolAnchorProfile(uid);

  const dataGapsJson = (planRow.data_gaps_json as string) ?? '[]';
  const gaps: DataGapItem[] = JSON.parse(dataGapsJson);
  const activeRequestJson = (planRow.active_request_json as string) ?? null;
  const pendingRequest: DataCollectionRequest | null = activeRequestJson ? JSON.parse(activeRequestJson) : null;

  const planJson = (planRow.plan_json as string) ?? null;
  const phases: PhaseInfo[] = [];

  if (planJson) {
    const parsed = JSON.parse(planJson);
    const phs = parsed.phases as Array<{ index: number; name: string; focusSubject: string; targetOutcome: string; weekCount: number }> | undefined;
    if (phs) {
      const today = localDateStr(0);
      let cursor = new Date(today);
      for (const p of phs) {
        const startDate = new Date(cursor);
        cursor.setDate(cursor.getDate() + (p.weekCount || 4) * 7);
        const endDate = new Date(cursor);
        phases.push({
          index: p.index,
          name: p.name,
          startDate: startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
          focusSubject: p.focusSubject,
          targetOutcome: p.targetOutcome,
        });
      }
    }
  }

  const currentPhaseIndex = (planRow.current_phase_index as number) ?? 0;
  const today = localDateStr(0);

  const knowledgeNodes = db.prepare(
    `SELECT * FROM zhi_planned_knowledge WHERE user_id = ? ORDER BY seq_order ASC LIMIT 30`
  ).all(uid) as Array<Record<string, unknown>>;

  const todaySlots = db.prepare(
    `SELECT * FROM zhi_planned_slots WHERE user_id = ? AND plan_date = ? ORDER BY slot_hour ASC`
  ).all(uid, today) as Array<Record<string, unknown>>;

  const nextAssessment = db.prepare(
    `SELECT * FROM zhi_assessment_schedule WHERE user_id = ? AND status = 'pending' ORDER BY scheduled_date ASC LIMIT 1`
  ).all(uid) as Array<Record<string, unknown>>;

  const examDate = (planRow.exam_date as string) ?? anchor?.targetApplyAt ?? null;
  const daysUntilExam = examDate ? daysBetween(today, examDate) : null;

  const { completeness } = assessDataGaps(uid);

  return {
    userId: uid,
    status: (planRow.status as PlanStatus) ?? 'uninitialized',
    targetSchool: (planRow.target_school as string) ?? anchor?.school ?? '',
    targetMajor: (planRow.target_major as string) ?? anchor?.major ?? '',
    examDate,
    daysUntilExam,
    currentPhase: phases.length > currentPhaseIndex ? phases[currentPhaseIndex] : null,
    phases,
    dataGaps: gaps,
    pendingRequest,
    planSummary: planJson ? (JSON.parse(planJson).planSummary ?? '') : '',
    knowledgeNodes: knowledgeNodes.map(mapKnowledgeNode),
    todaySlots: todaySlots.map(mapSlot),
    nextAssessment: nextAssessment.length > 0 ? mapAssessment(nextAssessment[0]) : null,
    dataCompleteness: completeness,
  };
}

function mapKnowledgeNode(row: Record<string, unknown>): KnowledgePlanNode {
  return {
    id: row.id as string,
    subject: row.subject as string,
    nodeTitle: row.node_title as string,
    prerequisites: JSON.parse((row.prerequisites_json as string) ?? '[]'),
    estimatedMinutes: (row.estimated_minutes as number) ?? 30,
    masteryTarget: (row.mastery_target as number) ?? 0.8,
    currentMastery: (row.current_mastery as number) ?? 0,
    status: (row.status as string) ?? 'locked',
    seqOrder: (row.seq_order as number) ?? 0,
    scheduledDate: (row.scheduled_date as string) ?? null,
    assessmentType: (row.assessment_type as string) ?? 'none',
  };
}

function mapSlot(row: Record<string, unknown>): TimeSlot {
  return {
    id: row.id as string,
    planDate: row.plan_date as string,
    slotHour: (row.slot_hour as number) ?? 9,
    subject: (row.subject as string) ?? '',
    activity: (row.activity as string) ?? '',
    knowledgeNodeId: (row.knowledge_node_id as string) ?? null,
    durationMinutes: (row.duration_minutes as number) ?? 30,
    energyLevel: (row.energy_level as string) ?? 'medium',
    status: (row.status as string) ?? 'planned',
  };
}

function mapAssessment(row: Record<string, unknown>): AssessmentScheduleItem {
  return {
    id: row.id as string,
    subject: (row.subject as string) ?? '',
    scheduledDate: (row.scheduled_date as string) ?? '',
    assessmentType: (row.assessment_type as string) ?? '',
    status: (row.status as string) ?? 'pending',
    paperId: (row.paper_id as string) ?? null,
    scorePct: (row.score_pct as number) ?? null,
  };
}

function unlockNextNodes(userId: string, completedNodeId: string): void {
  const db = getLearningDb();
  const lockedNodes = db.prepare(
    `SELECT id, prerequisites_json FROM zhi_planned_knowledge WHERE user_id = ? AND status = 'locked'`
  ).all(userId) as Array<{ id: string; prerequisites_json: string }>;

  for (const node of lockedNodes) {
    const prereqs: string[] = JSON.parse(node.prerequisites_json);
    if (!prereqs.includes(completedNodeId)) continue;
    const allCompleted = prereqs.every(prId => {
      const pr = db.prepare(`SELECT status FROM zhi_planned_knowledge WHERE id = ?`).get(prId) as { status: string } | undefined;
      return pr?.status === 'mastered';
    });
    if (allCompleted) {
      db.prepare(`UPDATE zhi_planned_knowledge SET status = 'available' WHERE id = ?`).run(node.id);
    }
  }
}

function determineAbilityLevel(scores: Record<string, string>, weakSubjects: string[]): string {
  const scoreValues = Object.values(scores).map(v => {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  });
  if (scoreValues.length === 0) return 'unknown';
  const avg = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
  const weakCount = weakSubjects.length;
  if (avg >= 85 && weakCount <= 1) return 'advanced';
  if (avg >= 70 && weakCount <= 3) return 'intermediate';
  if (avg >= 50) return 'foundational';
  return 'beginner';
}

function calculatePhaseDates(
  phases: Array<{ index: number; weekCount: number }>,
  startDateStr: string,
  totalDays: number,
): Array<{ index: number; startDate: string; endDate: string }> {
  const start = new Date(startDateStr);
  const totalWeeks = phases.reduce((sum, p) => sum + (p.weekCount || 4), 0);
  const result: Array<{ index: number; startDate: string; endDate: string }> = [];
  let cursor = new Date(start);

  for (const phase of phases) {
    const phaseWeeks = phase.weekCount || Math.max(2, Math.floor(totalWeeks / phases.length));
    const phaseStart = new Date(cursor);
    cursor.setDate(cursor.getDate() + phaseWeeks * 7);
    const phaseEnd = new Date(cursor);
    result.push({
      index: phase.index,
      startDate: phaseStart.toISOString().slice(0, 10),
      endDate: phaseEnd.toISOString().slice(0, 10),
    });
  }

  return result;
}

function generateFallbackPlan(input: PlanGenerationInput): {
  planSummary: string;
  phases: Array<{ index: number; name: string; focusSubject: string; targetOutcome: string; weekCount: number }>;
  knowledgeNodes: Array<{
    subject: string;
    nodeTitle: string;
    prerequisites: string[];
    estimatedMinutes: number;
    masteryTarget: number;
    phaseIndex: number;
    assessmentType: string;
    seqOrder: number;
  }>;
  weeklyRhythm: Record<string, { subject: string; hours: number; focus: string }>;
  assessmentCadence: string;
} {
  const weakList = input.baseline.weakSubjects.length > 0
    ? input.baseline.weakSubjects
    : Object.keys(input.baseline.scores).length > 0
      ? Object.entries(input.baseline.scores)
        .sort(([, a], [, b]) => parseFloat(a) - parseFloat(b))
        .slice(0, 3)
        .map(([subj]) => subj)
      : ['数学', '英语'];

  const primarySubject = weakList[0];
  const secondarySubject = weakList.length > 1 ? weakList[1] : '综合';
  const daysRem = input.daysRemaining;
  const phaseCount = daysRem > 180 ? 4 : daysRem > 90 ? 3 : 2;
  const weeksPerPhase = Math.max(4, Math.floor(daysRem / 7 / phaseCount));

  const subjects = [...new Set([primarySubject, secondarySubject, ...weakList])];

  const nodes: Array<{
    subject: string;
    nodeTitle: string;
    prerequisites: string[];
    estimatedMinutes: number;
    masteryTarget: number;
    phaseIndex: number;
    assessmentType: string;
    seqOrder: number;
    _tempId: string;
  }> = [];

  let seq = 1;
  for (let phase = 0; phase < phaseCount; phase++) {
    for (let s = 0; s < subjects.length; s++) {
      for (let n = 0; n < 3; n++) {
        const phaseName = phase === 0 ? '基础' : phase === phaseCount - 1 ? '冲刺' : '强化';
        const nodeId = `fb_${newId()}`;
        const prevNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;
        nodes.push({
          subject: subjects[s],
          nodeTitle: `${subjects[s]} ${phaseName}阶段 · 第${n + 1}单元`,
          prerequisites: prevNode ? [prevNode._tempId] : [],
          estimatedMinutes: phase === 0 ? 45 : phase === phaseCount - 1 ? 60 : 50,
          masteryTarget: phase === phaseCount - 1 ? 0.9 : 0.8,
          phaseIndex: phase,
          assessmentType: n === 2 ? 'chapter_test' : 'knowledge_check',
          seqOrder: seq++,
          _tempId: nodeId,
        });
      }
    }
  }

  const knowledgeNodes = nodes.map(({ _tempId, ...rest }) => rest);

  return {
    planSummary: `${primarySubject}为主攻方向，${daysRem}天分${phaseCount}阶段，从基础到冲刺`,
    phases: Array.from({ length: phaseCount }, (_, i) => ({
      index: i,
      name: i === 0 ? '基础奠基' : i === phaseCount - 1 ? '极限冲刺' : '能力强化',
      focusSubject: i === 0 ? primarySubject : weakList[Math.min(i - 1, weakList.length - 1)],
      targetOutcome: i === 0 ? '掌握核心基础概念' : i === phaseCount - 1 ? '全真模考达到目标分数' : '突破薄弱环节',
      weekCount: weeksPerPhase,
    })),
    knowledgeNodes,
    weeklyRhythm: {
      monday: { subject: primarySubject, hours: 2, focus: '核心知识点' },
      tuesday: { subject: secondarySubject, hours: 1.5, focus: '基础练习' },
      wednesday: { subject: primarySubject, hours: 2, focus: '难点突破' },
      thursday: { subject: secondarySubject, hours: 1.5, focus: '错题回顾' },
      friday: { subject: primarySubject, hours: 2, focus: '综合训练' },
      saturday: { subject: '综合', hours: 3, focus: '模考/测验' },
      sunday: { subject: '复盘', hours: 1, focus: '错题归档与下周计划' },
    },
    assessmentCadence: '每章结束后立即评估，每周六模考',
  };
}
