/**
 * ZHI · 语言陪练（梦校对标战役 + 标化进度入账）
 */

import { getBaselineStatus, parseBaseline } from '../db/baseline-schema';
import { applyStructuredBaseline } from './zhi-baseline-intake';
import { getOrCreateDailyReview } from './zhi-daily-review-engine';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { listRecentLanguageSessions, saveLanguageSession } from '../db/zhi-language-session-schema';
import type { LanguageExamTrack, LanguageIntakeType } from './zhi-language';
import { buildTutorMission, updateProfileAfterTutorSession, type TutorMissionDto } from './zhi-language-tutor';
import { recordEvolutionMilestone } from './zhi-evolution-ledger';

export type LanguageMissionDto = TutorMissionDto & { targetIelts?: number };

function parseToeflFromText(scoreText: string, content: string): number | null {
  const m = scoreText.match(/(\d{1,2})\s*\/\s*30/i) ?? content.match(/口语\s*(\d{1,2})/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 0 && n <= 30) return n;
  }
  const total = scoreText.match(/托福\s*(\d{2,3})/i);
  if (total) {
    const n = Number(total[1]);
    if (n >= 40 && n <= 120) return n;
  }
  return null;
}

function parseIeltsFromText(scoreText: string): number | null {
  const m = scoreText.match(/(\d(?:\.\d)?)\s*(?:\/\s*9)?/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 0 && n <= 9) return n;
  }
  return null;
}

export function getLanguageMission(userId: string): LanguageMissionDto {
  return { ...buildTutorMission(userId), targetIelts: 7 };
}

export function applyLanguageEvalToProgress(input: {
  userId: string;
  examTrack: LanguageExamTrack;
  intakeType: LanguageIntakeType;
  taskPrompt: string;
  estimatedScore: string;
  ieltsEquivalent: string;
  userContent: string;
  fatalFlaws: string[];
  whatWorked?: string[];
  priorityFix?: string;
  microDrill?: string;
  focusSkill?: string;
  weakTags?: string[];
}): {
  sessionId: string;
  scoreNumeric: number | null;
  currentToefl: number;
  progressPct: number;
  levelBand: string;
  speakingEst: number;
  streakDays: number;
} {
  const uid = input.userId.trim();
  const mission = getLanguageMission(uid);
  const scoreNumeric =
    input.examTrack === 'TOEFL'
      ? parseToeflFromText(input.estimatedScore, input.userContent)
      : parseIeltsFromText(input.ieltsEquivalent || input.estimatedScore);

  saveLanguageSession({
    userId: uid,
    examTrack: input.examTrack,
    intakeType: input.intakeType,
    taskPrompt: input.taskPrompt,
    estimatedScore: input.estimatedScore,
    scoreNumeric,
    ieltsEquivalent: input.ieltsEquivalent,
    fatalFlaws: input.fatalFlaws,
  });

  const scores: Record<string, string> = {};
  if (scoreNumeric != null && input.examTrack === 'TOEFL') {
    if (input.intakeType === 'SPEAKING') {
      scores['托福口语'] = `${scoreNumeric}/30`;
      const estTotal = Math.min(120, mission.currentToefl + Math.max(0, scoreNumeric - 20));
      if (estTotal > mission.currentToefl) scores['托福'] = String(estTotal);
    } else {
      scores['托福写作'] = input.estimatedScore.slice(0, 40);
    }
    scores['最近语言练'] = new Date().toISOString().slice(0, 10);
  }

  if (Object.keys(scores).length) {
    applyStructuredBaseline(uid, { scores });
  }

  const row = getBaselineStatus(uid);
  const parsed = row ? parseBaseline(row) : { currentScores: {} as Record<string, string> };
  const currentToefl = Number(String(parsed.currentScores.托福 ?? parsed.currentScores.TOEFL ?? '0').replace(/\D/g, '')) || 0;
  const progressPct = Math.min(100, Math.round((currentToefl / mission.targetToefl) * 100));

  getOrCreateDailyReview(uid, { force: true });

  const profilePatch = updateProfileAfterTutorSession({
    userId: uid,
    intakeType: input.intakeType,
    scoreNumeric,
    focusSkill: input.focusSkill ?? mission.focusSkill,
    weakTags: input.weakTags ?? mission.weakTags,
    whatWorked: input.whatWorked ?? [],
    priorityFix: input.priorityFix ?? '',
    microDrill: input.microDrill ?? mission.microDrill,
    shadowPassed: false,
  });

  const session = listRecentLanguageSessions(uid, 1)[0];

  recordEvolutionMilestone({
    userId: uid,
    battle: 'TOEFL_LANGUAGE_MATRIX',
    description: `口语陪练 · ${input.intakeType} · ${input.estimatedScore.slice(0, 32)}`,
    amountHint: scoreNumeric ?? 0,
  });

  return {
    sessionId: session?.id ?? '',
    scoreNumeric,
    currentToefl,
    progressPct,
    levelBand: profilePatch.levelBand,
    speakingEst: profilePatch.speakingEst,
    streakDays: profilePatch.streakDays,
  };
}

export function applyTutorShadowPass(
  userId: string,
  input: { focusSkill: string; weakTags: string[]; priorityFix: string; microDrill: string },
): void {
  const profile = updateProfileAfterTutorSession({
    userId,
    intakeType: 'SPEAKING',
    scoreNumeric: null,
    focusSkill: input.focusSkill,
    weakTags: input.weakTags,
    whatWorked: [],
    priorityFix: input.priorityFix,
    microDrill: input.microDrill,
    shadowPassed: true,
  });
  void profile;
}

export function markLanguageShadowPassed(userId: string): void {
  const uid = userId.trim();
  const sessions = listRecentLanguageSessions(uid, 1);
  if (!sessions[0]) return;
  getLearningDb()
    .prepare(`UPDATE zhi_language_sessions SET passed_shadow = 1 WHERE id = ?`)
    .run(sessions[0].id);
}
