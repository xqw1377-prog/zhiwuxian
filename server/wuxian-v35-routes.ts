/**
 * WUXIAN 3.5 · DeepSeek 主动导师 + 平台算力托管
 */

import type { Application, Request, Response, NextFunction } from 'express';
import { ValidationError } from './errors';
import { trustedBodyUserId, trustedParamUserId, trustedQueryUserId } from './trusted-user-id';
import { DeepSeekActiveMentor } from '../src/services/deepseek-mentor';
import { ZhiCoreEngine } from '../src/services/zhi-core';
import { ZhiTopologyEngine } from '../src/services/zhi-topology';
import { ZhiShadowEngine } from '../src/services/zhi-shadow';
import { ZhiLanguageEngine } from '../src/services/zhi-language';
import { ZhiExamEngine } from '../src/services/zhi-exam';
import { ZhiTokenSplitter } from '../src/services/zhi-token-splitter';
import {
  createCustomDirectory,
  deleteCustomDirectory,
  listUserDirectories,
  type DirectoryItemDto,
} from '../src/db/directory-schema';
import { getCoreDb, todayStr } from './wuxian-core-db';
import { applyEscapePenalty, getBillingStatus, topUpWarp, WARP_COST } from '../src/services/billing-hub';
import { getMentorPlanView } from '../src/db/school-matrix';
import {
  generateAndListZhiDirectories,
  getZhiCloudState,
  pushZhiArtifact,
  syncAnchorDirectories,
} from '../src/api/zhi-cloud-api';
import { loadAnchorBriefForUser } from '../src/services/school-anchor-brief';
import { getSchoolAnchorProfile } from '../src/db/zhi-cloud-schema';
import { buildLearningProgressDashboard } from '../src/services/learning-progress-dashboard';
import { buildEvolutionLedger } from '../src/services/zhi-evolution-ledger';
import { getOrCreateDailyReview, needsDailyReviewToday } from '../src/services/zhi-daily-review-engine';
import { recordBaselineEvidence } from '../src/services/zhi-baseline-intake';
import {
  analyzeVisionForIntake,
  confirmVisionIntake,
  listUserTextbooks,
  resolveTextbookByMeta,
} from '../src/services/zhi-vision-intake';
import { solveVisionProblem } from '../src/services/zhi-vision-solve';
import { processCausalReport } from '../src/services/zhi-causal-report';
import { computeLearningTrend } from './zhi-trend-engine';
import { getLanguageMission } from '../src/services/zhi-language-coach';
import { listRecentLanguageSessions } from '../src/db/zhi-language-session-schema';
import { getLanguageTutorProgress } from '../src/services/zhi-language-progress';
import {
  askVideoCheckpoint,
  evaluateVideoCheckpoint,
  getVideoCourseProgress,
  getVideoLearnContext,
} from '../src/services/zhi-video-coach';
import { matchCoursewareForUser, getCoursewareByIdDto, matchCoursewareForTextbookChapter } from '../src/services/zhi-courseware-matcher';
import { ingestCoursewareFromAssimilation } from '../src/services/zhi-courseware-ingest';
import { buildCoursewareCatalogAdmin, listCoursewareForReview, reviewCourseware } from '../src/services/zhi-courseware-admin';
import {
  generateDailyKpPaper,
  generateSubjectPaper,
  getAssessmentHub,
  getAssessmentPaperDto,
  submitAssessmentPaper,
  generateActiveAssessmentPaper,
} from '../src/services/zhi-learning-assessment';
import {
  buildAndPersistLearningPath,
  ensureLearningPath,
  getLearningPath,
} from '../src/services/learning-path-engine';
import { bridgeDeconstructResponse, coreDeconstruct, coreGetDirectoryWorkspace } from './wuxian-core-api';
import {
  getOrCreatePlan,
  assessDataGaps,
  generateDataRequest,
  submitUserData,
  generatePlan,
  getTodayPlan,
  adjustPlanFromAssessment,
  proactivePatrol,
  completeSlot,
  activatePlan,
  replan,
} from '../src/services/zhi-autonomous-planner';
import {
  recordMistake,
  recordMistakeBatch,
  getMistakeBank,
  getMistakesForRetry,
  reviewMistake,
  getMistakeTrend,
} from '../src/services/zhi-mistake-bank';
import {
  startSession,
  endSession,
  getActiveSession,
  getSessionSummary,
  getWeeklyReport,
} from '../src/services/zhi-learning-timer';
import {
  getAllAchievements,
  getUnlockedAchievements,
  checkAndUnlock,
} from '../src/services/zhi-achievement';
import { buildLearnerDashboard } from '../src/services/zhi-analytics';
import { teachKnowledgePoint, teachChapter, completeChapterCheckpoint, submitLessonCheckpoint, getTextbookProgress, getLesson, listLessons } from '../src/services/zhi-tutor-engine';
import { generateAdaptiveExamPaper } from '../src/services/zhi-quiz-generator';
import { generateExam, generateLargeExam, getExam, getExamDetail, getExamQuestionsPaginated, getExamProgress, startExam, answerQuestion, answerQuestionBatch, gradeExam, listExams } from '../src/services/zhi-exam-engine';
import { getProactivePush } from '../src/services/zhi-proactive-push';
import { requireAdmin } from './middleware/admin-auth';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function parseProactiveScene(
  raw: string,
): 'session_open' | 'anchor_wake' | 'return_visit' | 'daily_review' {
  const s = raw.trim();
  if (s === 'anchor_wake' || s === 'return_visit' || s === 'daily_review') return s;
  return 'session_open';
}

function sendSuccess(res: Response, data: unknown) {
  res.json({ code: 200, status: 'SUCCESS', data });
}

function wrap(handler: (req: Request, res: Response) => void | Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}

