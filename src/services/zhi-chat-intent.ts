/**
 * ZHI 对话意图（评估 / 课程轨澄清等）
 */

import type { CurriculumTrack } from './learner-profile';

const ASSESSMENT_RE =
  /评估|测评|摸底|模考|试卷|测一下|能力测试|诊断|出题|考我|测试我的|检验水平|做一套题|填空|问答|验收|有学必考|考一下|过关|整体|全面/i;

const PATH_PLANNING_RE =
  /学习路径|学习规划|路径规划|知识点|时间轴|阶段计划|里程碑|怎么学|规划一下|制定计划|复习计划|备考计划|梦校路径|知识工程/i;

const CURRICULUM_RE =
  /国际生|国际部|没有.*高考|非高考|IB|AP\s*课|A[- ]?Level|人教版|教材|课程|考纲|湖南|高二|高三|高一|留学/i;

export function isAssessmentRequest(text: string): boolean {
  return ASSESSMENT_RE.test(text.trim());
}

/** 规划/路径类请求（不与纯评估混淆：含「规划+评估」时优先路径） */
/** 用户敷衍/信息过少 → 智者应主动追问或索要证据 */
export function isPassiveOrVagueReply(text: string): boolean {
  const t = text.trim();
  if (t.length > 80) return false;
  return /^(还行|还好|一般|不知道|没|忘了|随便|嗯|哦|好|可以|继续|然后呢|help|idk)$/i.test(t) ||
    /没什么|不清楚|还没|懒得|不想说/.test(t);
}

export function isPathPlanningRequest(text: string): boolean {
  const t = text.trim();
  if (/整体|全面|全科|做一次.*评估|帮我.*评估/.test(t)) return false;
  if (PATH_PLANNING_RE.test(t)) return true;
  if (/规划|路径|计划/.test(t) && !ASSESSMENT_RE.test(t)) return true;
  return false;
}

export function isCurriculumQuestion(text: string): boolean {
  return CURRICULUM_RE.test(text.trim());
}

/** 从用户话术中推断优先评估科目（dashboard subject id） */
export function inferAssessmentSubjectId(
  text: string,
  curriculumTrack: CurriculumTrack,
): string | null {
  const t = text.trim();
  if (/托福|TOEFL|口语|听力/i.test(t)) return 'toefl';
  if (/雅思|IELTS/i.test(t)) return 'toefl';
  if (/SAT|阅读|写作/i.test(t)) return 'sat';
  if (/AP|微积分|Calculus|化学|生物|CSA/i.test(t)) return 'ap';
  if (/数学|函数|几何|代数/i.test(t)) return 'math';
  if (/物理|力学|电磁/i.test(t)) return 'phys';
  if (/化学/i.test(t)) return 'chem';
  if (/英语|阅读理解/i.test(t)) return 'en';
  if (/算法|信息学|CSP|编程/i.test(t)) return 'algo';
  if (/文书|essay/i.test(t)) return 'essay';
  if (curriculumTrack === 'intl_us_uk') return 'toefl';
  if (curriculumTrack === 'cn_gaokao') return 'math';
  return null;
}
