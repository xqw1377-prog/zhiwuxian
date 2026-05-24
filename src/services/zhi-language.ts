/**
 * WUXIAN · 【ZHI】多维多模态语言拦截舱
 * 托福/雅思口语与写作：反假装流利、因果清算
 */

import { applyDestinyReduction, getMentorPlanView, getSchoolMatrixRow } from '../db/school-matrix';
import { resolveUserLlm } from './deepseek-client';
import { assertWarpBalance, WARP_COST } from './billing-hub';
import { gatewayJsonCompletion } from './llm-gateway';
import {
  applyLanguageEvalToProgress,
  applyTutorShadowPass,
  getLanguageMission,
  markLanguageShadowPassed,
} from './zhi-language-coach';
import {
  buildTutorMission,
  HUMAN_TUTOR_EVAL_SYSTEM,
  HUMAN_TUTOR_SHADOW_SYSTEM,
} from './zhi-language-tutor';
import { getOrCreateDailyReview } from './zhi-daily-review-engine';

export type LanguageIntakeType = 'SPEAKING' | 'WRITING';
export type LanguageExamTrack = 'TOEFL' | 'IELTS';

export interface ZhiLanguageEvalResult {
  success: boolean;
  msg?: string;
  estimatedScore: string;
  ieltsEquivalent: string;
  fatalFlaws: string[];
  whatWorked?: string[];
  priorityFix?: string;
  microDrill?: string;
  focusSkill?: string;
  weakTags?: string[];
  zhiChallenge: string;
  zhiReckoning: string;
  warpPointsRemaining: number;
  warpDeducted: number;
  challengeIndex: number;
  scoreNumeric?: number | null;
  currentToefl?: number;
  toeflTarget?: number;
  gapToefl?: number;
  progressPct?: number;
  levelBand?: string;
  speakingEst?: number;
  streakDays?: number;
}

export interface ZhiLanguageShadowResult {
  passed: boolean;
  zhiReckoning: string;
  warpPointsRemaining: number;
  warpDeducted: number;
  challengeIndex: number;
  reductionApplied: number;
}

function parseEvalJson(content: string): Partial<ZhiLanguageEvalResult> | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    const flaws = raw.fatalFlaws ?? raw.fatal_flaws;
    const list = Array.isArray(flaws)
      ? flaws.map((f) => String(f).trim()).filter(Boolean).slice(0, 3)
      : [];
    const worked = raw.whatWorked ?? raw.what_worked;
    const whatWorked = Array.isArray(worked)
      ? worked.map((w) => String(w).trim()).filter(Boolean).slice(0, 2)
      : [];
    const tags = raw.weakTags ?? raw.weak_tags;
    const weakTags = Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 3)
      : [];
    return {
      estimatedScore: String(raw.estimatedScore ?? '').trim().slice(0, 80),
      ieltsEquivalent: String(raw.ieltsEquivalent ?? raw.ielts_equivalent ?? '—').trim().slice(0, 40),
      fatalFlaws: list,
      whatWorked,
      priorityFix: String(raw.priorityFix ?? raw.priority_fix ?? '').trim().slice(0, 200),
      microDrill: String(raw.microDrill ?? raw.micro_drill ?? '').trim().slice(0, 300),
      focusSkill: String(raw.focusSkill ?? raw.focus_skill ?? '').trim().slice(0, 40),
      weakTags,
      zhiChallenge: String(raw.zhiChallenge ?? '').trim().slice(0, 300),
      zhiReckoning: String(raw.zhiReckoning ?? '').trim().slice(0, 200),
    };
  } catch {
    return null;
  }
}

function heuristicEval(
  type: LanguageIntakeType,
  exam: LanguageExamTrack,
  content: string,
): Omit<
  ZhiLanguageEvalResult,
  'success' | 'warpPointsRemaining' | 'warpDeducted' | 'challengeIndex' | 'scoreNumeric' | 'currentToefl' | 'toeflTarget' | 'gapToefl' | 'progressPct' | 'streakDays'
> {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const filler = (content.match(/\b(um|uh|like|you know|嗯|啊)\b/gi) ?? []).length;
  const score =
    exam === 'IELTS'
      ? type === 'SPEAKING'
        ? '雅思口语预估：6.0'
        : '雅思写作预估：6.0'
      : type === 'SPEAKING'
        ? '托福口语预估：21/30'
        : '托福写作预估：22/30';

  const whatWorked =
    wordCount >= 30
      ? ['你撑满了答题窗口，信息量够练。']
      : ['你愿意开口练，这步很重要。'];
  const priorityFix =
    filler >= 3
      ? '先砍掉 um/uh/嗯啊，停顿可以，别用填充词拖时间。'
      : wordCount < 40 && type === 'SPEAKING'
        ? '观点一句 + because + For example，45 秒内说完这三段。'
        : '把 good/important 换成更具体的词，比如 beneficial / crucial。';

  return {
    estimatedScore: score,
    ieltsEquivalent: '6.0',
    whatWorked,
    priorityFix,
    fatalFlaws: [priorityFix].slice(0, 2),
    weakTags: filler >= 3 ? ['fluency'] : wordCount < 40 ? ['logic'] : ['vocab'],
    focusSkill: filler >= 3 ? 'fluency' : 'logic',
    microDrill: '跟读 3 遍：I believe… because… For example…，中间不许嗯啊。',
    zhiChallenge:
      '用 I believe… because… For example… 重说一遍，去掉嗯啊，例子要具体。',
    zhiReckoning: `练得不错。今天只改一点：${priorityFix.slice(0, 50)} 做完 microDrill 再录影子句。`,
  };
}

