/**
 * ZHI · 因果汇报（结构化：完成 / 卡点 / 明日交付 → 复盘与计划修正）
 */

import { getMentorPlanView } from '../db/school-matrix';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { applyStructuredBaseline } from './zhi-baseline-intake';
import { getOrCreateDailyReview } from './zhi-daily-review-engine';
import { WARP_COST } from './billing-hub';
import { resolveUserLlm } from './deepseek-client';
import { gatewayJsonCompletion } from './llm-gateway';
import { loadAnchorBriefForUser } from './school-anchor-brief';
import { getLanguageTutorProgress } from './zhi-language-progress';
import { recordEvolutionMilestone } from './zhi-evolution-ledger';
import { rebuildLearningPathFromEvidence } from './learning-path-engine';

export type CausalReportInput = {
  userId: string;
  completed: string;
  stuck: string;
  deliverable: string;
  subject?: string;
};

export type CausalReportResult = {
  zhiOpening: string;
  zhiTip: string;
  zhiCoachNote: string;
  chatText: string;
  weakSubjects: string[];
  dailyReviewReady: boolean;
  review: ReturnType<typeof getOrCreateDailyReview>;
  languageCoachLine?: string;
  openLanguageCoach?: boolean;
  openVideoLearn?: boolean;
};

function parseJsonFromLlm(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fence ? fence[1] : trimmed).trim());
}

export async function processCausalReport(input: CausalReportInput): Promise<CausalReportResult> {
  const uid = input.userId.trim();
  const completed = input.completed.trim();
  const stuck = input.stuck.trim();
  const deliverable = input.deliverable.trim();
  if (!completed && !stuck && !deliverable) {
    throw new Error('请至少填写一项：完成 / 卡点 / 明日交付');
  }

  const anchor = getSchoolAnchorProfile(uid);
  const plan = getMentorPlanView(uid);
  const brief = loadAnchorBriefForUser(uid);
  const activeMission = brief?.dynamicMilestones?.find((m) => m.status === 'IN_PROGRESS');

  if (!resolveUserLlm(uid) && !process.env.DEEPSEEK_API_KEY?.trim()) {
    throw new Error('平台算力未就绪：请配置 DEEPSEEK_API_KEY');
  }

  const system = `你是 ZHI 因果汇报官。学生按结构化三项汇报，你输出 JSON：
{
  "zhiOpening": "曦宝开头，30字内，肯定或敲打",
  "zhiTip": "今晚唯一可执行动作",
  "zhiCoachNote": "针对卡点的拆解小抄，20字内",
  "weakSubjects": ["薄弱科目或模块，最多3个"],
  "summary": "两句归档摘要"
}
梦校：${plan?.targetSchool ?? anchor?.school ?? '未锁定'} · 阻力 ${plan?.challengeIndex ?? 88}%
当前战役：${activeMission ? `${activeMission.codeName} → ${activeMission.mission}` : '见左侧倒计时'}`;

  const userMsg = [
    input.subject?.trim() ? `科目：${input.subject.trim()}` : '',
    `【完成】${completed || '（未填）'}`,
    `【卡点】${stuck || '（未填）'}`,
    `【明日交付】${deliverable || '（未填）'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const gw = await gatewayJsonCompletion<{
    zhiOpening?: string;
    zhiTip?: string;
    zhiCoachNote?: string;
    weakSubjects?: string[];
    summary?: string;
  }>(uid, [
    { role: 'system', content: system },
    { role: 'user', content: userMsg },
  ], {
    traceId: `causal_${uid}`,
    maxTokens: 500,
    temperature: 0.3,
    flatWarp: { cost: WARP_COST.CHAT_COMPLETION, reason: 'CAUSAL_REPORT' },
  });

  if (!gw.chargeOk) throw new Error('Warp 燃料不足');

  let parsed: {
    zhiOpening?: string;
    zhiTip?: string;
    zhiCoachNote?: string;
    weakSubjects?: string[];
    summary?: string;
  } = {};
  try {
    parsed = gw.data ?? (parseJsonFromLlm('') as typeof parsed);
  } catch {
    parsed = {
      zhiOpening: '曦宝，汇报收到。别用「差不多」糊弄今晚。',
      zhiTip: deliverable || '明晚 22:00 前交一项可验证成果。',
      zhiCoachNote: stuck ? '卡点先拆成可测的小步。' : '',
      weakSubjects: input.subject ? [input.subject] : [],
      summary: [completed, stuck].filter(Boolean).join('；'),
    };
  }

  const subject = input.subject?.trim() || '综合';
  const scores: Record<string, string> = {
    [`汇报·${subject}`]: [completed && `完成：${completed.slice(0, 80)}`, stuck && `卡点：${stuck.slice(0, 80)}`]
      .filter(Boolean)
      .join(' | '),
  };
  if (deliverable) scores['明日交付'] = deliverable.slice(0, 120);

  applyStructuredBaseline(uid, {
    scores,
    weakSubjects: (parsed.weakSubjects ?? []).slice(0, 4),
  });

  const review = getOrCreateDailyReview(uid, { force: true });
  void rebuildLearningPathFromEvidence(uid);

  recordEvolutionMilestone({
    userId: uid,
    battle: 'EVOLUTION_MATRIX',
    description: `因果汇报 · ${subject} · ${(parsed.summary ?? completed).slice(0, 60)}`,
  });

  const langHint = /托福|口语|TOEFL|speaking|语言/i.test(
    [input.subject, stuck, deliverable, ...(parsed.weakSubjects ?? [])].join(' '),
  );
  const videoHint = /视频|网课|B站|youtube|课程|算法课|网课/i.test(
    [input.subject, completed, stuck, deliverable, ...(parsed.weakSubjects ?? [])].join(' '),
  );
  const langProgress = langHint ? getLanguageTutorProgress(uid) : null;
  const languageCoachLine = langProgress?.todayCoachLine;

  const chatText = [
    '【因果汇报 · 已入账】',
    parsed.summary || userMsg,
    '',
    parsed.zhiOpening,
    parsed.zhiTip ? `→ ${parsed.zhiTip}` : '',
    parsed.zhiCoachNote ? `小抄：${parsed.zhiCoachNote}` : '',
    review ? '今日计划已按你的汇报重新修正，见复盘卡。' : '',
    languageCoachLine ? `口语陪练：${languageCoachLine}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    zhiOpening: String(parsed.zhiOpening ?? '曦宝，汇报收到。'),
    zhiTip: String(parsed.zhiTip ?? deliverable),
    zhiCoachNote: String(parsed.zhiCoachNote ?? ''),
    chatText,
    weakSubjects: parsed.weakSubjects ?? [],
    dailyReviewReady: Boolean(review),
    review,
    languageCoachLine,
    openLanguageCoach: Boolean(langHint),
    openVideoLearn: Boolean(videoHint),
  };
}
