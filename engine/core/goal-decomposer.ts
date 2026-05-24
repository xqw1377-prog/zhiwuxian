/**
 * WUXIAN · 目标智能拆解器
 * LLM 智能拆解 + 专家路径模板库 · 双螺旋结构
 *
 * 逻辑：模板库匹配大类 → 规则引擎个性化前 7 天原子任务
 * （LLM 层预留接口，当前用高保真规则引擎模拟）
 */

import { templateStore, categoryToArchetype } from '../bridge/template-store';
import type { AdminTemplatePayload } from '../bridge/types';
import { GOAL_TEMPLATES, ARCHETYPE_KEYWORDS } from './wuxian-core-engine';
import type { GoalArchetype } from './persona-switcher';
import type { AtomTaskDTO } from './atom-forge';

export interface DecomposeInput {
  goal: string;
  totalDays: number;
  currentStatus?: string;
  dailyMinutesAvailable?: number;
  talentHint?: string;
}

export interface DecomposeResult {
  archetype: GoalArchetype;
  category: string;
  matchedTemplate: AdminTemplatePayload | null;
  matchSource: 'template_library' | 'keyword_engine' | 'llm_fallback';
  evolutionPath: string;
  firstWeekTasks: AtomTaskDTO[];
  milestonePreview: { phase: number; name: string; energyPct: number }[];
  decomposeNote: string;
}

const SAAS_KEYWORDS: Record<string, string[]> = {
  'tpl-cert-30d': ['考', '证', 'SAT', '托福', '雅思', '高考', '提分', '刷题', '录取'],
  'tpl-english-365d': ['英语', '流利', '口语', '语言', '阅读', '每天'],
  'tpl-artshow-180d': ['画展', '美术', '作品', '艺术', '策展', '创作'],
};

const SAAS_EXTRA: AdminTemplatePayload[] = [
  {
    templateId: 'tpl-saas-90d',
    title: '90天 SaaS 产品开发',
    goalCategory: 'CREATIVE',
    totalBaseEnergy: 1400,
    standardDays: 90,
    isDeadlineFixed: true,
    version: 0,
    standardMilestones: [
      { phase: 1, description: '需求验证与 MVP 定义', energyPercentage: 0.20 },
      { phase: 2, description: '核心功能开发', energyPercentage: 0.35 },
      { phase: 3, description: '内测与迭代', energyPercentage: 0.25 },
      { phase: 4, description: '上线与获客', energyPercentage: 0.20 },
    ],
  },
  {
    templateId: 'tpl-kaoyan-180d',
    title: '180天考研冲刺',
    goalCategory: 'HARDCORE',
    totalBaseEnergy: 1600,
    standardDays: 180,
    isDeadlineFixed: true,
    version: 0,
    standardMilestones: [
      { phase: 1, description: '基础回顾与知识框架', energyPercentage: 0.25 },
      { phase: 2, description: '真题攻坚', energyPercentage: 0.40 },
      { phase: 3, description: '模考冲刺', energyPercentage: 0.25 },
      { phase: 4, description: '考前调整', energyPercentage: 0.10 },
    ],
  },
];

function matchTemplate(goal: string): { template: AdminTemplatePayload | null; source: DecomposeResult['matchSource'] } {
  const text = goal.toLowerCase();
  const allTemplates = [...templateStore.list(), ...SAAS_EXTRA];

  let best: AdminTemplatePayload | null = null;
  let bestScore = 0;

  for (const tpl of allTemplates) {
    const keywords = SAAS_KEYWORDS[tpl.templateId] ?? [];
    const titleScore = tpl.title.split(/[\s·]/).filter(w => text.includes(w.toLowerCase())).length;
    const kwScore = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
    const score = titleScore * 2 + kwScore;
    if (score > bestScore) {
      bestScore = score;
      best = tpl;
    }
  }

  if (best && bestScore >= 2) {
    return { template: best, source: 'template_library' };
  }

  let archetypeBest = 'default';
  let archetypeScore = 0;
  for (const [archetype, keywords] of Object.entries(ARCHETYPE_KEYWORDS)) {
    const score = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
    if (score > archetypeScore) {
      archetypeScore = score;
      archetypeBest = archetype;
    }
  }

  if (archetypeScore > 0) {
    const tpl = GOAL_TEMPLATES[archetypeBest] ?? GOAL_TEMPLATES.default;
    return {
      template: null,
      source: 'keyword_engine',
    };
  }

  return { template: null, source: 'llm_fallback' };
}

function classifyArchetype(goal: string, template: AdminTemplatePayload | null): GoalArchetype {
  if (template) return categoryToArchetype(template.goalCategory) as GoalArchetype;
  const text = goal.toLowerCase();
  let best: GoalArchetype = 'clearance';
  let bestScore = 0;
  for (const [archetype, keywords] of Object.entries(ARCHETYPE_KEYWORDS)) {
    const score = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
    if (score > bestScore) {
      bestScore = score;
      best = archetype as GoalArchetype;
    }
  }
  return bestScore > 0 ? best : 'clearance';
}

