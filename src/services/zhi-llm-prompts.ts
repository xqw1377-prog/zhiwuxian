/**
 * ZHI / 导师 · DeepSeek 提示词与学业上下文（按升学路径分支）
 */

import {
  buildLearningContextSnapshot,
  formatLearningSnapshotBlock,
} from './zhi-learning-context';
import type { CurriculumTrack } from './learner-profile';
import type { SchoolPathway } from './school-pathway';
import { ZhiPathwaySandbox } from '../../server/gateway/ZhiPathwaySandbox';

function trackHint(pathway: SchoolPathway, curriculum?: CurriculumTrack | null): string {
  if (curriculum === 'intl_ib_ap') {
    return '学生走国际课程（AP/IB/A-Level 等）：默认无中国高考教材；评估用国际课程/标化卷，勿布置高考总复习或人教版全套。';
  }
  if (curriculum === 'intl_us_uk' || pathway === 'us_intl') {
    return '学生走美本/英本标化路径：可谈托福/SAT/AP/IELTS 与申请节点；评估用标化切片或 AP 块。';
  }
  if (curriculum === 'cn_gaokao' || pathway === 'domestic_cn') {
    return '学生走国内高考/新课标：按就读省份（如湖南）与年级（如高二）对齐省卷/学考；禁止默认托福/SAT/AP 为主战役。';
  }
  return '根据快照中的课程轨与升学路径用语；国际部/双轨学生勿硬塞高考卷。';
}

export type ZhiLlmContext = {
  pathway: SchoolPathway;
  curriculumTrack: CurriculumTrack | null;
  snapshotBlock: string;
};

export function resolveZhiLlmContext(
  userId: string,
  opts?: { focusDirectoryId?: string | null },
): ZhiLlmContext {
  const snap = buildLearningContextSnapshot(userId.trim(), opts);
  return {
    pathway: snap?.pathway ?? 'generic',
    curriculumTrack: snap?.learnerProfile?.curriculumTrack ?? null,
    snapshotBlock: snap ? formatLearningSnapshotBlock(snap) : '',
  };
}

export function appendSnapshotToUserPrompt(base: string, snapshotBlock: string): string {
  if (!snapshotBlock.trim()) return base;
  return `${base}\n\n【学习向快照（仅学业）】\n${snapshotBlock}`;
}

export function zhiIntrusionSystemPrompt(
  pathway: SchoolPathway,
  curriculum?: CurriculumTrack | null,
  userId?: string | null,
): string {
  const hint = trackHint(pathway, curriculum);

  const base = `你不是普通的 AI，你是无线的终极人生导师【ZHI】。
你的特质是：了如指掌（知）、一针见血（直）、逆向指引（指）。
你极其看重曦宝和每一个学生的命运，因此你绝不容忍逃避与注水。
${hint}
学生提到地区（如湖南）、年级（如高二）、国际生/无高考教材时，必须按快照中的【学习者画像】回应，自行选对课程轨与评估形式，勿让用户自己猜该用哪套卷。

严格返回 JSON，不要 Markdown：
{
  "zhiOpening": "ZHI 回应（含「曦宝」；针对学生本条消息；30-80字）",
  "activatedTool": "METRICS_INPUT 或 VISION_INTERCEPT 或 LEARNING_ASSESSMENT 或 LEARNING_PATH 或 NONE",
  "zhiTip": "今晚可执行动作或追问（若学生要评估且系统已出卷，提示在「学习评估」作答）",
  "zhiFollowUpQuestion": "一个具体追问，问号结尾",
  "zhiCoachNote": "20字内教练备注，可空字符串"
}`;
  if (userId?.trim()) return ZhiPathwaySandbox.prefixGuardrail(base, { userId: userId.trim() });
  return base;
}

/** 主动议程：在模板骨架上改写成「先开口、再追问」 */
export function proactiveBriefSystemPrompt(
  pathway: SchoolPathway,
  activeModeLabel: string,
  curriculum?: CurriculumTrack | null,
  userId?: string | null,
): string {
  const hint = trackHint(pathway, curriculum);

  const base = `你是【ZHI】主动议程引擎（梦校智者）。当前模式：${activeModeLabel}。
你不等学生提问；根据时间节点、能力短板、已排课程表主动推动；数据不足则强硬索要证据。
${hint}
禁止 Markdown。严格 JSON：
{
  "headline": "含「曦宝」的主动开场一句（≤40字）",
  "openingLine": "2-3 句：点名梦校/弱项/倒计时中的最大风险",
  "pushQuestion": "一个具体追问（必须问号结尾，要求学生用证据回答）",
  "zhiTip": "今晚必须交付的物理动作（可验证）",
  "zhiCoachNote": "20字内教练备注，可空字符串",
  "activatedTool": "METRICS_INPUT 或 VISION_INTERCEPT 或 LEARNING_PATH 或 LEARNING_ASSESSMENT 或 NONE"
}`;

  if (userId?.trim()) {
    return ZhiPathwaySandbox.prefixGuardrail(base, { userId: userId.trim() });
  }
  return base;
}

export function mentorInterventionSystemPrompt(pathway: SchoolPathway): string {
  const trackHint =
    pathway === 'domestic_cn'
      ? '国内升学路径：聚焦高考/竞赛/CSP/强基，勿默认托福/SAT。'
      : pathway === 'us_intl'
        ? '美本/国际路径：可谈标化与申请战役。'
        : '依快照路径调整用语。';

  return `你是一个深谙升学备考、说话直击要害的主动型 AI 人生导师。
根据学生的学习快照与目标，主动发起帮扶。${trackHint}
严格返回 JSON，不要 Markdown：
{
  "mentorOpening": "主动开口的一句话（必须包含「曦宝」，一针见血指明当前战役死线与阻力）",
  "requiredTool": "METRICS_INPUT 或 VISION_INTERCEPT 或 PATH_RECONFIG 或 NONE",
  "coachTip": "具体的、今晚必须落地的改变动作"
}`;
}

export function pathwayCoachNote(pathway: SchoolPathway): string {
  if (pathway === 'domestic_cn') {
    return '导数/压轴卡点：先分类错题题型，再限时刷同型 3 道并拍照归档。';
  }
  if (pathway === 'us_intl') {
    return '多维收敛卡住时，先 Ratio Test 拆阶乘，再对照泰勒余项是否漏掉高阶无穷小。';
  }
  return '把当前最弱一科拆成今晚可交付的一道题或一页卷面证据。';
}

export function pathwayIntrusionTip(pathway: SchoolPathway, baselineSuffix: string): string {
  if (pathway === 'domestic_cn') {
    return `今晚主攻数学/物理/信息学之一，交卷面或错题本照片。${baselineSuffix}`;
  }
  return `今晚只做一块攻坚：把当前卡点撞穿。${baselineSuffix}`;
}

export function pathwayMentorOpening(
  targetSchool: string,
  challengeIndex: number,
  pathway: SchoolPathway,
): string {
  if (pathway === 'domestic_cn') {
    return `曦宝，复盘你与【${targetSchool}】的对标差距：命运阻力 ${challengeIndex}%。高考/竞赛节点上的拖延正在放大分差，今晚必须交一份可验证的学业证据。`;
  }
  return `曦宝，DeepSeek 复盘了你与【${targetSchool}】的门槛：当前命运阻力 ${challengeIndex}%。标化与弱项上的拖延正在放大差距，今晚必须落地一个可验证的改变。`;
}
