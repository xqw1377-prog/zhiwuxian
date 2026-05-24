/**
 * WUXIAN · 千人千面沟通图谱 · Persona Switcher
 * =============================================
 * 架构决策：人格分类采用「三原色混合模型」，而非硬切换
 *
 *   三原色人格：
 *     A clearance  → 铁血教练 (Iron Coach)
 *     B endurance  → 养成系伙伴 (Growth Companion)
 *     C creation   → 精神导师 (Spirit Mentor)
 *
 *   分类边界 = 语义得分 × 时间压力修正 × 差距压力修正
 *   输出：personaBlend 权重向量 + primaryPersona + 沟通风格参数
 */

// ─────────────────────────────────────────────
// 1. 人格矩阵定义
// ─────────────────────────────────────────────

/** @typedef {'clearance'|'endurance'|'creation'} GoalArchetype */
/** @typedef {'iron-coach'|'growth-companion'|'spirit-mentor'} PersonaId */

const PERSONA_MATRIX = {
  'iron-coach': {
    id: 'iron-coach',
    archetype: 'clearance',
    name: '铁血教练',
    nameEn: 'Iron Coach',
    tagline: '数据说话，终点线清晰，绝不妥协',
    commStyle: {
      sentenceLength: 'short',
      toneMarkers: ['。', '执行', '数据', '目标'],
      rewardStyle: 'data',
      encouragementLevel: 0.3,
      pressureLevel: 0.85,
      emoji: false,
    },
    reroutingStyle: 'compress',   // 压缩任务、提高斜率
    slumpResponse: 'accountability', // 问责式唤醒
  },
  'growth-companion': {
    id: 'growth-companion',
    archetype: 'endurance',
    name: '养成系伙伴',
    nameEn: 'Growth Companion',
    tagline: '每天一点点，勋章见证你的成长',
    commStyle: {
      sentenceLength: 'medium',
      toneMarkers: ['～', '加油', '棒', '坚持'],
      rewardStyle: 'badge',
      encouragementLevel: 0.85,
      pressureLevel: 0.25,
      emoji: true,
    },
    reroutingStyle: 'distribute',  // 平摊任务、降低难度
    slumpResponse: 'positive-reinforcement',
  },
  'spirit-mentor': {
    id: 'spirit-mentor',
    archetype: 'creation',
    name: '精神导师',
    nameEn: 'Spirit Mentor',
    tagline: '没有标准答案，只有属于你的独特路径',
    commStyle: {
      sentenceLength: 'long',
      toneMarkers: ['…', '感受', '灵感', '可能性'],
      rewardStyle: 'inspiration',
      encouragementLevel: 0.7,
      pressureLevel: 0.35,
      emoji: false,
    },
    reroutingStyle: 'reframe',      // 重构视角、保护创作心流
    slumpResponse: 'emotional-tree', // 情绪树洞介入
  },
};

// ─────────────────────────────────────────────
// 2. 语义分类词典（后续由 LLM 替代）
// ─────────────────────────────────────────────

const ARCHETYPE_LEXICON = {
  clearance: {
    weight: 1.0,
    keywords: [
      '考', '升学', '高考', '中考', 'SAT', '托福', '雅思', 'GRE', 'GMAT',
      '证', '证书', 'CPA', '司考', '考公', '公务员', '录取', 'Offer',
      'Top', '名校', '一本', '分数线', '提分', '刷题', '标化', 'AP',
      '排名', '冲刺', '上岸', '通过', '合格',
    ],
  },
  endurance: {
    weight: 1.0,
    keywords: [
      '减肥', '健身', '跑步', '习惯', '坚持', '每天', '阅读', '读书',
      '语言', '英语', '日语', '法语', '口语', '流利', '打卡',
      '早起', '冥想', '自律', '生活方式', '健康', '戒烟', '存钱',
      '长期', '养成', '日积月累',
    ],
  },
  creation: {
    weight: 1.0,
    keywords: [
      '创作', '写作', '小说', '剧本', '设计', '美术', '画画', '绘画',
      '音乐', '作曲', '摄影', '电影', '策展', '画展', '作品集',
      '创业', '产品', 'App', '独立', '发明', '专利', '艺术',
      '灵感', '表达', '作品', '品牌', '建筑', '雕塑', '插画',
    ],
  },
};

/** 场景预设人格偏向（WUXIAN 三大用户场景） */
const SCENE_PERSONA_BIAS = {
  'intl-top20': { clearance: 0.55, endurance: 0.10, creation: 0.35 },
  'gaokao':     { clearance: 0.85, endurance: 0.10, creation: 0.05 },
  'primary':    { clearance: 0.10, endurance: 0.75, creation: 0.15 },
  'custom':     { clearance: 0.33, endurance: 0.34, creation: 0.33 },
};

