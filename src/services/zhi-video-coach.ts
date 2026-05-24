/**
 * ZHI · 视频学习陪看：章节卡点出题、掌握度入账、日复盘联动
 */

import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { getMentorPlanView } from '../db/school-matrix';
import { WARP_COST } from './billing-hub';
import { gatewayJsonCompletion } from './llm-gateway';
import { resolveUserLlm } from './deepseek-client';
import { applyStructuredBaseline } from './zhi-baseline-intake';
import { getOrCreateDailyReview, getTodayDailyReview } from './zhi-daily-review-engine';
import { recordEvolutionMilestone } from './zhi-evolution-ledger';
import {
  countPassedChaptersForCourse,
  listRecentVideoSessions,
  listVideoStudyDays,
  saveVideoCheckpoint,
} from '../db/zhi-video-session-schema';

export type VideoLearnContextDto = {
  headline: string;
  zhiBrief: string;
  focusSubject: string;
  todayP0Action: string | null;
  streakHint: string;
  studyCurve7d: Array<{ date: string; checkpoints: number; avgMastery: number | null; passed: number }>;
  totalCheckpoints: number;
  recentChapters: string[];
};

export type VideoCheckpointAskDto = {
  question: string;
  coachLine: string;
  checkType: 'recall' | 'apply' | 'connect';
};

export type VideoCheckpointEvalDto = {
  masteryScore: number;
  passed: boolean;
  whatWorked: string[];
  gapFix: string;
  coachFeedback: string;
  rewatchHint: string | null;
  sessionId: string;
};

const CHECKPOINT_ASK_SYSTEM = `你是曦宝的视频学习陪看老师（像真人坐旁边一起看课）。
根据章节标题出题，检验是否真懂而非假装看完。
原则：
1) 问题要短、可 30 秒内口头或文字回答
2) 类型 checkType：recall=回忆定义/步骤，apply=小应用场景，connect=和前后章/梦校目标的联系
3) coachLine 像真人：一句鼓励 + 一句要求
严格 JSON：
{
  "question": "一个问题",
  "coachLine": "陪看口吻，40字内",
  "checkType": "recall|apply|connect"
}`;

const CHECKPOINT_EVAL_SYSTEM = `你是视频学习陪看老师，批改学生对章节卡点的回答。
原则：先肯定具体做对的一点，再只指出 1 个最大漏洞，masteryScore 0-100。
passed=true 当 masteryScore>=70 且回答非敷衍。
严格 JSON：
{
  "masteryScore": 75,
  "passed": true,
  "whatWorked": ["..."],
  "gapFix": "一句人话",
  "coachFeedback": "陪看总评，50字内",
  "rewatchHint": "需要回看的时间段提示，或 null"
}`;

function inferFocusSubject(userId: string): string {
  const review = getTodayDailyReview(userId);
  const p0 = review?.planCorrections?.find((c) => c.priority === 'P0');
  if (p0?.subjectName) return p0.subjectName.replace(/[：:].*/, '').trim();
  const anchor = getSchoolAnchorProfile(userId);
  if (anchor?.major?.includes('CS') || anchor?.major?.includes('计算机')) return '算法';
  return '综合';
}

export function getVideoLearnContext(userId: string): VideoLearnContextDto {
  const uid = userId.trim();
  const anchor = getSchoolAnchorProfile(uid);
  const plan = getMentorPlanView(uid);
  const review = getTodayDailyReview(uid);
  const p0 = review?.planCorrections?.find((c) => c.priority === 'P0');
  const focusSubject = inferFocusSubject(uid);
  const sessions = listRecentVideoSessions(uid, 20);
  const curve = listVideoStudyDays(uid, 7);
  const recentChapters = [...new Set(sessions.map((s) => s.chapter_title))].slice(0, 5);

  const activeDays = curve.filter((d) => d.checkpoints > 0).length;
  const streakHint =
    activeDays >= 3 ? `近 7 日有 ${activeDays} 天视频卡点，节奏不错。` : '看完一段就答一题，别囤着不检验。';

  const school = anchor?.school ?? plan?.targetSchool ?? '梦校';
  const headline = `${school} · 视频陪看 · 今日侧重 ${focusSubject}`;
  const zhiBrief = p0
    ? `日复盘 P0 相关：${p0.action.slice(0, 100)}… 看视频时对照这条执行。`
    : '粘贴链接或本地视频 → 生成章节 → 到点 ZHI 提问，答完入账左侧进度。';

  return {
    headline,
    zhiBrief,
    focusSubject,
    todayP0Action: p0?.action ?? null,
    streakHint,
    studyCurve7d: curve,
    totalCheckpoints: sessions.length,
    recentChapters,
  };
}