export class ZhiLanguageEngine {
  /**
   * 托福/雅思口语与写作主动清算（8 Warp）
   */
  static async evaluateLanguageIntake(input: {
    userId: string;
    type: LanguageIntakeType;
    userContent: string;
    taskPrompt: string;
    examTrack?: LanguageExamTrack;
  }): Promise<ZhiLanguageEvalResult> {
    const uid = input.userId.trim();
    const userContent = input.userContent.trim();
    const taskPrompt = input.taskPrompt.trim();
    const type = input.type;
    const exam = input.examTrack ?? 'TOEFL';

    if (!uid) throw new Error('缺少 userId');
    if (!userContent) throw new Error('缺少语言输出内容');

    const plan = getMentorPlanView(uid);
    const row = getSchoolMatrixRow(uid);
    const challengeIndex = Number(plan?.challengeIndex ?? row?.challenge_index ?? 92);

    const balance = assertWarpBalance(uid, WARP_COST.LANGUAGE_EVAL);
    if (!balance.ok) {
      return {
        success: false,
        msg: 'Warp 燃料不足，无法驱动 ZHI 语言矩阵。',
        estimatedScore: '',
        ieltsEquivalent: '',
        fatalFlaws: [],
        zhiChallenge: '',
        zhiReckoning: '曦宝，托管算力见底。语言矩阵熄火——先充值。',
        warpPointsRemaining: balance.remaining,
        warpDeducted: 0,
        challengeIndex,
      };
    }

    if (!resolveUserLlm(uid) && !process.env.DEEPSEEK_API_KEY?.trim()) {
      const h = heuristicEval(type, exam, userContent);
      return {
        success: true,
        ...h,
        warpPointsRemaining: balance.remaining,
        warpDeducted: 0,
        challengeIndex,
      };
    }

    const tutor = buildTutorMission(uid);

    const gw = await gatewayJsonCompletion<Partial<ZhiLanguageEvalResult>>(uid, [
      { role: 'system', content: HUMAN_TUTOR_EVAL_SYSTEM },
      {
        role: 'user',
        content: [
          `【水平档】${tutor.levelBand}（口语估分 ${tutor.speakingEst}/30）`,
          `【今日突破】${tutor.focusSkill}`,
          `【弱项标签】${tutor.weakTags.join(', ')}`,
          `【考试轨】${exam} | 【类型】${type}`,
          `【题目】${taskPrompt}`,
          `【学生输出】\n${userContent}`,
        ].join('\n'),
      },
    ], {
      traceId: `lang_eval_${uid}`,
      maxTokens: 900,
      flatWarp: { cost: WARP_COST.LANGUAGE_EVAL, reason: 'LANGUAGE_EVAL' },
    });

    if (!gw.chargeOk) {
      return {
        success: false,
        msg: 'Warp 燃料不足，无法驱动 ZHI 语言矩阵。',
        estimatedScore: '',
        ieltsEquivalent: '',
        fatalFlaws: [],
        zhiChallenge: '',
        zhiReckoning: '曦宝，算力清算失败。',
        warpPointsRemaining: gw.warpRemaining,
        warpDeducted: 0,
        challengeIndex,
      };
    }

    let parsed: Partial<ZhiLanguageEvalResult> | null = gw.data;
    if (!parsed && gw.usedFallback) {
      console.warn('[ZhiLanguage] DeepSeek 降级:', gw.error);
    } else if (parsed) {
      parsed = parseEvalJson(JSON.stringify(parsed)) ?? parsed;
    }

    const fallback = heuristicEval(type, exam, userContent);
    const base = parsed ? { ...fallback, ...parsed } : fallback;

    const mission = getLanguageMission(uid);
    const flaws = base.fatalFlaws.length ? base.fatalFlaws : fallback.fatalFlaws;
    const estimatedScore = base.estimatedScore || (exam === 'IELTS' ? '雅思 6.0' : '托福口语 21/30');
    const whatWorked = base.whatWorked?.length ? base.whatWorked : fallback.whatWorked ?? [];
    const priorityFix = base.priorityFix || fallback.priorityFix || '';
    const microDrill = base.microDrill || tutor.microDrill;
    const focusSkill = base.focusSkill || tutor.focusSkill;
    const weakTags = base.weakTags?.length ? base.weakTags : tutor.weakTags;

    const progress = applyLanguageEvalToProgress({
      userId: uid,
      examTrack: exam,
      intakeType: type,
      taskPrompt,
      estimatedScore,
      ieltsEquivalent: base.ieltsEquivalent || '6.0',
      userContent,
      fatalFlaws: flaws,
      whatWorked,
      priorityFix,
      microDrill,
      focusSkill,
      weakTags,
    });

    return {
      success: true,
      estimatedScore,
      ieltsEquivalent: base.ieltsEquivalent || '6.0',
      fatalFlaws: flaws,
      whatWorked,
      priorityFix,
      microDrill,
      focusSkill,
      weakTags,
      zhiChallenge: base.zhiChallenge || '按陪练示范句重说一遍，去掉嗯啊。',
      zhiReckoning:
        (base.zhiReckoning || '练完啦，先做 microDrill，再进影子关。') +
        (progress.scoreNumeric != null
          ? ` 口语约 ${progress.scoreNumeric}/30 已记入档案。`
          : ''),
      warpPointsRemaining: gw.warpRemaining,
      warpDeducted: gw.warpDeducted,
      challengeIndex,
      scoreNumeric: progress.scoreNumeric,
      currentToefl: progress.currentToefl,
      toeflTarget: mission.targetToefl,
      gapToefl: mission.gapToefl,
      progressPct: progress.progressPct,
      levelBand: progress.levelBand,
      speakingEst: progress.speakingEst,
      streakDays: progress.streakDays,
    };
  }