function personalizeFirstWeek(
  goal: string,
  archetype: GoalArchetype,
  template: AdminTemplatePayload | null,
  dailyMinutes: number,
): AtomTaskDTO[] {
  const tasks: AtomTaskDTO[] = [];
  const baseDuration = Math.min(25, Math.max(10, Math.floor(dailyMinutes / 3)));

  const weekPlan = template?.standardMilestones?.slice(0, 7) ?? [
    { phase: 1, description: '认知觉醒与基线摸底', energyPercentage: 0.15 },
    { phase: 2, description: '核心技能刻意练习', energyPercentage: 0.20 },
    { phase: 3, description: '瓶颈识别与专项突破', energyPercentage: 0.20 },
    { phase: 4, description: '最小可验证动作', energyPercentage: 0.15 },
    { phase: 5, description: '复盘与路径校准', energyPercentage: 0.10 },
    { phase: 6, description: '进阶挑战', energyPercentage: 0.10 },
    { phase: 7, description: '第一周总结', energyPercentage: 0.10 },
  ];

  for (let day = 1; day <= Math.min(7, weekPlan.length); day++) {
    const milestone = weekPlan[day - 1];
    const duration = day === 1 ? Math.min(15, baseDuration) : baseDuration;
    const hour = 9 + (day % 3) * 3;

    tasks.push({
      id: `week1-d${day}-${Date.now().toString(36)}`,
      desc: buildTaskDesc(goal, archetype, milestone.description, duration, day),
      time: duration,
      scheduledAt: day === 1 ? '今日' : `第 ${day} 天`,
      nodeType: archetype,
    });
  }

  return tasks.slice(0, 3);
}

function buildTaskDesc(
  goal: string,
  archetype: GoalArchetype,
  milestone: string,
  minutes: number,
  day: number,
): string {
  const topic = extractTopic(goal, archetype);
  const templates: Record<GoalArchetype, string[]> = {
    clearance: [
      `用 ${minutes} 分钟完成「${topic}」基线摸底（第 ${day} 天）`,
      `限时 ${minutes} 分钟专攻「${milestone}」`,
      `复盘 ${minutes} 分钟：标记 3 个知识缺口`,
    ],
    endurance: [
      `今天用 ${minutes} 分钟打卡「${topic}」`,
      `${minutes} 分钟刻意练习：${milestone}`,
      `睡前 ${minutes} 分钟复习 + 1 条心得`,
    ],
    creation: [
      `用 ${minutes} 分钟推进「${topic}」：${milestone}`,
      `${minutes} 分钟技法练习（不求完美，只求动手）`,
      `整理 ${minutes} 分钟灵感素材`,
    ],
  };
  const pool = templates[archetype];
  return pool[(day - 1) % pool.length];
}

function extractTopic(goal: string, archetype: GoalArchetype): string {
  if (/SaaS|产品|创业|开发/.test(goal)) return 'SaaS MVP';
  if (/考研/.test(goal)) return '考研核心科目';
  if (/托福|雅思|SAT/.test(goal)) return '标化考试';
  if (/高考/.test(goal)) return '高考薄弱项';
  if (archetype === 'creation') return '核心作品';
  if (archetype === 'endurance') return '习惯单元';
  return '核心突破点';
}

export function decomposeGoalSmart(input: DecomposeInput): DecomposeResult {
  templateStore.seedDefaults();

  const { goal, totalDays, dailyMinutesAvailable = 45 } = input;
  const { template, source } = matchTemplate(goal);
  const archetype = classifyArchetype(goal, template);

  const category = template?.title
    ?? (GOAL_TEMPLATES[archetype]?.category ?? '通用目标');

  const milestonePreview = (template?.standardMilestones ?? []).map(m => ({
    phase: m.phase,
    name: m.description,
    energyPct: m.energyPercentage,
  }));

  const firstWeekTasks = personalizeFirstWeek(goal, archetype, template, dailyMinutesAvailable);

  const decomposeNote = template
    ? `模板库命中「${template.title}」，已结合你的 ${totalDays} 天周期个性化前 7 天任务`
    : source === 'keyword_engine'
      ? `关键词引擎匹配「${archetype}」路径，已生成阶梯式起步任务`
      : `智能拆解引擎已为你的非标目标生成最小可行起步路径`;

  return {
    archetype,
    category,
    matchedTemplate: template,
    matchSource: source,
    evolutionPath: template?.templateId ?? `${archetype}-smart-v1`,
    firstWeekTasks,
    milestonePreview,
    decomposeNote,
  };
}

// 导出供引擎层复用
export { GOAL_TEMPLATES, ARCHETYPE_KEYWORDS };
