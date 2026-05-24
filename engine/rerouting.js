/**
 * WUXIAN · 反惰性风控闭环 · Rerouting Engine
 * =============================================
 * 当用户偏离航线时，系统不惩罚，而是像导航一样静默重算。
 *
 * 两级响应：
 *   Level 1 无感容错  — 偏离 < 15%，黑夜静默平摊
 *   Level 2 警报唤醒  — 偏离 ≥ 15%，情绪树洞 + 情感钩子介入
 */

const { resolveSlumpPersona } = require('./persona-switcher');

/** @typedef {'silent'|'alert'|'critical'} RerouteLevel */

/**
 * @typedef {Object} ExecutionState
 * @property {number} totalTasksPlanned
 * @property {number} totalTasksCompleted
 * @property {number} consecutiveFailDays
 * @property {number} remainingDays
 * @property {number} emotionScore       - 1~10，来自对话情绪分析
 * @property {boolean} deadlineFixed
 */

/**
 * @typedef {Object} RerouteResult
 * @property {RerouteLevel} level
 * @property {number} deviationPercent
 * @property {'extend'|'compress'|'redistribute'|'reframe'} strategy
 * @property {number} newDailyEnergyKPI
 * @property {number} adjustedTimeDays
 * @property {string} activePersona
 * @property {string|null} emotionalHook
 * @property {string} systemMessage
 */

const DEVIATION_THRESHOLD = 0.15;
const CRITICAL_FAIL_DAYS = 3;

/**
 * 计算航线偏离度
 * deviation = 1 - (completed / planned) 按时间比例校正
 */
function computeDeviation(state) {
  const { totalTasksPlanned, totalTasksCompleted, remainingDays } = state;
  if (totalTasksPlanned === 0) return 0;

  const completionRate = totalTasksCompleted / totalTasksPlanned;
  const expectedRate = 1 - (remainingDays / (remainingDays + totalTasksCompleted));
  const deviation = Math.max(0, expectedRate - completionRate);

  return clamp(deviation, 0, 1);
}

/**
 * 主函数：Rerouting 算法
 *
 * @param {ExecutionState} state
 * @param {Object} context
 * @param {number} context.originalDailyKPI
 * @param {number} context.totalDays
 * @param {number} context.totalGap
 * @param {Object} [context.persona]
 * @param {Object} [context.drive]
 * @returns {RerouteResult}
 */
function reroute(state, context) {
  const deviation = computeDeviation(state);
  const deviationPercent = deviation * 100;

  const {
    originalDailyKPI,
    totalDays,
    totalGap,
    persona,
    drive,
  } = context;

  let level = /** @type {RerouteLevel} */ ('silent');
  let strategy = 'redistribute';
  let adjustedTimeDays = totalDays;
  let newDailyEnergyKPI = originalDailyKPI;
  let activePersona = persona?.primaryPersona ?? 'growth-companion';
  let emotionalHook = null;
  let systemMessage = '';

  if (state.consecutiveFailDays >= CRITICAL_FAIL_DAYS || deviation >= DEVIATION_THRESHOLD * 2) {
    level = 'critical';
  } else if (deviation >= DEVIATION_THRESHOLD || state.emotionScore <= 3) {
    level = 'alert';
  }

  if (level === 'silent') {
    const remaining = state.totalTasksPlanned - state.totalTasksCompleted;
    const daysLeft = Math.max(state.remainingDays, 1);
    newDailyEnergyKPI = remaining / daysLeft;
    strategy = 'redistribute';
    systemMessage = '航线微调完成。任务已静默平摊至剩余天数，继续航行。';
  }

  else if (level === 'alert') {
    activePersona = resolveSlumpPersona(persona, 'deviation');
    strategy = persona?.primaryConfig?.reroutingStyle ?? 'reframe';

    if (state.deadlineFixed) {
      newDailyEnergyKPI = originalDailyKPI * (1 + deviation * 0.5);
      strategy = 'compress';
      systemMessage = '航线偏离 ' + deviationPercent.toFixed(1) + '%。已启动微调配速，下周任务权重已重算。';
    } else {
      adjustedTimeDays = totalDays + Math.ceil(state.consecutiveFailDays * 2);
      strategy = 'extend';
      systemMessage = '航线偏离 ' + deviationPercent.toFixed(1) + '%。截止日已弹性延长，保护你的节奏。';
    }

    if (drive?.keywords?.length) {
      emotionalHook = pickEmotionalHook(drive);
      systemMessage += ' 「' + emotionalHook + '」—— 记得你最初的梦想。';
    }
  }

  else if (level === 'critical') {
    activePersona = 'spirit-mentor';
    strategy = 'reframe';
    newDailyEnergyKPI = originalDailyKPI * 0.6;
    emotionalHook = drive ? pickEmotionalHook(drive) : '每个人都有低谷，这不是终点。';

    systemMessage = [
      '检测到连续 ' + state.consecutiveFailDays + ' 天执行力下滑。',
      '已激活「情绪树洞」模块，今日任务难度下调 40%。',
      '「' + emotionalHook + '」',
    ].join(' ');
  }

  return {
    level,
    deviationPercent,
    strategy,
    newDailyEnergyKPI,
    adjustedTimeDays,
    activePersona,
    emotionalHook,
    systemMessage,
  };
}

function pickEmotionalHook(drive) {
  const kw = drive.keywords;
  const why = drive.why ?? '';
  if (kw.length >= 2) {
    return '你说过的——' + why.slice(0, 40);
  }
  return why.slice(0, 50) || '你的梦想值得被坚持';
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { reroute, computeDeviation, DEVIATION_THRESHOLD };
}

if (typeof window !== 'undefined') {
  window.WuxianReroute = { reroute, computeDeviation };
}