  /**
   * 语言影子关卡：重录/重写验证（2 Warp，通过则 −4% 命运阻力）
   */
  static async verifyLanguageShadow(input: {
    userId: string;
    attempt: string;
    zhiChallenge: string;
    type: LanguageIntakeType;
  }): Promise<ZhiLanguageShadowResult> {
    const uid = input.userId.trim();
    const attempt = input.attempt.trim();
    if (!uid) throw new Error('缺少 userId');
    if (!attempt) throw new Error('请提交重录或重写内容');

    const plan = getMentorPlanView(uid);
    let challengeIndex = Number(plan?.challengeIndex ?? 92);

    const balance = assertWarpBalance(uid, WARP_COST.MENTOR_INTERVENTION);
    let warpRemaining = balance.remaining;
    let warpDeducted = 0;

    const tutor = buildTutorMission(uid);
    let passed = attempt.length >= 15;
    let zhiReckoning = passed
      ? '影子句过关了，这个习惯今天算立住了。'
      : '还差一点点：按挑战句里的逻辑或词汇再录一遍，别重复原句。';

    if (balance.ok && (resolveUserLlm(uid) || process.env.DEEPSEEK_API_KEY?.trim())) {
      const gw = await gatewayJsonCompletion<{ passed?: boolean; zhiReckoning?: string }>(uid, [
        { role: 'system', content: HUMAN_TUTOR_SHADOW_SYSTEM },
        {
          role: 'user',
          content: `水平: ${tutor.levelBand}\n类型: ${input.type}\n影子挑战: ${input.zhiChallenge}\n学生重录:\n${attempt}`,
        },
      ], {
        traceId: `lang_shadow_${uid}`,
        maxTokens: 280,
        flatWarp: { cost: WARP_COST.MENTOR_INTERVENTION, reason: 'LANGUAGE_SHADOW' },
      });
      warpRemaining = gw.warpRemaining;
      warpDeducted = gw.warpDeducted;
      if (gw.data) {
        if (gw.data.passed != null) passed = Boolean(gw.data.passed);
        if (gw.data.zhiReckoning) zhiReckoning = String(gw.data.zhiReckoning).slice(0, 200);
      }
    }

    let reductionApplied = 0;
    if (passed) {
      markLanguageShadowPassed(uid);
      applyTutorShadowPass(uid, {
        focusSkill: tutor.focusSkill,
        weakTags: tutor.weakTags,
        priorityFix: '影子关已通过',
        microDrill: tutor.microDrill,
      });
      const applied = applyDestinyReduction(
        uid,
        4,
        1,
        '曦宝，语言影子关卡已撞穿。托福/雅思因果链回正，阻力削掉 4 个点。',
      );
      if (applied) {
        challengeIndex = applied.challengeIndex;
        reductionApplied = applied.reduction;
        zhiReckoning = applied.mentorWhisper;
      }
      getOrCreateDailyReview(uid, { force: true });
    }

    return {
      passed,
      zhiReckoning,
      warpPointsRemaining: warpRemaining,
      warpDeducted,
      challengeIndex,
      reductionApplied,
    };
  }
}
