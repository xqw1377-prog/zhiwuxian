/**
 * WUXIAN · 万能目标逆向拆解引擎
 * =============================================
 * 架构决策：第一核心参数 = B) 当前现状 (Baseline)
 *
 * 以终为始的数学本质：
 *   Gap_Vector = Goal_Vector − Baseline_Vector
 *   Pace       = Gap_Vector / Time_Anchor
 *   Resilience = Drive_Source  (风控层，执行力崩溃时激活)
 *
 * 采集顺序（对话层）：梦想 → Baseline → Time → Drive
 * 计算顺序（引擎层）：Goal Embedding → Baseline Mapping → Gap → Milestones → Atoms
 */

// ─────────────────────────────────────────────
// 1. 认知图谱：知识节点类型
// ─────────────────────────────────────────────

/** @typedef {'knowledge'|'skill'|'physical'|'psychological'|'milestone'|'credential'} NodeType */

/**
 * @typedef {Object} KnowledgeNode
 * @property {string}   id
 * @property {NodeType} type
 * @property {string}   label
 * @property {number}   weight     - 0~1，对终局目标的贡献权重
 * @property {string[]} prerequisites
 */

/**
 * @typedef {Object} GoalVector
 * @property {string}          dream          - 用户原始梦想描述
 * @property {string}          category       - 自动分类标签
 * @property {KnowledgeNode[]} nodes          - 结构化目标向量
 * @property {string}          evolutionPath  - 聚合后的标准进化轨迹 ID
 */

/**
 * @typedef {Object} BaselineProfile
 * @property {string}                userId
 * @property {Record<string, number>} nodeLevels  - nodeId → 当前掌握度 0~1
 * @property {string}                  stage       - 学段/生涯阶段
 * @property {string[]}                spikes      - 已有特长标签
 * @property {string}                  rawInput    - 用户自述现状
 */

/**
 * @typedef {Object} DriveSource
 * @property {string}   why           - 驱动力原文
 * @property {string[]} keywords      - 情感关键词（用于挫折唤醒）
 * @property {number}   intensity     - 自我评估热忱度 1~10
 */

/**
 * @typedef {Object} TimeAnchor
 * @property {number} totalDays
 * @property {Date}   targetDate
 */

/**
 * @typedef {Object} Milestone
 * @property {string} id
 * @property {string} label
 * @property {number} weekIndex
 * @property {number} targetLevel    - 该节点在此时应达到的掌握度
 * @property {'pending'|'active'|'done'|'blocked'} status
 */

/**
 * @typedef {Object} AtomicTask
 * @property {string} id
 * @property {string} milestoneId
 * @property {string} label
 * @property {string} nodeId
 * @property {number} estimatedMinutes
 * @property {'daily'|'weekly'} cadence
 * @property {number} priority       - 1(最高) ~ 5
 */

/**
 * @typedef {Object} DeconstructResult
 * @property {GoalVector}     goal
 * @property {BaselineProfile} baseline
 * @property {GapAnalysis}    gap
 * @property {Milestone[]}    milestones
 * @property {AtomicTask[]}   atoms
 * @property {number}         deviationRisk  - 预估执行力风险 0~1
 */

/**
 * @typedef {Object} GapAnalysis
 * @property {Record<string, number>} nodeGaps   - nodeId → 需弥补的差距
 * @property {number} totalGap                   - 加权总差距 0~1
 * @property {string[]} criticalNodes            - 差距最大、最紧迫的节点
 */

// ─────────────────────────────────────────────
// 2. 梦想向量化：Goal Embedding
// ─────────────────────────────────────────────

