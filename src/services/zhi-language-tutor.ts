/**
 * ZHI · 真人陪练逻辑：按实际水平分层、单点突破、递进题单
 */

import { getBaselineStatus, parseBaseline } from '../db/baseline-schema';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { getSchoolMatrixView } from '../db/school-matrix';
import { matchSchoolIntel } from './school-anchor-brief';
import { getTodayDailyReview } from './zhi-daily-review-engine';
import {
  getLanguageProfile,
  upsertLanguageProfile,
  type LanguageLevelBand,
  type LanguageProfileRow,
} from '../db/zhi-language-profile-schema';
import { listRecentLanguageSessions } from '../db/zhi-language-session-schema';
import type { LanguageExamTrack, LanguageIntakeType } from './zhi-language';

export type TutorMissionDto = {
  examTrack: LanguageExamTrack;
  intakeType: LanguageIntakeType;
  taskPrompt: string;
  targetToefl: number;
  currentToefl: number;
  gapToefl: number;
  headline: string;
  zhiBrief: string;
  source: 'daily_review' | 'anchor' | 'tutor';
  levelBand: LanguageLevelBand;
  speakingEst: number;
  focusSkill: string;
  weakTags: string[];
  tutorIntro: string;
  prepGuide: string;
  prepSeconds: number;
  speakSeconds: number;
  microDrill: string;
  sessionGoal: string;
  writingTaskPrompt: string;
  writingPrepGuide: string;
};

const SKILL_LABEL: Record<string, string> = {
  fluency: '流利度（去嗯啊）',
  logic: '观点+因果链',
  vocab: '学术词汇升级',
  grammar: '句法准确',
  delivery: '语速与重音',
};

/** 按水平分层的题单：由易到难 */
const CURRICULUM: Record<
  LanguageLevelBand,
  { prompts: string[]; prep: string; seconds: number }
> = {
  A2: {
    seconds: 45,
    prep: '用中文想好：同意还是不同意 → 一个理由 → 一个例子（可中文草稿）。',
    prompts: [
      'Do you like studying alone or with friends? Give one reason.',
      'What is your favorite subject at school? Why?',
      'Should students use phones in class? Yes or no, one reason.',
    ],
  },
  B1: {
    seconds: 45,
    prep: '15 秒准备：观点一句（I believe…）→ because → For example…',
    prompts: [
      'Do you agree that students should have homework every day? Why or why not?',
      'Some people learn languages by watching movies. Do you think this is effective?',
      'Is it better to plan your day in advance or be spontaneous?',
    ],
  },
  B2: {
    seconds: 45,
    prep: '观点 + 两层理由，其中一层必须用 For instance / This means that…',
    prompts: [
      'Do you agree: technology has made communication less personal? Use reasons and examples.',
      'Should universities require all students to take public speaking courses?',
      'Some say competition helps students; others say it hurts. What is your view?',
    ],
  },
  B3: {
    seconds: 60,
    prep: '60 秒题：立场 → 让步一句（Admittedly…）→ 反驳 → 具体例子收束。',
    prompts: [
      'Do you agree that governments should fund arts programs in schools? Explain with examples.',
      'Some argue AI will replace teachers. Do you agree or disagree?',
      'Is social media more harmful or beneficial for teenagers? Take a clear position.',
    ],
  },
  C1: {
    seconds: 60,
    prep: '高分密度：indispensable / undermine / consequently 至少用 1 个，逻辑链闭合。',
    prompts: [
      'To what extent should universities use AI tools in admissions decisions?',
      'Some believe gap years improve maturity; others see them as wasted time. Discuss.',
      'Should standardized tests remain a major factor in college admissions?',
    ],
  },
};

const WRITING_CURRICULUM: Record<LanguageLevelBand, { prompts: string[]; prep: string }> = {
  A2: {
    prep: '3 句即可：观点 + because + 例子（共 80–120 词）。',
    prompts: ['Describe your favorite place to study and why. (80 words)'],
  },
  B1: {
    prep: '四段：观点 / 理由1 / 理由2 / 小结（150 词）。',
    prompts: ['Do you prefer online or in-person classes? Explain with examples. (150 words)'],
  },
  B2: {
    prep: '独立写作：立场 + 两理由 + 反方一句 + 反驳（200 词）。',
    prompts: [
      'Agree or disagree: Parents should limit teenagers\' screen time. (200 words)',
    ],
  },
  B3: {
    prep: '学术讨论风：回应观点 + 延伸例子（220 词）。',
    prompts: [
      'Professor: Travel broadens education. Student disagrees. Take a side and explain. (220 words)',
    ],
  },
  C1: {
    prep: '高分：精确动词 + 因果连接词 + 无空洞举例（250 词）。',
    prompts: [
      'Should AI-generated essays be banned in university applications? (250 words)',
    ],
  },
};