function heuristicAsk(chapterTitle: string, focusSubject: string): VideoCheckpointAskDto {
  return {
    question: `用你自己的话说明「${chapterTitle}」的核心要点，并举一个和${focusSubject}有关的小例子。`,
    coachLine: `好，到这一节了。别看字幕糊弄过去，30 秒说清楚。`,
    checkType: 'connect',
  };
}

function heuristicEval(chapterTitle: string, answer: string): Omit<VideoCheckpointEvalDto, 'sessionId'> {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const passed = words >= 15 || answer.trim().length >= 40;
  const masteryScore = passed ? Math.min(85, 55 + words) : Math.max(20, words * 3);
  return {
    masteryScore,
    passed,
    whatWorked: passed ? ['你愿意停下来检验，这步很重要。'] : ['至少开始回答了。'],
    gapFix: passed
      ? '下次加上「所以这意味着…」把因果说完整。'
      : '太短了：定义一句 + 例子一句 + 和前后章联系一句。',
    coachFeedback: passed
      ? `「${chapterTitle}」基本抓住了，把 gapFix 补上就稳了。`
      : `「${chapterTitle}」还没吃透，按 gapFix 重答或回看 30 秒。`,
    rewatchHint: passed ? null : '回看本章开头 30–60 秒',
  };
}