/** 预设进化轨迹模板库（后续由 LLM + 知识库动态生成） */
const EVOLUTION_TEMPLATES = {
  'intl-top20': {
    category: '国际名校冲刺',
    nodes: [
      { id: 'sat',       type: 'credential',    label: 'SAT 标化',       weight: 0.20, prerequisites: [] },
      { id: 'ap',        type: 'knowledge',     label: 'AP 学术深度',    weight: 0.20, prerequisites: [] },
      { id: 'spike',     type: 'skill',         label: '个人 Spike 标签', weight: 0.25, prerequisites: [] },
      { id: 'activity',  type: 'milestone',     label: '课外活动矩阵',   weight: 0.15, prerequisites: [] },
      { id: 'essay',     type: 'milestone',     label: '文书叙事线',     weight: 0.10, prerequisites: ['spike'] },
      { id: 'mental',    type: 'psychological', label: '心理韧性',       weight: 0.10, prerequisites: [] },
    ],
    evolutionPath: 'standard-intl-admissions-v1',
  },
  'gaokao': {
    category: '国内高考冲刺',
    nodes: [
      { id: 'score-gap', type: 'knowledge',     label: '分差缺口',       weight: 0.40, prerequisites: [] },
      { id: 'weak-sub',  type: 'knowledge',     label: '薄弱学科突破',   weight: 0.25, prerequisites: [] },
      { id: 'real-exam', type: 'skill',         label: '真题得分率',     weight: 0.20, prerequisites: [] },
      { id: 'mental',    type: 'psychological', label: '考试心理',       weight: 0.15, prerequisites: [] },
    ],
    evolutionPath: 'standard-gaokao-v1',
  },
  'primary': {
    category: '小学趣味成长',
    nodes: [
      { id: 'habit',     type: 'skill',         label: '学习习惯',       weight: 0.30, prerequisites: [] },
      { id: 'wrong-q',   type: 'knowledge',     label: '错题消灭',       weight: 0.30, prerequisites: [] },
      { id: 'reading',   type: 'knowledge',     label: '阅读积累',       weight: 0.20, prerequisites: [] },
      { id: 'curiosity', type: 'psychological', label: '好奇心守护',     weight: 0.20, prerequisites: [] },
    ],
    evolutionPath: 'standard-primary-v1',
  },
  'custom': {
    category: '自定义梦想',
    nodes: [
      { id: 'core-skill', type: 'skill',        label: '核心技能',       weight: 0.40, prerequisites: [] },
      { id: 'foundation', type: 'knowledge',    label: '基础知识',       weight: 0.30, prerequisites: [] },
      { id: 'practice',   type: 'milestone',    label: '刻意练习量',     weight: 0.20, prerequisites: ['core-skill'] },
      { id: 'mental',     type: 'psychological',label: '坚持力',         weight: 0.10, prerequisites: [] },
    ],
    evolutionPath: 'generic-skill-acquisition-v1',
  },
};

/**
 * 将非标准化梦想转化为结构化目标向量
 * @param {string} dreamText
 * @param {string} [sceneHint] - 'intl-top20' | 'gaokao' | 'primary' | 'custom'
 * @returns {GoalVector}
 */
function embedGoal(dreamText, sceneHint = 'custom') {
  const template = EVOLUTION_TEMPLATES[sceneHint] ?? EVOLUTION_TEMPLATES.custom;
  return {
    dream: dreamText,
    category: template.category,
    nodes: template.nodes.map(n => ({ ...n })),
    evolutionPath: template.evolutionPath,
  };
}

// ─────────────────────────────────────────────
// 3. 现状映射：Baseline Mapping（第一核心参数）
// ─────────────────────────────────────────────

/**
 * 将用户自述现状映射到目标向量的节点掌握度
 * Baseline 是整个引擎的计算原点——没有它，Gap 不存在，路径无从谈起。
 *
 * @param {string} rawInput - 用户自述："我高二，AP 考了 3 门，SAT 1400..."
 * @param {GoalVector} goal
 * @param {Object} [hints]
 * @param {string} [hints.stage]
 * @param {string[]} [hints.spikes]
 * @param {Record<string, number>} [hints.levels] - 精确节点掌握度覆盖
 * @returns {BaselineProfile}
 */
function mapBaseline(rawInput, goal, hints = {}) {
  const nodeLevels = {};

  for (const node of goal.nodes) {
    if (hints.levels?.[node.id] !== undefined) {
      nodeLevels[node.id] = clamp(hints.levels[node.id], 0, 1);
    } else {
      nodeLevels[node.id] = estimateNodeLevel(node, rawInput, hints);
    }
  }

  return {
    userId: hints.userId ?? 'anonymous',
    nodeLevels,
    stage: hints.stage ?? inferStage(rawInput),
    spikes: hints.spikes ?? [],
    rawInput,
  };
}

/** 基于关键词启发式估算节点掌握度（后续替换为 LLM 解析） */
function estimateNodeLevel(node, rawInput, hints) {
  const text = rawInput.toLowerCase();
  const patterns = {
    sat:       [[/sat\s*1[5-9]\d{2}/i, 0.7], [/sat\s*1[4-9]\d{2}/i, 0.5], [/sat/i, 0.2]],
    ap:        [[/ap.*\d+\s*门/i, 0.6], [/ap/i, 0.3]],
    spike:     hints.spikes?.length > 0 ? [[/.*/, 0.4]] : [[/.*/, 0.05]],
    'score-gap':[[/(\d{3})\s*分/, 0.5]],
    habit:     [[/每天|坚持|打卡/i, 0.5]],
  };

  const rules = patterns[node.id];
  if (!rules) return 0.1;

  for (const [regex, level] of rules) {
    if (regex.test(text)) return level;
  }
  return 0.1;
}

