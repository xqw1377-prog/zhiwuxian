/**
 * ZHI · 每日自动复盘 + 计划修正（基于进度快照，快速响应学习变化）
 */

import {
  getDailyReview,
  listAnchorUserIds,
  reviewDateKey,
  saveDailyReview,
  type PlanCorrectionDto,
} from '../db/zhi-daily-review-schema';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import {
  getMentorPlanView,
  upsertMentorPlan,
  type DynamicMilestone,
} from '../db/school-matrix';
import { buildLearningProgressDashboard } from './learning-progress-dashboard';
import { getSnapshotNear } from '../db/zhi-progress-history-schema';
import { mergeLanguageIntoPlanCorrections } from './zhi-language-progress';

export type DailyReviewDto = {
  reviewDate: string;
  dreamPct: number;
  dreamDelta: number;
  subjectDeltas: Array<{ id: string; name: string; deltaPct: number; progressPct: number }>;
  retrospective: string[];
  planCorrections: PlanCorrectionDto[];
  revisedMission: string;
  chatText: string;
  headline: string;
  applied: boolean;
};

function rowToDto(row: ReturnType<typeof getDailyReview>): DailyReviewDto | null {
  if (!row) return null;
  return {
    reviewDate: row.review_date,
    dreamPct: row.dream_pct,
    dreamDelta: row.dream_delta,
    subjectDeltas: JSON.parse(row.subject_deltas_json) as DailyReviewDto['subjectDeltas'],
    retrospective: JSON.parse(row.retrospective_json) as string[],
    planCorrections: JSON.parse(row.plan_corrections_json) as PlanCorrectionDto[],
    revisedMission: row.revised_mission,
    chatText: row.chat_text,
    headline: `每日复盘 · ${row.review_date}`,
    applied: row.applied_at > 0,
  };
}

function buildRetrospective(input: {
  dreamDelta: number;
  dreamPct: number;
  daysRemaining: number;
  subjects: Array<{ id: string; name: string; deltaPct: number; progressPct: number; trend: string }>;
  lagging: string[];
  advancing: string[];
}): string[] {
  const lines: string[] = [];
  if (input.dreamDelta > 0) {
    lines.push(`梦校确定性 +${input.dreamDelta}%（当前 ${input.dreamPct}%），节奏在抬升。`);
  } else if (input.dreamDelta < 0) {
    lines.push(`梦校确定性 ${input.dreamDelta}%（当前 ${input.dreamPct}%），昨天执行掉链，阻力回升。`);
  } else {
    lines.push(`梦校确定性维持 ${input.dreamPct}%，距入学 ${input.daysRemaining} 天，时间仍在流逝。`);
  }
  if (input.advancing.length) {
    lines.push(`推进项：${input.advancing.join('、')}。`);
  }
  if (input.lagging.length) {
    lines.push(`滞后项：${input.lagging.join('、')}——今日计划已加码修正。`);
  }
  const flat = input.subjects.filter((s) => Math.abs(s.deltaPct) < 0.5 && s.progressPct < 40);
  if (flat.length && !input.lagging.length) {
    lines.push(`${flat.map((s) => s.name).join('、')} 尚无可见增量，需要物理证据（卷面/录音）。`);
  }
  return lines;
}