// ─────────────────────────────────────────────
// 3. 语义得分计算
// ─────────────────────────────────────────────

/**
 * @param {string} dreamText
 * @returns {Record<GoalArchetype, number>}
 */
function scoreArchetypes(dreamText) {
  const text = dreamText.toLowerCase();
  const scores = { clearance: 0, endurance: 0, creation: 0 };

  for (const [archetype, config] of Object.entries(ARCHETYPE_LEXICON)) {
    for (const kw of config.keywords) {
      if (text.includes(kw.toLowerCase())) {
        scores[archetype] += config.weight;
      }
    }
  }

  const total = scores.clearance + scores.endurance + scores.creation;
  if (total === 0) return { clearance: 0.34, endurance: 0.33, creation: 0.33 };

  return {
    clearance: scores.clearance / total,
    endurance: scores.endurance / total,
    creation: scores.creation / total,
  };
}

// ─────────────────────────────────────────────
// 4. 双轴压力修正器
// ─────────────────────────────────────────────

/**
 * 时间锚点修正：时间越短 → 越倾向铁血教练
 * @param {Record<GoalArchetype, number>} blend
 * @param {number} timeFrameDays
 */
function applyTimePressure(blend, timeFrameDays) {
  const pressure = clamp(1 - timeFrameDays / 365, 0, 0.6);
  const creationResistance = blend.creation * 0.7;
  const effectivePressure = pressure * (1 - creationResistance);
  return normalize({
    clearance: blend.clearance + effectivePressure * 0.5,
    endurance: blend.endurance - effectivePressure * 0.15,
    creation:  blend.creation  - effectivePressure * 0.1,
  });
}

/**
 * 差距修正：差距越大 + 时间紧 → 越倾向铁血教练
 * @param {Record<GoalArchetype, number>} blend
 * @param {number} totalGap 0~1
 * @param {number} timeFrameDays
 */
function applyGapPressure(blend, totalGap, timeFrameDays) {
  const urgency = totalGap * (timeFrameDays < 180 ? 1.5 : 1.0);
  const shift = clamp(urgency * 0.3, 0, 0.35);
  return normalize({
    clearance: blend.clearance + shift,
    endurance: blend.endurance,
    creation:  blend.creation  - shift * 0.5,
  });
}

/**
 * 场景预设融合
 */
function fuseWithScene(semantic, scene) {
  const bias = SCENE_PERSONA_BIAS[scene] ?? SCENE_PERSONA_BIAS.custom;
  return normalize({
    clearance: semantic.clearance * 0.6 + bias.clearance * 0.4,
    endurance: semantic.endurance * 0.6 + bias.endurance * 0.4,
    creation:  semantic.creation  * 0.6 + bias.creation  * 0.4,
  });
}

// ─────────────────────────────────────────────
// 5. 人格解析与切换
// ─────────────────────────────────────────────

/**
 * @typedef {Object} PersonaBlend
 * @property {number} clearance  - 铁血教练权重
 * @property {number} endurance  - 养成系伙伴权重
 * @property {number} creation   - 精神导师权重
 */

/**
 * @typedef {Object} PersonaResult
 * @property {PersonaBlend} archetypeBlend
 * @property {PersonaId} primaryPersona
 * @property {PersonaId} secondaryPersona
 * @property {Object} primaryConfig
 * @property {Object} secondaryConfig
 * @property {GoalArchetype} dominantArchetype
 * @property {number} dailyEnergyKPI
 * @property {number} pressureCoefficient
 * @property {string} greetingTemplate
 * @property {string} taskFramingTemplate
 */

/**
 * 计算每日能量基准值
 * Daily Energy Required = Total Goal Weight / Time Frame Days
 */
function computeDailyEnergy(totalGoalWeight, timeFrameDays) {
  return totalGoalWeight / Math.max(timeFrameDays, 1);
}

/**
 * 主函数：Persona Switcher
 *
 * @param {Object} input
 * @param {string} input.targetGoal
 * @param {number} input.timeFrameDays
 * @param {number} [input.totalGap=0.5]
 * @param {string} [input.scene='custom']
 * @returns {PersonaResult}
 */