function inferStage(rawInput) {
  if (/高三|高考/i.test(rawInput)) return '高三';
  if (/高二/i.test(rawInput)) return '高二';
  if (/高一/i.test(rawInput)) return '高一';
  if (/小学|年级/i.test(rawInput)) return '小学';
  return '未知';
}

// ─────────────────────────────────────────────
// 4. 差距分析：Gap Analysis
// ─────────────────────────────────────────────

/**
 * @param {GoalVector} goal
 * @param {BaselineProfile} baseline
 * @returns {GapAnalysis}
 */
function computeGap(goal, baseline) {
  const nodeGaps = {};
  let weightedSum = 0;
  let weightTotal = 0;

  for (const node of goal.nodes) {
    const current = baseline.nodeLevels[node.id] ?? 0;
    const gap = Math.max(0, 1 - current);
    nodeGaps[node.id] = gap;
    weightedSum += gap * node.weight;
    weightTotal += node.weight;
  }

  const totalGap = weightTotal > 0 ? weightedSum / weightTotal : 0;

  const criticalNodes = Object.entries(nodeGaps)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([id]) => id);

  return { nodeGaps, totalGap, criticalNodes };
}

// ─────────────────────────────────────────────
// 5. 里程碑倒推：Milestone Backcasting
// ─────────────────────────────────────────────

/**
 * @param {GoalVector} goal
 * @param {GapAnalysis} gap
 * @param {TimeAnchor} time
 * @returns {Milestone[]}
 */
function backcastMilestones(goal, gap, time) {
  const totalWeeks = Math.max(1, Math.ceil(time.totalDays / 7));
  const milestones = [];

  for (const node of goal.nodes) {
    const nodeGap = gap.nodeGaps[node.id] ?? 1;
    if (nodeGap < 0.05) continue;

    const steps = Math.max(2, Math.ceil(nodeGap * 4));
    const interval = Math.floor(totalWeeks / steps);

    for (let s = 1; s <= steps; s++) {
      const weekIndex = Math.min(s * interval, totalWeeks);
      const targetLevel = (baseline_interp(node, s, steps));

      milestones.push({
        id: `ms-${node.id}-${s}`,
        label: `${node.label} · 阶段 ${s}/${steps}`,
        weekIndex,
        targetLevel,
        status: s === 1 ? 'active' : 'pending',
      });
    }
  }

  return milestones.sort((a, b) => a.weekIndex - b.weekIndex);
}

function baseline_interp(node, step, total) {
  return clamp(step / total, 0, 1);
}

// ─────────────────────────────────────────────
// 6. 原子任务粉碎：Atomization
// ─────────────────────────────────────────────

/**
 * @param {Milestone[]} milestones
 * @param {GoalVector} goal
 * @param {GapAnalysis} gap
 * @returns {AtomicTask[]}
 */
function atomize(milestones, goal, gap) {
  const atoms = [];
  const taskTemplates = {
    sat:       ['完成 {n} 道 SAT 阅读真题', '背诵 {n} 个高频词汇', '模考 1 套 SAT 并复盘'],
    ap:        ['复习 AP {subject} 章节 {n}', '完成 {n} 道 FRQ 练习', '整理错题本 {n} 页'],
    spike:     ['推进个人项目 {n} 小时', '撰写活动描述初稿', '收集 {n} 个作品集素材'],
    'score-gap':['专攻薄弱知识点 {n} 题', '完成 1 套限时真题', '整理 {n} 道经典错题'],
    habit:     ['完成今日学习打卡', '消灭 {n} 道错题', '阅读 {n} 分钟'],
    'core-skill':['刻意练习 {n} 分钟', '观看教程并做笔记', '完成 {n} 次重复训练'],
    mental:    ['5 分钟正念呼吸', '写下今日 3 个小成就', '情绪树洞自由书写'],
  };

  const activeMilestones = milestones.filter(m => m.status === 'active');

  for (const ms of activeMilestones) {
    const nodeId = ms.id.split('-')[1];
    const node = goal.nodes.find(n => n.id === nodeId);
    const templates = taskTemplates[nodeId] ?? taskTemplates['core-skill'];
    const urgency = gap.nodeGaps[nodeId] ?? 0.5;

    templates.forEach((tpl, i) => {
      atoms.push({
        id: `atom-${ms.id}-${i}`,
        milestoneId: ms.id,
        label: tpl.replace('{n}', String(Math.ceil(urgency * 20))),
        nodeId,
        estimatedMinutes: 30 + i * 15,
        cadence: i === 0 ? 'daily' : 'weekly',
        priority: Math.ceil(urgency * 5) || 3,
      });
    });
  }

  return atoms.sort((a, b) => a.priority - b.priority);
}

