/**
 * WUXIAN · 千人千面沟通图谱 (TypeScript)
 */

export type GoalArchetype = 'clearance' | 'endurance' | 'creation';
export type PersonaId = 'iron-coach' | 'growth-companion' | 'spirit-mentor';

export interface PersonaConfig {
  id: PersonaId;
  name: string;
  tagline: string;
}

export interface PersonaResult {
  primaryPersona: PersonaId;
  primaryName: string;
  dominantArchetype: GoalArchetype;
  greeting: string;
}

const PERSONAS: Record<PersonaId, PersonaConfig> = {
  'iron-coach': { id: 'iron-coach', name: '铁血教练', tagline: '数据说话，终点线清晰' },
  'growth-companion': { id: 'growth-companion', name: '养成系伙伴', tagline: '每天一点点，勋章见证成长' },
  'spirit-mentor': { id: 'spirit-mentor', name: '精神导师', tagline: '没有标准答案，只有你的故事' },
};

const KEYWORDS: Record<GoalArchetype, string[]> = {
  clearance: ['考', '证', '高考', 'SAT', '托福', '录取', '提分', '刷题', '上岸', '全栈', '架构'],
  endurance: ['习惯', '坚持', '每天', '语言', '英语', '健身', '阅读', '流利', '长期'],
  creation: ['画', '创作', '设计', '艺术', '作品', '创业', '写作', '开源', '上线'],
};

export function resolvePersona(goal: string, totalDays: number): PersonaResult {
  const text = goal.toLowerCase();
  const scores: Record<GoalArchetype, number> = { clearance: 0, endurance: 0, creation: 0 };

  for (const [arch, words] of Object.entries(KEYWORDS)) {
    scores[arch as GoalArchetype] = words.filter(w => text.includes(w.toLowerCase())).length;
  }

  const total = Object.values(scores).reduce((s, v) => s + v, 0) || 1;
  let dominant: GoalArchetype = 'clearance';
  let max = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > max) { max = v; dominant = k as GoalArchetype; }
  }

  if (total === 0) dominant = totalDays > 180 ? 'endurance' : 'clearance';
  if (totalDays < 90) dominant = 'clearance';

  const map: Record<GoalArchetype, PersonaId> = {
    clearance: 'iron-coach',
    endurance: 'growth-companion',
    creation: 'spirit-mentor',
  };

  const pid = map[dominant];
  return {
    primaryPersona: pid,
    primaryName: PERSONAS[pid].name,
    dominantArchetype: dominant,
    greeting: buildGreeting(pid, goal),
  };
}

function buildGreeting(pid: PersonaId, goal: string): string {
  const g = goal.slice(0, 30);
  const tpl: Record<PersonaId, string> = {
    'iron-coach': `目标锁定：「${g}」。航线已建立，执行是唯一变量。`,
    'growth-companion': `太棒了！「${g}」～ 我们一起慢慢实现它吧！`,
    'spirit-mentor': `「${g}」… 这是属于你的故事。不必完美，只需真诚。`,
  };
  return tpl[pid];
}

export function buildEmotionalWake(
  driveWhy: string,
  consecutiveFailDays: number,
): string | null {
  if (consecutiveFailDays < 5 || !driveWhy) return null;
  return `还记得吗——${driveWhy.slice(0, 60)}。这条路还没有走完。`;
}

export function resolveSlumpPersona(
  primary: PersonaId,
  consecutiveFailDays: number,
): PersonaId {
  if (consecutiveFailDays >= 5) return 'spirit-mentor';
  if (consecutiveFailDays >= 3 && primary === 'iron-coach') return 'growth-companion';
  return primary;
}

// ── 工业级人格话术 ──

export type PersonaType = 'COACH' | 'BUDDY' | 'MENTOR';

export type SpeechContext =
  | 'ON_TRACK'
  | 'MILD_MISSED'
  | 'NEED_ENCOURAGE'
  | 'SHOCK_THERAPY'
  | 'NIGHT_PATROL'
  | 'REROUTE_PUSH';

const SPEECH_MATRIX: Record<PersonaType, Record<SpeechContext, string>> = {
  COACH: {
    ON_TRACK: '进度良好，保持配速。执行是唯一变量。',
    MILD_MISSED: '今天没完成没关系，能量已平摊到后续日子。明天继续。',
    NEED_ENCOURAGE: '检测到卡点。明天的任务已降级——完成 5 分钟就算赢。',
    SHOCK_THERAPY: '连续偏离航线。目标可以调，但别直接放弃。我们重新对齐。',
    NIGHT_PATROL: '我知道你今天很累，明天的路径我已经为你重新计算好了，今晚闭眼睡觉，明天准时重新触发。我垫底，你别慌。',
    REROUTE_PUSH: '检测到你最近处于低谷期，系统已自动将本周认知负荷降低 40%。今天只看 3 页书即可，我们重新出发。',
  },
  BUDDY: {
    ON_TRACK: '太棒了！今天也踩实了一格～',
    MILD_MISSED: '悄悄帮你重排了路径，你几乎感觉不到变化。明天见～',
    NEED_ENCOURAGE: '遇到困难很正常！明天只做一个小小的重启动作就好～',
    SHOCK_THERAPY: '好久没见到你了… 还记得你为什么出发吗？我们从最小的一步重新开始。',
    NIGHT_PATROL: '今天辛苦了，路径已经帮你调好了。好好睡一觉，明天一起加油～',
    REROUTE_PUSH: '最近有点累对吧？没关系，我已经把任务调轻了。今天只做一件小事，就算赢。',
  },
  MENTOR: {
    ON_TRACK: '你在走自己的路。很好。',
    MILD_MISSED: '沉默不是失败，只是生命需要呼吸的空间。路径已微调。',
    NEED_ENCOURAGE: '也许不是你不适合，而是坡度需要更平。明天只做一件小事。',
    SHOCK_THERAPY: '长期偏离时，不是意志的问题，是路径需要重构。给自己一具降落伞。',
    NIGHT_PATROL: '深夜了。不必责备自己，明天的路已经为你留好。休息，也是修行。',
    REROUTE_PUSH: '低谷是路径的一部分。系统已为你减负，今天只需轻轻触碰目标即可。',
  },
};

export function personaToIndustrial(pid: PersonaId): PersonaType {
  const map: Record<PersonaId, PersonaType> = {
    'iron-coach': 'COACH',
    'growth-companion': 'BUDDY',
    'spirit-mentor': 'MENTOR',
  };
  return map[pid];
}

export function industrialToPersona(pt: PersonaType): PersonaId {
  const map: Record<PersonaType, PersonaId> = {
    COACH: 'iron-coach',
    BUDDY: 'growth-companion',
    MENTOR: 'spirit-mentor',
  };
  return map[pt];
}

export function getPersonaSpeech(
  personaType: PersonaType,
  context: SpeechContext,
  driveForce?: string,
): string {
  const base = SPEECH_MATRIX[personaType][context];
  if (context === 'SHOCK_THERAPY' && driveForce) {
    return `${base} 你说过：「${driveForce.slice(0, 50)}」—— 这条路还没走完。`;
  }
  return base;
}