function switchPersona(input) {
  const {
    targetGoal,
    timeFrameDays,
    totalGap = 0.5,
    scene = 'custom',
  } = input;

  const semantic = scoreArchetypes(targetGoal);
  let blend = fuseWithScene(semantic, scene);
  blend = applyTimePressure(blend, timeFrameDays);
  blend = applyGapPressure(blend, totalGap, timeFrameDays);

  const sorted = Object.entries(blend).sort(([, a], [, b]) => b - a);
  const dominantArchetype = /** @type {GoalArchetype} */ (sorted[0][0]);
  const secondaryArchetype = /** @type {GoalArchetype} */ (sorted[1][0]);

  const archetypeToPersona = {
    clearance: 'iron-coach',
    endurance: 'growth-companion',
    creation: 'spirit-mentor',
  };

  const primaryPersona = archetypeToPersona[dominantArchetype];
  const secondaryPersona = archetypeToPersona[secondaryArchetype];

  const totalGoalWeight = 1.0;
  const dailyEnergyKPI = computeDailyEnergy(totalGoalWeight, timeFrameDays);
  const pressureCoefficient = clamp(dailyEnergyKPI * 365, 0.1, 1.0);

  const primaryConfig = PERSONA_MATRIX[primaryPersona];
  const secondaryConfig = PERSONA_MATRIX[secondaryPersona];

  return {
    archetypeBlend: blend,
    primaryPersona,
    secondaryPersona,
    primaryConfig,
    secondaryConfig,
    dominantArchetype,
    dailyEnergyKPI,
    pressureCoefficient,
    greetingTemplate: buildGreeting(primaryConfig, targetGoal, timeFrameDays),
    taskFramingTemplate: buildTaskFraming(primaryConfig),
  };
}

// ─────────────────────────────────────────────
// 6. 沟通模板生成
// ─────────────────────────────────────────────

function buildGreeting(persona, goal, days) {
  const templates = {
    'iron-coach': `目标确认：「${truncate(goal, 30)}」。倒计时 ${days} 天。没有借口，只有执行。`,
    'growth-companion': `太棒了！你想${truncate(goal, 20)}～ 我们一起用 ${days} 天慢慢实现它吧！`,
    'spirit-mentor': `「${truncate(goal, 30)}」… 这是一个关于你自己的故事。${days} 天，足够让灵感生根。`,
  };
  return templates[persona.id] ?? templates['spirit-mentor'];
}

function buildTaskFraming(persona) {
  const templates = {
    'iron-coach': '今日任务：{task}。预计 {minutes} 分钟。完成率纳入航线偏离度计算。',
    'growth-companion': '今天的个小目标✦ {task}～ 只要 {minutes} 分钟，完成就能解锁新勋章！',
    'spirit-mentor': '此刻，不妨花 {minutes} 分钟，{task}。不必完美，只需真诚。',
  };
  return templates[persona.id] ?? templates['spirit-mentor'];
}

/**
 * 为原子任务注入人格化描述
 * @param {Object} atom
 * @param {PersonaResult} persona
 * @returns {Object}
 */
function personalizeAtom(atom, persona) {
  const tpl = persona.taskFramingTemplate;
  const description = tpl
    .replace('{task}', atom.label ?? atom.taskDescription)
    .replace('{minutes}', String(atom.estimatedMinutes ?? atom.durationMinutes ?? 20));

  return {
    ...atom,
    taskDescription: description,
    personaStyle: persona.primaryPersona,
    difficultyWeight: clamp(
      (atom.difficultyWeight ?? 0.5) * persona.pressureCoefficient,
      0.1, 1.0
    ),
  };
}

// ─────────────────────────────────────────────
// 7. 懈怠态人格切换（风控层调用）
// ─────────────────────────────────────────────

/**
 * 当惰性风控触发时，动态切换为更适合当前状态的人格
 * @param {PersonaResult} current
 * @param {'slump'|'deviation'|'emotional'} trigger
 * @returns {PersonaId}
 */
function resolveSlumpPersona(current, trigger) {
  if (trigger === 'emotional' || trigger === 'deviation') {
    return 'spirit-mentor';
  }
  if (current.dominantArchetype === 'clearance' && trigger === 'slump') {
    return current.pressureCoefficient > 0.7
      ? 'iron-coach'
      : 'growth-companion';
  }
  return current.secondaryPersona;
}

// ─────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function normalize(obj) {
  const total = Object.values(obj).reduce((s, v) => s + Math.max(v, 0), 0);
  if (total === 0) return { clearance: 0.33, endurance: 0.34, creation: 0.33 };
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = Math.max(v, 0) / total;
  }
  return result;
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

// ─────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    switchPersona,
    scoreArchetypes,
    personalizeAtom,
    resolveSlumpPersona,
    PERSONA_MATRIX,
    ARCHETYPE_LEXICON,
  };
}

if (typeof window !== 'undefined') {
  window.WuxianPersona = {
    switchPersona,
    scoreArchetypes,
    personalizeAtom,
    resolveSlumpPersona,
    PERSONA_MATRIX,
  };
}