export async function askVideoCheckpoint(input: {
  userId: string;
  chapterTitle: string;
  courseId?: string;
  timestampSec?: number;
  videoTitle?: string;
}): Promise<VideoCheckpointAskDto> {
  const uid = input.userId.trim();
  const chapterTitle = input.chapterTitle.trim();
  if (!chapterTitle) throw new Error('缺少章节标题');

  const ctx = getVideoLearnContext(uid);
  if (!resolveUserLlm(uid) && !process.env.DEEPSEEK_API_KEY?.trim()) {
    return heuristicAsk(chapterTitle, ctx.focusSubject);
  }

  try {
    const gw = await gatewayJsonCompletion<Partial<VideoCheckpointAskDto>>(uid, [
      { role: 'system', content: CHECKPOINT_ASK_SYSTEM },
      {
        role: 'user',
        content: [
          `梦校侧重：${ctx.focusSubject}`,
          `视频：${input.videoTitle ?? '课程'}`,
          `章节：${chapterTitle}`,
          `时间戳：${input.timestampSec ?? 0}s`,
          ctx.todayP0Action ? `今日 P0：${ctx.todayP0Action}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ], {
      traceId: `video_ask_${uid}`,
      maxTokens: 400,
      temperature: 0.35,
      flatWarp: { cost: WARP_COST.CHAT_COMPLETION, reason: 'VIDEO_CHECKPOINT_ASK' },
    });
    if (!gw.chargeOk) return heuristicAsk(chapterTitle, ctx.focusSubject);
    const raw = gw.data ?? {};
    return {
      question: String(raw.question ?? heuristicAsk(chapterTitle, ctx.focusSubject).question).slice(0, 300),
      coachLine: String(raw.coachLine ?? '到点了，答一题。').slice(0, 120),
      checkType: raw.checkType === 'recall' || raw.checkType === 'apply' ? raw.checkType : 'connect',
    };
  } catch {
    return heuristicAsk(chapterTitle, ctx.focusSubject);
  }
}

export async function evaluateVideoCheckpoint(input: {
  userId: string;
  chapterTitle: string;
  courseId?: string;
  videoTitle?: string;
  timestampSec?: number;
  question: string;
  userAnswer: string;
}): Promise<VideoCheckpointEvalDto> {
  const uid = input.userId.trim();
  const chapterTitle = input.chapterTitle.trim();
  const userAnswer = input.userAnswer.trim();
  if (!userAnswer) throw new Error('请先回答卡点问题');

  const ctx = getVideoLearnContext(uid);
  let evalBody: Omit<VideoCheckpointEvalDto, 'sessionId'> = heuristicEval(chapterTitle, userAnswer);

  if (resolveUserLlm(uid) || process.env.DEEPSEEK_API_KEY?.trim()) {
    try {
      const gw = await gatewayJsonCompletion<Partial<VideoCheckpointEvalDto>>(uid, [
        { role: 'system', content: CHECKPOINT_EVAL_SYSTEM },
        {
          role: 'user',
          content: `章节：${chapterTitle}\n问题：${input.question}\n学生答：${userAnswer}\n侧重：${ctx.focusSubject}`,
        },
      ], {
        traceId: `video_eval_${uid}`,
        maxTokens: 500,
        temperature: 0.3,
        flatWarp: { cost: WARP_COST.CHAT_COMPLETION, reason: 'VIDEO_CHECKPOINT_EVAL' },
      });
      if (gw.chargeOk && gw.data) {
        const raw = gw.data;
        const fallback = heuristicEval(chapterTitle, userAnswer);
        evalBody = {
          masteryScore: Number(raw.masteryScore ?? fallback.masteryScore),
          passed: raw.passed != null ? Boolean(raw.passed) : fallback.passed,
          whatWorked: Array.isArray(raw.whatWorked)
            ? raw.whatWorked.map((w) => String(w).slice(0, 120)).slice(0, 2)
            : fallback.whatWorked,
          gapFix: String(raw.gapFix ?? fallback.gapFix).slice(0, 200),
          coachFeedback: String(raw.coachFeedback ?? fallback.coachFeedback).slice(0, 200),
          rewatchHint: raw.rewatchHint ? String(raw.rewatchHint).slice(0, 120) : fallback.rewatchHint,
        };
      }
    } catch {
      evalBody = heuristicEval(chapterTitle, userAnswer);
    }
  }

  const row = saveVideoCheckpoint({
    userId: uid,
    courseId: input.courseId,
    videoTitle: input.videoTitle,
    chapterTitle,
    timestampSec: input.timestampSec ?? 0,
    question: input.question,
    userAnswer,
    masteryScore: evalBody.masteryScore,
    gapFix: evalBody.gapFix,
    passed: evalBody.passed,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  applyStructuredBaseline(uid, {
    scores: {
      [`视频·${ctx.focusSubject}`]: `${chapterTitle} 掌握${Math.round(evalBody.masteryScore)}%（${stamp}）`,
      最近视频练: stamp,
    },
  });

  getOrCreateDailyReview(uid, { force: true });

  recordEvolutionMilestone({
    userId: uid,
    battle: 'VIDEO_LEARN',
    description: `视频卡点 · ${chapterTitle.slice(0, 40)} · 掌握${Math.round(evalBody.masteryScore)}%`,
    amountHint: evalBody.passed ? 1 : 0,
  });

  return { ...evalBody, sessionId: row.id };
}

export function getVideoCourseProgress(userId: string, courseId: string, totalChapters: number): {
  passedChapters: number;
  totalChapters: number;
  progressPct: number;
} {
  const passed = countPassedChaptersForCourse(userId, courseId);
  const total = Math.max(1, totalChapters);
  return {
    passedChapters: passed,
    totalChapters: total,
    progressPct: Math.min(100, Math.round((passed / total) * 100)),
  };
}