const MICRO_DRILLS: Record<string, string[]> = {
  fluency: [
    '跟读 3 遍（慢速）："I believe that… because… For example…" 中间不许嗯啊。',
    '45 秒内只练开头两句，录 3 次，选最干净的一次。',
  ],
  logic: [
    '用中文写因果链：观点 → 因为 → 所以 → 例如；再翻译成英文说一遍。',
    '强制使用模板：Although…, I still believe… because…',
  ],
  vocab: [
    '把 good/important/bad 换成：beneficial / indispensable / detrimental，各造 1 句。',
    '背诵并脱口：consequently / undermine / facilitate',
  ],
  grammar: [
    '检查主谓一致与时态：用现在时说观点，例子可用过去时。',
    '重说一遍，每句不超过 12 个词。',
  ],
  delivery: [
    '同一句放慢 25% 重录，重音落在内容词上。',
    '录两段：正常语速 + 略慢语速，对比哪段更清晰。',
  ],
};

function inferBand(speakingEst: number): LanguageLevelBand {
  if (speakingEst < 15) return 'A2';
  if (speakingEst < 20) return 'B1';
  if (speakingEst < 24) return 'B2';
  if (speakingEst < 27) return 'B3';
  return 'C1';
}

function pickFocusSkill(weakTags: string[], prev: string): string {
  const order = ['fluency', 'logic', 'vocab', 'grammar', 'delivery'];
  for (const tag of weakTags) {
    if (order.includes(tag)) return tag;
  }
  const idx = order.indexOf(prev);
  return order[(idx + 1) % order.length] ?? 'logic';
}

function ensureProfile(userId: string): LanguageProfileRow {
  const uid = userId.trim();
  let row = getLanguageProfile(uid);
  const baseline = getBaselineStatus(uid);
  const scores = baseline ? parseBaseline(baseline).currentScores : {};
  const speakRaw = String(scores['托福口语'] ?? '');
  const speakM = speakRaw.match(/(\d{1,2})/);
  let speakingEst = speakM ? Number(speakM[1]) : 0;

  const sessions = listRecentLanguageSessions(uid, 5);
  if (!speakingEst && sessions[0]?.score_numeric != null) {
    speakingEst = Number(sessions[0].score_numeric);
  }
  if (!speakingEst) speakingEst = 18;

  if (!row) {
    row = upsertLanguageProfile(uid, {
      levelBand: inferBand(speakingEst),
      speakingEst,
      focusSkill: 'logic',
      weakTags: ['fluency', 'logic'],
    });
  }
  return row;
}

export function buildTutorMission(userId: string): TutorMissionDto {
  const uid = userId.trim();
  const profile = ensureProfile(uid);
  const anchor = getSchoolAnchorProfile(uid);
  const matrix = getSchoolMatrixView(uid);
  const intel = anchor?.school ? matchSchoolIntel(anchor.school, anchor.major ?? '') : null;
  const required = (matrix?.requiredMetrics ?? intel?.requiredMetrics ?? {}) as Record<string, string>;
  const targetToefl = Number(String(required.托福 ?? required.TOEFL ?? '102').replace(/\D/g, '')) || 102;
  const baseline = getBaselineStatus(uid);
  const scores = baseline ? parseBaseline(baseline).currentScores : {};
  const currentToefl = Number(String(scores.托福 ?? scores.TOEFL ?? '0').replace(/\D/g, '')) || 0;
  const gapToefl = Math.max(0, targetToefl - currentToefl);

  const speakingEst = profile.speaking_est;
  const levelBand = inferBand(speakingEst);
  const weakTags = (() => {
    try {
      return JSON.parse(profile.weak_tags_json) as string[];
    } catch {
      return ['fluency', 'logic'];
    }
  })();

  const focusSkill = profile.focus_skill || pickFocusSkill(weakTags, 'logic');
  const bandCur = CURRICULUM[levelBand];
  const writeCur = WRITING_CURRICULUM[levelBand];
  const dayIdx = Math.floor(Date.now() / 86400000);
  let taskPrompt = bandCur.prompts[dayIdx % bandCur.prompts.length]!;
  const writingTaskPrompt = writeCur.prompts[dayIdx % writeCur.prompts.length]!;

  const review = getTodayDailyReview(uid);
  const p0 = review?.planCorrections?.find((c) => c.priority === 'P0');
  if (p0 && (p0.subjectId === 'toefl' || p0.subjectName?.includes('托福'))) {
    taskPrompt = `【今日战役】${p0.action.slice(0, 180)}`;
  }

  const drills = MICRO_DRILLS[focusSkill] ?? MICRO_DRILLS.logic!;
  const microDrill = drills[profile.total_sessions % drills.length]!;

  const memory = profile.tutor_memory?.trim();
  const tutorIntro = memory
    ? `曦宝，我是你的口语陪练。${memory} 今天只攻「${SKILL_LABEL[focusSkill] ?? focusSkill}」，别的先放下。`
    : `曦宝，我是你的口语陪练。当前估分口语约 ${speakingEst}/30（${levelBand} 档）。今天只攻「${SKILL_LABEL[focusSkill] ?? focusSkill}」。`;

  const headline = anchor?.school
    ? `${anchor.school} · 口语 ${speakingEst}/30 · ${levelBand} → 目标 ${targetToefl}+`
    : `口语 ${speakingEst}/30 · ${levelBand} 档训练`;

  const zhiBrief =
    gapToefl > 0
      ? `距梦校托福还差约 ${gapToefl} 分。陪练策略：每次只改一个习惯，连过 3 次影子关再升难度。`
      : '你已在航标区间，陪练侧重稳定输出与高分词汇密度。';

  return {
    examTrack: 'TOEFL',
    intakeType: 'SPEAKING',
    taskPrompt,
    targetToefl,
    currentToefl,
    gapToefl,
    headline,
    zhiBrief,
    source: p0 ? 'daily_review' : anchor?.school ? 'anchor' : 'tutor',
    levelBand,
    speakingEst,
    focusSkill,
    weakTags,
    tutorIntro,
    prepGuide: bandCur.prep,
    prepSeconds: levelBand === 'A2' || levelBand === 'B1' ? 20 : 15,
    speakSeconds: bandCur.seconds,
    microDrill,
    sessionGoal: `练完本次目标：${SKILL_LABEL[focusSkill] ?? focusSkill} 有可听见的进步`,
    writingTaskPrompt,
    writingPrepGuide: writeCur.prep,
  };
}