export function registerWuxianV35Routes(app: Application): void {
  app.get('/api/v3.5/billing/status/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const status = getBillingStatus(userId);
    const plan = getMentorPlanView(userId);
    sendSuccess(res, {
      ...status,
      warpCosts: WARP_COST,
      challengeIndex: plan?.challengeIndex ?? null,
      targetSchool: plan?.targetSchool ?? null,
      certaintyProgress: plan?.certaintyProgress ?? null,
    });
  }));

  app.post('/api/v3.5/billing/escape-penalty', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const missionCode = String(req.body.missionCode ?? req.body.mission ?? 'OPERATION').trim();

    const plan = getMentorPlanView(userId);
    const school = plan?.targetSchool ?? '梦校';
    const applied = applyEscapePenalty(userId);
    const mentorWords = applied.mentorWords.replace(
      '这个卡点',
      missionCode.includes('微积分') || missionCode.includes('泰勒') ? '这个微积分卡点' : `【${missionCode}】`,
    ).replace('梦校', school.includes('CMU') ? 'CMU' : school);

    sendSuccess(res, {
      ok: applied.ok,
      remainingWarp: applied.remaining,
      deducted: applied.deducted,
      mentorWords,
      targetSchool: school,
    });
  }));

  app.post('/api/v3.5/billing/topup', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const amount = Number(req.body.amount ?? req.body.warpPoints ?? 100);
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('amount 必须为正数');
    const remaining = topUpWarp(userId, amount, 'USER_TOPUP');
    sendSuccess(res, { remaining, granted: Math.round(amount) });
  }));

  app.get('/api/v3.5/cloud/state/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getZhiCloudState(userId));
  }));

  app.get('/api/v3.5/zhi/progress-dashboard/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, buildLearningProgressDashboard(userId));
  }));

  app.get('/api/v3.5/zhi/evolution-ledger/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, buildEvolutionLedger(userId));
  }));

  app.get('/api/v3.5/zhi/daily-review/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const force = String(req.query.force ?? '') === '1';
    const review = getOrCreateDailyReview(userId, { force });
    sendSuccess(res, {
      needsToday: !review && needsDailyReviewToday(userId),
      ready: Boolean(review),
      review,
    });
  }));

  app.post('/api/v3.5/zhi/daily-review/run', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const review = getOrCreateDailyReview(userId, { force: true });
    sendSuccess(res, { ready: Boolean(review), review });
  }));

  app.post('/api/v3.5/zhi/vision/analyze', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const screenshotData =
      typeof req.body.screenshotData === 'string' ? req.body.screenshotData : undefined;
    const ocrText = typeof req.body.ocrText === 'string' ? req.body.ocrText : undefined;
    const userHint = typeof req.body.userHint === 'string' ? req.body.userHint : undefined;
    sendSuccess(
      res,
      await analyzeVisionForIntake({ userId, screenshotData, ocrText, userHint }),
    );
  }));

  app.post('/api/v3.5/zhi/vision/resolve-textbook', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const title = String(req.body.title ?? '').trim();
    const publisher = String(req.body.publisher ?? '').trim();
    const subject = typeof req.body.subject === 'string' ? req.body.subject : undefined;
    const progressChapter = Number(req.body.progressChapter);
    const progressNote = typeof req.body.progressNote === 'string' ? req.body.progressNote : undefined;
    sendSuccess(
      res,
      await resolveTextbookByMeta({
        userId,
        title,
        publisher,
        subject,
        progressChapter: Number.isFinite(progressChapter) ? progressChapter : undefined,
        progressNote,
      }),
    );
  }));

  app.post('/api/v3.5/zhi/vision/confirm', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const baselineScores =
      req.body.baselineScores && typeof req.body.baselineScores === 'object'
        ? (req.body.baselineScores as Record<string, string>)
        : undefined;
    const weakSubjects = Array.isArray(req.body.weakSubjects)
      ? req.body.weakSubjects.map((s: unknown) => String(s ?? ''))
      : undefined;
    const challenge = typeof req.body.challenge === 'string' ? req.body.challenge : undefined;
    const textbookCatalogId =
      typeof req.body.textbookCatalogId === 'string' ? req.body.textbookCatalogId : undefined;
    sendSuccess(
      res,
      confirmVisionIntake({
        userId,
        baselineScores,
        weakSubjects,
        challenge,
        textbookCatalogId,
      }),
    );
  }));

  app.get('/api/v3.5/zhi/vision/textbooks/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, { items: listUserTextbooks(userId) });
  }));

  app.post('/api/v3.5/zhi/vision/solve', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const screenshotData =
      typeof req.body.screenshotData === 'string' ? req.body.screenshotData : undefined;
    const userHint = typeof req.body.userHint === 'string' ? req.body.userHint : undefined;
    sendSuccess(
      res,
      await solveVisionProblem({ userId, screenshotData, userHint }),
    );
  }));

  app.post('/api/v3.5/zhi/causal-report', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(
      res,
      await processCausalReport({
        userId,
        completed: String(req.body.completed ?? ''),
        stuck: String(req.body.stuck ?? ''),
        deliverable: String(req.body.deliverable ?? ''),
        subject: typeof req.body.subject === 'string' ? req.body.subject : undefined,
      }),
    );
  }));

  app.post('/api/v3.5/zhi/baseline/evidence', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const kindRaw = String(req.body.kind ?? 'archive').trim();
    const kind =
      kindRaw === 'vision' || kindRaw === 'chat' || kindRaw === 'voice' || kindRaw === 'video'
        ? kindRaw
        : 'archive';
    const label = typeof req.body.label === 'string' ? req.body.label : undefined;
    const excerpt = typeof req.body.excerpt === 'string' ? req.body.excerpt : undefined;
    const result = await recordBaselineEvidence({ userId, kind, label, excerpt });
    sendSuccess(res, {
      ok: true,
      ...result,
      activeExam: result.activeExam
        ? {
            paperId: result.activeExam.id,
            title: result.activeExam.title,
            subjectId: result.activeExam.subjectId,
            assessmentMode: result.activeExam.assessmentMode,
            activeIntro: result.activeExam.activeIntro,
            questionCount: result.activeExam.questions.length,
          }
        : null,
    });
  }));

  app.get('/api/v3.5/zhi/anchor-brief/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const brief = loadAnchorBriefForUser(userId);
    if (!brief) {
      sendSuccess(res, { ready: false, message: '请先完成梦校航标唤醒' });
      return;
    }
    sendSuccess(res, {
      ready: true,
      chatText: brief.chatText,
      daysRemaining: brief.daysRemaining,
      challengeIndex: brief.challengeIndex,
      timelineMilestones: brief.timelineMilestones,
      dynamicMilestones: brief.dynamicMilestones,
      requiredMetrics: brief.requiredMetrics,
      pathway: brief.pathway,
      pathwayLabel: brief.pathwayLabel,
    });
  }));

  app.post('/api/v3.5/cloud/anchor/sync', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const school = String(req.body.school ?? '').trim();
    const major = String(req.body.major ?? '').trim();
    const currentGrade = String(req.body.currentGrade ?? '').trim();
    const targetApplyAt = String(req.body.targetApplyAt ?? '').trim();
    if (!school) throw new ValidationError('缺少 school');
    if (!major) throw new ValidationError('缺少 major');
    if (!currentGrade) throw new ValidationError('缺少 currentGrade（在读年级）');
    if (!targetApplyAt) throw new ValidationError('缺少 targetApplyAt（目标入学时间）');
    sendSuccess(
      res,
      await syncAnchorDirectories({
        userId,
        school,
        major,
        currentGrade,
        targetApplyAt,
        currentSchool: String(req.body.currentSchool ?? ''),
        currentRegion: String(req.body.currentRegion ?? ''),
        targetSchoolRegion: String(req.body.targetSchoolRegion ?? ''),
      }),
    );
  }));

  app.post('/api/v3.5/cloud/directories/generate', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const school = String(req.body.school ?? '').trim();
    const major = String(req.body.major ?? '').trim();
    const currentGrade = String(req.body.currentGrade ?? '').trim();
    const targetApplyAt = String(req.body.targetApplyAt ?? '').trim();
    if (!school) throw new ValidationError('缺少 school');
    if (!major) throw new ValidationError('缺少 major');
    if (!currentGrade) throw new ValidationError('缺少 currentGrade（在读年级）');
    if (!targetApplyAt) throw new ValidationError('缺少 targetApplyAt（目标入学时间）');
    sendSuccess(
      res,
      await generateAndListZhiDirectories({
        userId,
        school,
        major,
        currentGrade,
        targetApplyAt,
        currentSchool: String(req.body.currentSchool ?? ''),
        currentRegion: String(req.body.currentRegion ?? ''),
        targetSchoolRegion: String(req.body.targetSchoolRegion ?? ''),
      }),
    );
  }));

  app.post('/api/v3.5/cloud/artifacts/push', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const dirId = String(req.body.dirId ?? '').trim();
    const title = String(req.body.title ?? '').trim();
    const content = typeof req.body.content === 'string' ? req.body.content : '';
    const version = String(req.body.version ?? 'V1').trim();
    const artifactId = typeof req.body.artifactId === 'string' ? req.body.artifactId : undefined;
    if (!dirId) throw new ValidationError('缺少 dirId');
    if (!title) throw new ValidationError('缺少 title');
    if (!content) throw new ValidationError('缺少 content');
    sendSuccess(res, await pushZhiArtifact({ userId, dirId, title, content, version, artifactId }));
  }));

  app.get('/api/v3.5/mentor/intervene', wrap(async (req, res) => {
    const userId = trustedQueryUserId(req);
    const force = param(req.query.force as string) === '1' || String(req.query.force).toLowerCase() === 'true';
    sendSuccess(res, await DeepSeekActiveMentor.checkAndIntervene(userId, { force }));
  }));

  app.post('/api/v3.5/zhi/mastermind/run', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const sceneRaw = String(req.body.scene ?? 'session_open').trim();
    const scene = parseProactiveScene(sceneRaw);
    const { runMastermindCycle } = await import('../src/services/zhi-mastermind-planner');
    sendSuccess(res, await runMastermindCycle(userId, scene));
  }));

  app.post('/api/v3.5/zhi/proactive', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const sceneRaw = String(req.body.scene ?? 'session_open').trim();
    const scene = parseProactiveScene(sceneRaw);
    const focusDirectoryId =
      typeof req.body.focusDirectoryId === 'string' ? req.body.focusDirectoryId : undefined;
    const { composeProactiveBriefAsync } = await import('../src/services/zhi-proactive-engine');
    sendSuccess(res, await composeProactiveBriefAsync(userId, scene, { focusDirectoryId }));
  }));

  app.get('/api/v3.5/zhi/proactive', wrap(async (req, res) => {
    const userId = trustedQueryUserId(req);
    const sceneRaw = String(req.query.scene ?? 'session_open').trim();
    const scene = parseProactiveScene(sceneRaw);
    const focusDirectoryId =
      typeof req.query.focusDirectoryId === 'string' ? req.query.focusDirectoryId : undefined;
    const { composeProactiveBriefAsync } = await import('../src/services/zhi-proactive-engine');
    sendSuccess(res, await composeProactiveBriefAsync(userId, scene, { focusDirectoryId }));
  }));

  /** 主动推送：错题复习 / 计划 / 重考 / 连续性问题 */
  app.get('/api/v3.5/zhi/proactive/push/:userId', wrap((req, res) => {
    sendSuccess(res, getProactivePush(trustedParamUserId(req)));
  }));

  app.post('/api/v3.5/zhi/intrusion', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const feedback =
      typeof req.body.userFeedback === 'string'
        ? req.body.userFeedback
        : typeof req.body.userText === 'string'
          ? req.body.userText
          : undefined;
    const focusDirectoryId =
      typeof req.body.focusDirectoryId === 'string' ? req.body.focusDirectoryId : undefined;
    const force = Boolean(req.body.force);
    const raw = await ZhiCoreEngine.zhiIntrusion(userId, feedback, { focusDirectoryId });
    const { enrichZhiIntrusionApiPayload } = await import('../src/services/zhi-intrusion-compat');
    sendSuccess(res, enrichZhiIntrusionApiPayload(raw, { userText: feedback, force }));
  }));

  app.get('/api/v3.5/zhi/intrusion', wrap(async (req, res) => {
    const userId = trustedQueryUserId(req);
    const feedback = typeof req.query.feedback === 'string' ? req.query.feedback : undefined;
    const focusDirectoryId =
      typeof req.query.focusDirectoryId === 'string' ? req.query.focusDirectoryId : undefined;
    const force = param(req.query.force as string) === '1' || String(req.query.force).toLowerCase() === 'true';
    const raw = await ZhiCoreEngine.zhiIntrusion(userId, feedback, { focusDirectoryId });
    const { enrichZhiIntrusionApiPayload } = await import('../src/services/zhi-intrusion-compat');
    sendSuccess(res, enrichZhiIntrusionApiPayload(raw, { userText: feedback, force }));
  }));

  app.post('/api/v3.5/mentor/intervene', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(
      res,
      await DeepSeekActiveMentor.checkAndIntervene(userId, {
        force: Boolean(req.body.force),
      }),
    );
  }));

  /** Option+Space 盲投：截屏 + AP 考纲拓扑解构 */
  app.post('/api/v3.5/zhi/ghost-blind', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const intentText =
      typeof req.body.intentText === 'string'
        ? req.body.intentText
        : '盲投截屏：真题卡点';
    const screenshotData =
      typeof req.body.screenshotData === 'string' ? req.body.screenshotData : undefined;
    sendSuccess(
      res,
      await ZhiTopologyEngine.analyzeBreakpoint({
        userId,
        intentText,
        screenshotData,
        subjectTrack: req.body.subjectTrack,
        applyDestiny: false,
        warpReason: 'GHOST_BLIND',
        warpAmount: WARP_COST.GHOST_BLIND,
      }),
    );
  }));

  /** AP/托福多维因果断层拓扑（文本/截图） */
  app.post('/api/v3.5/zhi/topology', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(
      res,
      await ZhiTopologyEngine.analyzeBreakpoint({
        userId,
        intentText: req.body.intentText,
        screenshotData: req.body.screenshotData,
        subjectTrack: req.body.subjectTrack,
        applyDestiny: Boolean(req.body.applyDestiny),
        warpReason: 'VISION_INTERCEPT',
        warpAmount: WARP_COST.VISION_INTERCEPT,
      }),
    );
  }));

  /** 影子肉搏战：变异题生成 */
  app.post('/api/v3.5/zhi/shadow-spar', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(
      res,
      await ZhiShadowEngine.spawnShadow({
        userId,
        context: String(req.body.context ?? req.body.intentText ?? ''),
        coachNote: req.body.coachNote,
        syllabusDirect: req.body.syllabusDirect,
      }),
    );
  }));

  app.get('/api/v3.5/zhi/language/mission/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, {
      mission: getLanguageMission(userId),
      progress: getLanguageTutorProgress(userId),
      recent: listRecentLanguageSessions(userId, 5).map((r) => ({
        id: r.id,
        estimatedScore: r.estimated_score,
        scoreNumeric: r.score_numeric,
        passedShadow: r.passed_shadow === 1,
        at: r.created_at,
      })),
    });
  }));

  app.get('/api/v3.5/zhi/courseware/match/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const limit = Math.min(12, Number(req.query.limit ?? 6) || 6);
    sendSuccess(res, matchCoursewareForUser(userId, limit));
  }));

  app.get('/api/v3.5/zhi/courseware/textbook/:userId/:catalogId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const catalogId = param(req.params.catalogId);
    const chapterIndex = req.query.chapter ? Number(req.query.chapter) : undefined;
    const alignment = matchCoursewareForTextbookChapter(userId, catalogId, chapterIndex);
    if (!alignment) {
      res.status(404).json({ code: 404, status: 'NOT_FOUND', message: '教材或章节不存在' });
      return;
    }
    sendSuccess(res, alignment);
  }));

  app.post('/api/v3.5/zhi/courseware/ingest', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const report = req.body.report as import('../engine/core/video-assimilation-brain').SecondaryAssessmentReport;
    if (!report?.videoId) throw new ValidationError('缺少同化 report');
    sendSuccess(
      res,
      ingestCoursewareFromAssimilation({
        userId,
        sourceUrl: String(req.body.sourceUrl ?? ''),
        title: req.body.title ? String(req.body.title) : undefined,
        durationMin: Number(req.body.durationMin ?? 0) || undefined,
        simulate: Boolean(req.body.simulate),
        report,
      }),
    );
  }));

  app.get('/api/v3.5/zhi/courseware/admin/list', requireAdmin, wrap((req, res) => {
    const grade = req.query.grade ? String(req.query.grade).toUpperCase() : undefined;
    const pendingReviewOnly = String(req.query.pendingReview ?? '') === '1';
    const limit = Math.min(100, Number(req.query.limit ?? 40) || 40);
    sendSuccess(
      res,
      listCoursewareForReview({
        grade: grade as 'S' | 'A' | 'B' | 'C' | undefined,
        pendingReviewOnly,
        limit,
      }),
    );
  }));

  app.post('/api/v3.5/zhi/courseware/admin/review', requireAdmin, wrap((req, res) => {
    const coursewareId = String(req.body?.coursewareId ?? '').trim();
    const action = String(req.body?.action ?? '') as 'promote_a' | 'promote_s' | 'demote_b' | 'archive';
    if (!coursewareId) throw new ValidationError('缺少 coursewareId');
    if (!['promote_a', 'promote_s', 'demote_b', 'archive'].includes(action)) {
      throw new ValidationError('无效 action');
    }
    const updated = reviewCourseware(coursewareId, action);
    if (!updated) {
      res.status(404).json({ code: 404, status: 'NOT_FOUND', message: '课件不存在' });
      return;
    }
    sendSuccess(res, { ok: true, courseware: updated });
  }));

  app.get('/api/v3.5/zhi/courseware/catalog/list', wrap((req, res) => {
    const grade = req.query.grade ? String(req.query.grade).toUpperCase() : undefined;
    const pendingReviewOnly = String(req.query.pendingReview ?? '') === '1';
    const limit = Math.min(100, Number(req.query.limit ?? 40) || 40);
    sendSuccess(
      res,
      buildCoursewareCatalogAdmin({
        grade: grade as 'S' | 'A' | 'B' | 'C' | undefined,
        pendingReviewOnly,
        limit,
      }),
    );
  }));

  app.get('/api/v3.5/zhi/courseware/:coursewareId', wrap((req, res) => {
    const cw = getCoursewareByIdDto(param(req.params.coursewareId));
    if (!cw) {
      res.status(404).json({ code: 404, status: 'NOT_FOUND', message: '课件不存在' });
      return;
    }
    sendSuccess(res, cw);
  }));

  app.get('/api/v3.5/zhi/video/context/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getVideoLearnContext(userId));
  }));

  app.post('/api/v3.5/zhi/video/checkpoint/ask', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(
      res,
      await askVideoCheckpoint({
        userId,
        chapterTitle: String(req.body.chapterTitle ?? ''),
        courseId: req.body.courseId ? String(req.body.courseId) : undefined,
        timestampSec: Number(req.body.timestampSec ?? 0),
        videoTitle: req.body.videoTitle ? String(req.body.videoTitle) : undefined,
      }),
    );
  }));

  app.post('/api/v3.5/zhi/video/checkpoint/eval', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const courseId = req.body.courseId ? String(req.body.courseId) : undefined;
    const totalChapters = Number(req.body.totalChapters ?? 0);
    const result = await evaluateVideoCheckpoint({
      userId,
      chapterTitle: String(req.body.chapterTitle ?? ''),
      courseId,
      videoTitle: req.body.videoTitle ? String(req.body.videoTitle) : undefined,
      timestampSec: Number(req.body.timestampSec ?? 0),
      question: String(req.body.question ?? ''),
      userAnswer: String(req.body.userAnswer ?? req.body.answer ?? ''),
    });
    const courseProgress =
      courseId && totalChapters > 0
        ? getVideoCourseProgress(userId, courseId, totalChapters)
        : null;
    sendSuccess(res, { ...result, courseProgress });
  }));

  /** 【ZHI】语言拦截舱：托福/雅思口语写作清算 */
  app.post('/api/v3.5/zhi/language-eval', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const type = String(req.body.type ?? 'SPEAKING').toUpperCase();
    const intakeType = type === 'WRITING' ? 'WRITING' : 'SPEAKING';
    const examRaw = String(req.body.examTrack ?? req.body.exam ?? 'TOEFL').toUpperCase();
    const examTrack = examRaw === 'IELTS' ? 'IELTS' : 'TOEFL';
    sendSuccess(
      res,
      await ZhiLanguageEngine.evaluateLanguageIntake({
        userId,
        type: intakeType,
        userContent: String(req.body.userContent ?? req.body.content ?? ''),
        taskPrompt: String(req.body.taskPrompt ?? req.body.prompt ?? ''),
        examTrack,
      }),
    );
  }));

  /** 语言影子关卡：重录/重写验证 */
  app.post('/api/v3.5/zhi/language-shadow', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(
      res,
      await ZhiLanguageEngine.verifyLanguageShadow({
        userId,
        attempt: String(req.body.attempt ?? req.body.userContent ?? ''),
        zhiChallenge: String(req.body.zhiChallenge ?? ''),
        type: String(req.body.type ?? 'SPEAKING').toUpperCase() === 'WRITING' ? 'WRITING' : 'SPEAKING',
      }),
    );
  }));

  /** 全真模考：听读写说多模态因果清算 */
  app.post('/api/v3.5/zhi/mock-reckon', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const raw = (req.body.examData ?? req.body) as Record<string, unknown>;
    const { userId: _omit, ...examData } = raw;
    sendSuccess(res, await ZhiExamEngine.reckonFullMockExam(userId, examData));
  }));

  /** 模考影子突围：击穿联动断层后扣减命运阻力 */
  app.post('/api/v3.5/zhi/mock-shadow-complete', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(
      res,
      await ZhiExamEngine.completeMockShadowMission({
        userId,
        missionNote: req.body.missionNote,
      }),
    );
  }));

  app.get('/api/v3.5/zhi/assessment/hub/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getAssessmentHub(userId));
  }));

  app.post('/api/v3.5/zhi/assessment/paper/generate', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const subjectId = String(req.body.subjectId ?? '').trim();
    const daily = Boolean(req.body.daily);
    const adaptive = Boolean(req.body.adaptive);
    const userHint = String(req.body.userHint ?? '').trim();
    if (adaptive || (!subjectId && !daily)) {
      sendSuccess(
        res,
        await generateActiveAssessmentPaper(userId, {
          userHint: userHint || undefined,
          focusDirectoryId: String(req.body.focusDirectoryId ?? '').trim() || undefined,
          source: 'chat',
          paperType: 'chat_active',
        }),
      );
      return;
    }
    if (daily) {
      sendSuccess(res, await generateDailyKpPaper(userId));
      return;
    }
    if (!subjectId) throw new ValidationError('缺少 subjectId');
    sendSuccess(res, await generateSubjectPaper(userId, { subjectId }));
  }));

  app.get('/api/v3.5/zhi/assessment/paper/:paperId', wrap((req, res) => {
    const userId = trustedQueryUserId(req);
    const paper = getAssessmentPaperDto(param(req.params.paperId), userId);
    if (!paper) {
      res.status(404).json({ code: 404, status: 'NOT_FOUND', message: '试卷不存在' });
      return;
    }
    sendSuccess(res, paper);
  }));

  app.post('/api/v3.5/zhi/assessment/submit', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const paperId = String(req.body.paperId ?? '').trim();
    const answers = (req.body.answers ?? {}) as Record<string, string>;
    if (!paperId) throw new ValidationError('缺少 paperId');
    sendSuccess(res, await submitAssessmentPaper(userId, { paperId, answers }));
  }));

  app.get('/api/v3.5/zhi/learning-path/:userId', wrap(async (req, res) => {
    const userId = trustedParamUserId(req);
    const cached = getLearningPath(userId);
    if (cached) {
      sendSuccess(res, cached);
      return;
    }
    try {
      sendSuccess(res, await ensureLearningPath(userId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '学习路径不可用';
      sendSuccess(res, { error: msg, phases: [] });
    }
  }));

  app.post('/api/v3.5/zhi/learning-path/rebuild', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(res, await buildAndPersistLearningPath(userId));
  }));

  /** 认知目录图谱：固定 + 动态双轨 */
  app.get('/api/v3.5/zhi/directories/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const dirs = listUserDirectories(userId);
    const coreDb = getCoreDb();
    const today = todayStr();

    const enrichWithCounts = (items: DirectoryItemDto[]) => items.map((d) => {
      const goalCount = coreDb.prepare(
        `SELECT COUNT(*) as c FROM goals WHERE directory_id = ?`,
      ).get(d.id) as { c: number } | undefined;
      const todayTasks = coreDb.prepare(
        `SELECT COUNT(*) as c FROM tasks WHERE goal_id IN (SELECT id FROM goals WHERE directory_id = ?) AND sequence_date = ? AND status = 'TODO'`,
      ).get(d.id, today) as { c: number } | undefined;
      return {
        ...d,
        goalCount: goalCount?.c ?? 0,
        todayTaskCount: todayTasks?.c ?? 0,
      };
    });

    sendSuccess(res, {
      ...dirs,
      pinned: enrichWithCounts(dirs.pinned),
      custom: enrichWithCounts(dirs.custom),
      anchorProfile: (() => {
        const a = getSchoolAnchorProfile(userId);
        if (!a) return null;
        return {
          school: a.school,
          major: a.major,
          currentGrade: a.currentGrade,
          targetApplyAt: a.targetApplyAt,
        };
      })(),
    });
  }));

  app.post('/api/v3.5/zhi/directories', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const title = String(req.body.title ?? '').trim();
    if (!title) throw new ValidationError('缺少 title');
    sendSuccess(res, createCustomDirectory(userId, title));
  }));

  app.delete('/api/v3.5/zhi/directories/:directoryId', wrap((req, res) => {
    const userId = trustedQueryUserId(req);
    const directoryId = param(req.params.directoryId).trim();
    if (!directoryId) throw new ValidationError('缺少 directoryId');
    const ok = deleteCustomDirectory(userId, directoryId);
    sendSuccess(res, { ok });
  }));

  /** 目录作战区：该目录下目标 + 今日任务 */
  app.get('/api/v3.5/zhi/directory-workspace/:userId/:directoryId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const directoryId = param(req.params.directoryId).trim();
    if (!directoryId) throw new ValidationError('缺少 directoryId');
    sendSuccess(res, coreGetDirectoryWorkspace(userId, directoryId));
  }));

  app.post('/api/v3.5/zhi/directory-workspace/goal', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const directoryId = String(req.body.directoryId ?? '').trim();
    const title = String(req.body.title ?? req.body.goal ?? '').trim();
    const days = Number(req.body.days ?? req.body.totalDays ?? 90);
    const templateId = typeof req.body.templateId === 'string' ? req.body.templateId.trim() : undefined;
    if (!directoryId) throw new ValidationError('缺少 directoryId');
    if (!title) throw new ValidationError('缺少 title');
    const core = coreDeconstruct({
      title,
      days,
      userId,
      directoryId,
      templateId,
      personaType: 'BUDDY',
    });
    sendSuccess(res, bridgeDeconstructResponse(core, title, days));
  }));

  /** 双核 Token 分离账本大盘 */
  app.get('/api/v3.5/zhi/token-ledger/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
    sendSuccess(res, ZhiTokenSplitter.getLedgerView(userId, limit));
  }));

  app.post('/api/v3.5/zhi/token-inject', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const pack = String(req.body.pack ?? 'BALANCED').toUpperCase();
    const normalized =
      pack === 'CORE' || pack === 'DEEP' ? pack : ('BALANCED' as const);
    sendSuccess(res, ZhiTokenSplitter.injectEnergyPack(userId, normalized));
  }));

  /** 影子肉搏战：第一步推导验证 */
  app.post('/api/v3.5/zhi/shadow-verify', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const attempt = String(req.body.attempt ?? '').trim();
    const shadowProblem = String(req.body.shadowProblem ?? '').trim();
    if (!shadowProblem) throw new ValidationError('缺少 shadowProblem');
    sendSuccess(
      res,
      await ZhiShadowEngine.verifyShadowAttempt({
        userId,
        shadowProblem,
        attempt,
        syllabusDirect: req.body.syllabusDirect,
      }),
    );
  }));

  /** 学习趋势预测 */
  app.get('/api/v3.5/zhi/trend/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, computeLearningTrend(userId));
  }));

  // ── 自主规划系统 API ──

  /** 获取/初始化自主规划状态 */
  app.get('/api/v3.5/zhi/plan/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getOrCreatePlan(userId));
  }));

  /** 分析数据缺口 */
  app.get('/api/v3.5/zhi/plan/gaps/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, assessDataGaps(userId));
  }));

  /** 获取主动数据采集请求（当用户未主动提供数据时调用） */
  app.post('/api/v3.5/zhi/plan/request-data', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const request = generateDataRequest(userId);
    sendSuccess(res, request ?? { requestId: null, questions: [], gaps: [], priority: 'none', createdAt: '', message: '无需采集' });
  }));

  /** 用户提交数据 */
  app.post('/api/v3.5/zhi/plan/submit-data', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const data = (req.body.data ?? req.body) as Record<string, string>;
    const { userId: _omit, ...cleanData } = data;
    sendSuccess(res, await submitUserData(userId, cleanData));
  }));

  /** 生成完整规划 */
  app.post('/api/v3.5/zhi/plan/generate', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(res, await generatePlan(userId));
  }));

  /** 获取今日规划 */
  app.get('/api/v3.5/zhi/plan/today/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getTodayPlan(userId));
  }));

  /** 根据评估调整规划 */
  app.post('/api/v3.5/zhi/plan/adjust-from-assessment', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const paperId = String(req.body.paperId ?? '').trim();
    const scorePct = Number(req.body.scorePct ?? 0);
    if (!paperId) throw new ValidationError('缺少 paperId');
    sendSuccess(res, await adjustPlanFromAssessment(userId, paperId, scorePct));
  }));

  /** 主动巡检 */
  app.get('/api/v3.5/zhi/plan/patrol/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, proactivePatrol(userId));
  }));

  /** 标记时间段完成 */
  app.post('/api/v3.5/zhi/plan/complete-slot', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const slotId = String(req.body.slotId ?? '').trim();
    const actualMinutes = req.body.actualMinutes ? Number(req.body.actualMinutes) : undefined;
    if (!slotId) throw new ValidationError('缺少 slotId');
    sendSuccess(res, completeSlot(userId, slotId, actualMinutes));
  }));

  /** 激活规划（planned → active） */
  app.post('/api/v3.5/zhi/plan/activate', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(res, activatePlan(userId));
  }));

  /** 强制重规划 */
  app.post('/api/v3.5/zhi/plan/replan', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    sendSuccess(res, await replan(userId));
  }));

  // ── 错题本 API ──

  /** 记录单条错题 */
  app.post('/api/v3.5/zhi/mistake/record', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const subject = String(req.body.subject ?? '').trim();
    const questionText = String(req.body.questionText ?? '').trim();
    const userAnswer = String(req.body.userAnswer ?? '').trim();
    const correctAnswer = String(req.body.correctAnswer ?? '').trim();
    const mistakeType = String(req.body.mistakeType ?? 'conceptual').trim() as any;
    const knowledgeNode = typeof req.body.knowledgeNode === 'string' ? req.body.knowledgeNode.trim() : undefined;
    const source = typeof req.body.source === 'string' ? req.body.source.trim() : undefined;
    if (!subject || !questionText || !correctAnswer) throw new ValidationError('缺少必要字段');
    sendSuccess(res, recordMistake({ userId, subject, questionText, userAnswer, correctAnswer, mistakeType, knowledgeNode, source }));
  }));

  /** 批量导入错题 */
  app.post('/api/v3.5/zhi/mistake/batch', wrap((req, res) => {
    const items = req.body.items as any[];
    if (!Array.isArray(items) || items.length === 0) throw new ValidationError('缺少 items');
    sendSuccess(res, recordMistakeBatch(items));
  }));

  /** 获取错题本（分页） */
  app.get('/api/v3.5/zhi/mistake/bank/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    sendSuccess(res, getMistakeBank(userId, { subject, limit }));
  }));

  /** 获取待复习错题 */
  app.get('/api/v3.5/zhi/mistake/retry/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
    const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;
    sendSuccess(res, getMistakesForRetry(userId, subject, limit));
  }));

  /** 复习错题 */
  app.post('/api/v3.5/zhi/mistake/review', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const mistakeId = String(req.body.mistakeId ?? '').trim();
    const correct = Boolean(req.body.correct);
    if (!mistakeId) throw new ValidationError('缺少 mistakeId');
    sendSuccess(res, reviewMistake(userId, mistakeId, correct));
  }));

  /** 错题趋势（最近7天） */
  app.get('/api/v3.5/zhi/mistake/trend/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getMistakeTrend(userId));
  }));

  // ── 学习计时器 API ──

  /** 开始学习时段 */
  app.post('/api/v3.5/zhi/timer/start', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const subject = String(req.body.subject ?? '').trim();
    const planMinutes = req.body.planMinutes ? Number(req.body.planMinutes) : undefined;
    if (!subject) throw new ValidationError('缺少 subject');
    sendSuccess(res, startSession({ userId, subject }));
  }));

  /** 结束学习时段 */
  app.post('/api/v3.5/zhi/timer/end', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const sessionId = String(req.body.sessionId ?? '').trim();
    const mood = typeof req.body.mood === 'string' ? req.body.mood : undefined;
    if (!sessionId) throw new ValidationError('缺少 sessionId');
    sendSuccess(res, endSession(userId, sessionId, { mood }));
  }));

  /** 获取当前活跃时段 */
  app.get('/api/v3.5/zhi/timer/active/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getActiveSession(userId));
  }));

  /** 获取时段统计摘要 */
  app.get('/api/v3.5/zhi/timer/summary/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getSessionSummary(userId));
  }));

  /** 获取周报 */
  app.get('/api/v3.5/zhi/timer/weekly-report/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getWeeklyReport(userId));
  }));

  // ── 成就系统 API ──

  /** 获取所有成就定义 */
  app.get('/api/v3.5/zhi/achievement/all/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getAllAchievements(userId));
  }));

  /** 获取用户已解锁成就 */
  app.get('/api/v3.5/zhi/achievement/unlocked/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, getUnlockedAchievements(userId));
  }));

  /** 检测并解锁成就 */
  app.post('/api/v3.5/zhi/achievement/check', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const category = String(req.body.category ?? '').trim();
    const progressValue = Number(req.body.progressValue ?? 0);
    if (!category) throw new ValidationError('缺少 category');
    sendSuccess(res, checkAndUnlock(userId, category, progressValue));
  }));

  // ── 学习仪表盘 API ──

  /** 获取学习者综合仪表盘 */
  app.get('/api/v3.5/zhi/learner-dashboard/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    sendSuccess(res, buildLearnerDashboard(userId));
  }));

  // ── ZHI 讲学引擎 API ──

  /** 讲授知识点 */
  app.post('/api/v3.5/zhi/tutor/teach', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const knowledgePoint = String(req.body.knowledgePoint ?? '').trim();
    if (!knowledgePoint) throw new ValidationError('缺少 knowledgePoint');
    sendSuccess(res, await teachKnowledgePoint({
      userId,
      knowledgePoint,
      subject: typeof req.body.subject === 'string' ? req.body.subject : undefined,
      context: typeof req.body.context === 'string' ? req.body.context : undefined,
    }));
  }));

  /** 获取单篇讲义 */
  app.get('/api/v3.5/zhi/tutor/lesson/:userId/:lessonId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const lesson = getLesson(userId, param(req.params.lessonId));
    if (!lesson) {
      res.status(404).json({ code: 404, status: 'NOT_FOUND', message: '讲义不存在' });
      return;
    }
    sendSuccess(res, lesson);
  }));

  /** 提交讲学随堂验收 */
  app.post('/api/v3.5/zhi/tutor/lesson/:lessonId/checkpoint', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const lessonId = param(req.params.lessonId);
    const userAnswer = String(req.body.answer ?? '').trim();
    if (!userAnswer) throw new ValidationError('缺少答案');
    sendSuccess(res, submitLessonCheckpoint(userId, lessonId, userAnswer));
  }));

  /** 获取讲学历史 */
  app.get('/api/v3.5/zhi/tutor/history/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
    sendSuccess(res, { items: listLessons(userId, subject, limit) });
  }));

  /** 自适应题库裂变：基于短板生成一套模考卷（落库为学习评估试卷） */
  app.post('/api/v3.5/zhi/quiz/adaptive-exam', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const subjectId = String(req.body.subjectId ?? '').trim() || 'math';
    const weakPoints = Array.isArray(req.body.weakPoints) ? (req.body.weakPoints as unknown[]) : [];
    const points = weakPoints.map((s) => String(s ?? '').trim()).filter(Boolean);
    const questionCount = Number(req.body.questionCount ?? 20);
    const difficulty = String(req.body.difficulty ?? 'hard').trim() === 'mid' ? 'mid' : 'hard';
    const userHint = String(req.body.userHint ?? '').trim();
    if (points.length === 0) throw new ValidationError('缺少 weakPoints');
    sendSuccess(
      res,
      await generateAdaptiveExamPaper({
        userId,
        subjectId,
        weakPoints: points,
        questionCount,
        difficulty,
        userHint,
      }),
    );
  }));

  /** 讲授教材章节 */
  app.post('/api/v3.5/zhi/tutor/chapter', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const catalogId = String(req.body.catalogId ?? '').trim();
    const chapterIndex = Number(req.body.chapterIndex ?? 0);
    if (!catalogId) throw new ValidationError('缺少 catalogId');
    if (chapterIndex < 1) throw new ValidationError('无效 chapterIndex');
    sendSuccess(res, await teachChapter(userId, catalogId, chapterIndex));
  }));

  /** 完成章节验收 */
  app.post('/api/v3.5/zhi/tutor/chapter/checkpoint', wrap((req, res) => {
    const userId = trustedBodyUserId(req);
    const catalogId = String(req.body.catalogId ?? '').trim();
    const chapterIndex = Number(req.body.chapterIndex ?? 0);
    const passed = Boolean(req.body.passed);
    if (!catalogId) throw new ValidationError('缺少 catalogId');
    completeChapterCheckpoint(userId, catalogId, chapterIndex, passed);
    sendSuccess(res, { ok: true });
  }));

  /** 获取教材学习进度 */
  app.get('/api/v3.5/zhi/tutor/textbook-progress/:userId/:catalogId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const catalogId = param(req.params.catalogId);
    const progress = getTextbookProgress(userId, catalogId);
    if (!progress) {
      res.status(404).json({ code: 404, status: 'NOT_FOUND', message: '教材不存在' });
      return;
    }
    sendSuccess(res, progress);
  }));

  // ─── 模考系统 ─────────────────────────────────────────

  /** 生成试卷 */
  app.post('/api/v3.5/zhi/exam/generate', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const subject = typeof req.body.subject === 'string' ? req.body.subject : undefined;
    const count = typeof req.body.count === 'number' ? req.body.count : undefined;
    sendSuccess(res, await generateExam(userId, subject, count));
  }));

  /** 考试历史（必须放 :examId 前） */
  app.get('/api/v3.5/zhi/exam/history/:userId', wrap((req, res) => {
    const userId = trustedParamUserId(req);
    const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    sendSuccess(res, listExams(userId, subject, limit));
  }));

  /** 获取试卷详情 */
  app.get('/api/v3.5/zhi/exam/:examId', wrap((req, res) => {
    const examId = param(req.params.examId);
    const detail = getExamDetail(examId);
    if (!detail) { res.status(404).json({ code: 404, status: 'NOT_FOUND', message: '试卷不存在' }); return; }
    sendSuccess(res, detail);
  }));

  /** 开始考试 */
  app.post('/api/v3.5/zhi/exam/:examId/start', wrap((req, res) => {
    startExam(param(req.params.examId));
    sendSuccess(res, { ok: true });
  }));

  /** 提交答案 */
  app.post('/api/v3.5/zhi/exam/:examId/answer', wrap((req, res) => {
    const examId = param(req.params.examId);
    const questionId = String(req.body.questionId ?? '').trim();
    const userAnswer = String(req.body.answer ?? '').trim();
    if (!questionId || !userAnswer) throw new ValidationError('缺少 questionId 或 answer');
    answerQuestion(examId, questionId, userAnswer);
    sendSuccess(res, { ok: true });
  }));

  /** 批改试卷 */
  app.post('/api/v3.5/zhi/exam/:examId/grade', wrap(async (req, res) => {
    sendSuccess(res, gradeExam(param(req.params.examId)));
  }));

  /** 生成大规模模考（分批 LLM，50 题级） */
  app.post('/api/v3.5/zhi/exam/generate-large', wrap(async (req, res) => {
    const userId = trustedBodyUserId(req);
    const subject = typeof req.body.subject === 'string' ? req.body.subject : undefined;
    const count = typeof req.body.count === 'number' ? req.body.count : undefined;
    sendSuccess(res, await generateLargeExam(userId, subject, count));
  }));

  /** 获取分页题目 */
  app.get('/api/v3.5/zhi/exam/:examId/questions', wrap((req, res) => {
    const examId = param(req.params.examId);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(20, Math.max(5, Number(req.query.pageSize) || 10));
    sendSuccess(res, getExamQuestionsPaginated(examId, page, pageSize));
  }));

  /** 获取考试进度 */
  app.get('/api/v3.5/zhi/exam/:examId/progress', wrap((req, res) => {
    const progress = getExamProgress(param(req.params.examId));
    if (!progress) { res.status(404).json({ code: 404, status: 'NOT_FOUND', message: '试卷不存在' }); return; }
    sendSuccess(res, progress);
  }));

  /** 批量提交答案 */
  app.post('/api/v3.5/zhi/exam/:examId/answers', wrap((req, res) => {
    const examId = param(req.params.examId);
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    sendSuccess(res, { submitted: answerQuestionBatch(examId, answers) });
  }));
}