// ─────────────────────────────────────────────
// 7. 风控预评估
// ─────────────────────────────────────────────

/**
 * @param {GapAnalysis} gap
 * @param {TimeAnchor} time
 * @param {DriveSource} [drive]
 * @returns {number} 0~1 风险值
 */
function assessDeviationRisk(gap, time, drive) {
  const gapRisk = gap.totalGap * 0.5;
  const timeRisk = time.totalDays < 90 ? 0.3 : time.totalDays < 180 ? 0.15 : 0;
  const driveBonus = drive ? (drive.intensity / 10) * -0.2 : 0;
  return clamp(gapRisk + timeRisk + driveBonus, 0, 1);
}

// ─────────────────────────────────────────────
// 8. 主函数：DeconstructGoal
// ─────────────────────────────────────────────

let _switchPersona = null;
let _personalizeAtom = null;

if (typeof require !== 'undefined') {
  try {
    const persona = require('./persona-switcher');
    _switchPersona = persona.switchPersona;
    _personalizeAtom = persona.personalizeAtom;
  } catch (_) { /* browser standalone */ }
}

/**
 * 配速计算：Velocity Matrix
 * Daily Energy Required = Total Goal Weight / Time Frame Days
 */
function computeVelocity(gap, time) {
  const totalGoalWeight = gap.totalGap || 1;
  const dailyEnergyKPI = totalGoalWeight / Math.max(time.totalDays, 1);
  const pressureMode = dailyEnergyKPI > 0.003 ? 'high' : dailyEnergyKPI > 0.001 ? 'medium' : 'low';
  return { totalGoalWeight, dailyEnergyKPI, pressureMode };
}

/**
 * 万能目标逆向拆解引擎
 *
 * 双轴初始化参数：
 *   目标锚点 (targetGoal)  → 高度：梦想体量与所需能量
 *   时间锚点 (timeFrameDays) → 斜率：配速与每日高压系数
 *   现状锚点 (baseline)     → 起点：差距计算的绝对原点
 *
 * @param {Object} input
 * @param {string} input.dream
 * @param {string} input.baseline
 * @param {number} [input.totalDays]
 * @param {Date}   [input.targetDate]
 * @param {DriveSource} [input.drive]
 * @param {string} [input.scene]
 * @param {Object} [input.baselineHints]
 * @returns {DeconstructResult}
 */
function DeconstructGoal(input) {
  const {
    dream,
    baseline: baselineInput,
    totalDays = 365,
    targetDate,
    drive,
    scene = 'custom',
    baselineHints = {},
  } = input;

  if (!dream) throw new Error('[WUXIAN] 缺少目标锚点 (targetGoal / dream)');
  if (!baselineInput) throw new Error('[WUXIAN] 缺少现状锚点 (baseline / currentStatus)');

  const goal = embedGoal(dream, scene);
  const baseline = mapBaseline(baselineInput, goal, baselineHints);
  const gap = computeGap(goal, baseline);

  const time = {
    totalDays,
    targetDate: targetDate ?? addDays(new Date(), totalDays),
  };

  const velocity = computeVelocity(gap, time);
  const milestones = backcastMilestones(goal, gap, time);
  let atoms = atomize(milestones, goal, gap);
  const deviationRisk = assessDeviationRisk(gap, time, drive);

  let persona = null;
  if (_switchPersona) {
    persona = _switchPersona({
      targetGoal: dream,
      timeFrameDays: totalDays,
      totalGap: gap.totalGap,
      scene,
    });
    if (_personalizeAtom) {
      atoms = atoms.map(a => _personalizeAtom(a, persona));
    }
  }

  return {
    goal,
    baseline,
    gap,
    velocity,
    milestones,
    atoms,
    persona,
    deviationRisk,
    userBaseline: {
      targetGoal: dream,
      timeFrameDays: totalDays,
      currentStatus: baselineInput,
    },
  };
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ─────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DeconstructGoal,
    embedGoal,
    mapBaseline,
    computeGap,
    computeVelocity,
    backcastMilestones,
    atomize,
    assessDeviationRisk,
    EVOLUTION_TEMPLATES,
  };
}

if (typeof window !== 'undefined') {
  window.WuxianEngine = {
    DeconstructGoal,
    embedGoal,
    mapBaseline,
    computeGap,
    backcastMilestones,
    atomize,
    assessDeviationRisk,
    EVOLUTION_TEMPLATES,
  };
}