export function updateProfileAfterTutorSession(input: {
  userId: string;
  intakeType: LanguageIntakeType;
  scoreNumeric: number | null;
  focusSkill: string;
  weakTags: string[];
  whatWorked: string[];
  priorityFix: string;
  microDrill: string;
  shadowPassed: boolean;
}): { levelBand: LanguageLevelBand; speakingEst: number; streakDays: number } {
  const uid = input.userId.trim();
  const prev = ensureProfile(uid);
  let speakingEst = prev.speaking_est;
  if (input.scoreNumeric != null) {
    speakingEst = Math.round(prev.speaking_est * 0.55 + input.scoreNumeric * 0.45);
    if (input.shadowPassed) speakingEst = Math.min(30, speakingEst + 0.5);
  }

  const mergedWeak = [...new Set([...input.weakTags, ...JSON.parse(prev.weak_tags_json || '[]')])].slice(0, 6);
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = prev.updated_at ? new Date(prev.updated_at * 1000).toISOString().slice(0, 10) : '';
  let streak = prev.streak_days;
  if (lastDay !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = lastDay === yesterday ? streak + 1 : 1;
  }

  const shadowStreak = input.shadowPassed ? prev.shadow_pass_streak + 1 : 0;
  const levelBand = inferBand(speakingEst);
  let nextFocus = input.focusSkill;
  if (shadowStreak >= 3) {
    nextFocus = pickFocusSkill(mergedWeak, input.focusSkill);
  }

  const memoryParts = [
    input.whatWorked[0] ? `上次做对了：${input.whatWorked[0].slice(0, 60)}` : '',
    input.priorityFix ? `待改：${input.priorityFix.slice(0, 60)}` : '',
    input.shadowPassed ? '影子关已通过。' : '影子关未完成。',
  ].filter(Boolean);

  upsertLanguageProfile(uid, {
    levelBand,
    speakingEst,
    focusSkill: nextFocus,
    weakTags: mergedWeak,
    streakDays: streak,
    totalSessions: prev.total_sessions + 1,
    shadowPassStreak: shadowStreak,
    tutorMemory: memoryParts.join(' '),
    lastDrill: input.microDrill,
  });

  return { levelBand, speakingEst, streakDays: streak };
}

export const HUMAN_TUTOR_EVAL_SYSTEM = `你是曦宝的一对一口语陪练老师（不是考官，不是冷冰冰的批改机）。
原则：
1) 先肯定 1 个具体做对的点（whatWorked）
2) 只纠正 1 个最拖后腿的习惯（priorityFix），不要列一长串
3) 布置 2 分钟内可完成的 microDrill
4) 影子挑战句 zhiChallenge 必须比学生原句高半档，但长度适中
5) zhiReckoning 像真人说话：简短、有温度、有要求
6) 根据学生水平调整严厉度：A2-B1 多鼓励，B3-C1 多抠细节
7) weakTags 从：fluency, logic, vocab, grammar, delivery 中选 1-3 个

严格 JSON：
{
  "estimatedScore": "托福口语 x/30",
  "ieltsEquivalent": "x.x",
  "whatWorked": ["..."],
  "priorityFix": "一句人话",
  "fatalFlaws": ["最多2条，具体"],
  "weakTags": ["fluency","logic"],
  "focusSkill": "logic",
  "microDrill": "2分钟小练习",
  "zhiChallenge": "一句升级示范或重说指令",
  "zhiReckoning": "陪练师口吻总评，50字内"
}`;

export const HUMAN_TUTOR_SHADOW_SYSTEM = `你是口语陪练老师，判断学生是否完成了「影子挑战」中的升级要求。
通过标准：使用了要求的逻辑/词汇，不是敷衍重复原句。
JSON：{ "passed": true/false, "zhiReckoning": "像真人反馈，30字内", "noticedImprovement": "具体一点" }`;