function buildPlanCorrections(input: {
  subjects: Array<{ id: string; name: string; progressPct: number; deltaPct: number }>;
  activeMission?: string;
  daysRemaining: number;
}): { corrections: PlanCorrectionDto[]; revisedMission: string } {
  const sorted = [...input.subjects].sort((a, b) => a.progressPct - b.progressPct);
  const weakest = sorted.slice(0, 2);
  const corrections: PlanCorrectionDto[] = weakest.map((s, i) => ({
    subjectId: s.id,
    subjectName: s.name,
    action:
      s.id === 'toefl'
        ? `托福：完成 1 套听力 + 精读 1 篇学术文章，错题标注因果`
        : s.id === 'sat'
          ? `SAT：数学限时 25 题 + 错题归因（禁止只抄答案）`
          : s.id === 'algo'
            ? `算法/项目：推进 1 个可追问成果（USACO/开源 commit/题单 8 题）`
            : s.id === 'essay'
              ? `文书：写出 150 字「成长因果链」草稿，发我归档`
              : `${s.name}：完成 1 小时专注 + 拍照上传卷面/笔记`,
    priority: i === 0 ? 'P0' : 'P1',
    dueBy: i === 0 ? '今晚 22:00' : '明晚 22:00',
  }));

  if (corrections.length === 0) {
    corrections.push({
      subjectId: 'general',
      subjectName: '综合',
      action: '按倒计时表「进行中」节点完成 1 项可验证交付（截图/录音）',
      priority: 'P0',
      dueBy: '今晚 22:00',
    });
  }

  const p0 = corrections.find((c) => c.priority === 'P0');
  const revisedMission = [
    `【今日修正战役 · ${reviewDateKey()}】`,
    p0 ? `P0：${p0.action}` : corrections[0].action,
    input.daysRemaining <= 120 ? '窗口偏紧，禁止用「查资料」代替做题。' : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { corrections, revisedMission };
}

function applyPlanCorrectionsToMentor(userId: string, revisedMission: string): boolean {
  const plan = getMentorPlanView(userId);
  if (!plan?.dynamicMilestones?.length) return false;

  const milestones: DynamicMilestone[] = plan.dynamicMilestones.map((m, i) => {
    if (m.status === 'IN_PROGRESS' || i === 0) {
      return {
        ...m,
        mission: revisedMission,
        mentorWhisper: `今日复盘已修正计划：按 P0 执行，别空查。`,
      };
    }
    return m;
  });

  upsertMentorPlan({
    userId,
    targetSchool: plan.targetSchool,
    currentBaseline: plan.currentBaseline,
    mentorWakeUpCall: plan.mentorWakeUpCall,
    challengeIndex: plan.challengeIndex,
    causalityGaps: plan.causalityGaps,
    dynamicMilestones: milestones,
  });
  return true;
}

function formatChatText(dto: Omit<DailyReviewDto, 'chatText' | 'headline' | 'applied'>): string {
  const retro = dto.retrospective.map((l) => `  · ${l}`).join('\n');
  const fixes = dto.planCorrections
    .map((c) => `  · [${c.priority}] ${c.subjectName}（${c.dueBy}）\n      → ${c.action}`)
    .join('\n');
  const deltas = dto.subjectDeltas
    .filter((s) => s.deltaPct !== 0)
    .map((s) => `  · ${s.name}：${s.deltaPct > 0 ? '+' : ''}${s.deltaPct}% → 现 ${s.progressPct}%`)
    .join('\n');

  return [
    `曦宝，【每日复盘 · ${dto.reviewDate}】我已读完你的进度数据，并修正了今日计划。`,
    '',
    '【昨日→今日 · 数据复盘】',
    retro || '  · 暂缺昨日快照，今日起每小时记录，明天对比会更准。',
    deltas ? `\n【分科波动】\n${deltas}` : '',
    '',
    '【计划修正 · 今日执行】',
    fixes,
    '',
    '【倒计时表已更新】',
    `  · 进行中节点任务已替换为：\n      ${dto.revisedMission.split('\n').join('\n      ')}`,
    '',
    '直接回复 P0 完成情况，或发试卷照片——我会据此再修正明日计划。',
  ].join('\n');
}

export function composeAndApplyDailyReview(
  userId: string,
  opts?: { force?: boolean },
): DailyReviewDto | null {
  const uid = userId.trim();
  const anchor = getSchoolAnchorProfile(uid);
  if (!anchor?.school) return null;

  const date = reviewDateKey();
  if (!opts?.force) {
    const existing = getDailyReview(uid, date);
    if (existing) return rowToDto(existing);
  }

  const dash = buildLearningProgressDashboard(uid);
  const yesterday = getSnapshotNear(uid, 86400);
  const dreamDelta = yesterday
    ? Math.round((dash.dream.certaintyPct - yesterday.dream_pct) * 10) / 10
    : dash.dream.delta7d;

  const subjectDeltas = dash.subjects.map((s) => ({
    id: s.id,
    name: s.name,
    deltaPct: s.deltaPct,
    progressPct: s.progressPct,
  }));

  const lagging = dash.subjects
    .filter((s) => s.deltaPct < 0 || s.progressPct < 35)
    .map((s) => `${s.name}(${s.progressPct}%)`);
  const advancing = dash.subjects
    .filter((s) => s.deltaPct > 0)
    .map((s) => `${s.name}+${s.deltaPct}%`);

  const retrospective = buildRetrospective({
    dreamDelta,
    dreamPct: dash.dream.certaintyPct,
    daysRemaining: dash.dream.daysRemaining,
    subjects: dash.subjects,
    lagging,
    advancing,
  });

  const plan = getMentorPlanView(uid);
  const active = plan?.dynamicMilestones?.find((m) => m.status === 'IN_PROGRESS');
  const { corrections: baseCorrections, revisedMission: baseMission } = buildPlanCorrections({
    subjects: subjectDeltas,
    activeMission: active?.mission,
    daysRemaining: dash.dream.daysRemaining,
  });
  const planCorrections = mergeLanguageIntoPlanCorrections(uid, baseCorrections, subjectDeltas);
  const p0 = planCorrections.find((c) => c.priority === 'P0');
  const revisedMission =
    p0 && p0.subjectId === 'toefl' && baseCorrections[0]?.action !== p0.action
      ? [`【今日修正战役 · ${reviewDateKey()}】`, `P0：${p0.action}`, '窗口偏紧时口语优先于空查资料。'].join('\n')
      : baseMission;

  const payload = {
    reviewDate: date,
    dreamPct: dash.dream.certaintyPct,
    dreamDelta,
    subjectDeltas,
    retrospective,
    planCorrections,
    revisedMission,
  };

  const chatText = formatChatText(payload);
  applyPlanCorrectionsToMentor(uid, revisedMission);

  const row = saveDailyReview({
    userId: uid,
    reviewDate: date,
    dreamPct: payload.dreamPct,
    dreamDelta: payload.dreamDelta,
    subjectDeltas: payload.subjectDeltas,
    retrospective: payload.retrospective,
    planCorrections: payload.planCorrections,
    revisedMission: payload.revisedMission,
    chatText,
  });

  return rowToDto(row);
}

export function getTodayDailyReview(userId: string): DailyReviewDto | null {
  return rowToDto(getDailyReview(userId.trim(), reviewDateKey()));
}

export function getOrCreateDailyReview(userId: string, opts?: { force?: boolean }): DailyReviewDto | null {
  const uid = userId.trim();
  const date = reviewDateKey();
  if (!opts?.force) {
    const existing = getDailyReview(uid, date);
    if (existing) return rowToDto(existing);
  }
  return composeAndApplyDailyReview(uid, opts);
}

export function needsDailyReviewToday(userId: string): boolean {
  const anchor = getSchoolAnchorProfile(userId.trim());
  if (!anchor?.school) return false;
  return !getDailyReview(userId.trim(), reviewDateKey());
}

export function runDailyReviewBatch(maxUsers = 50): number {
  let count = 0;
  const date = reviewDateKey();
  for (const uid of listAnchorUserIds().slice(0, maxUsers)) {
    if (getDailyReview(uid, date)) continue;
    try {
      if (composeAndApplyDailyReview(uid)) count += 1;
    } catch (err) {
      console.warn('[DailyReview] skip', uid, err);
    }
  }
  return count;
}
