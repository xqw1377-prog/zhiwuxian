/**
 * ZHI · 语言陪练进度（7 日口语曲线 + 日复盘 P0 联动）
 */

import { getLanguageProfile } from '../db/zhi-language-profile-schema';
import { listSpeakingCurveDays, listRecentLanguageSessions } from '../db/zhi-language-session-schema';
import type { PlanCorrectionDto } from '../db/zhi-daily-review-schema';
import { buildTutorMission } from './zhi-language-tutor';

export type LanguageCurvePoint = {
  date: string;
  score: number | null;
  sessions: number;
  shadowPasses: number;
};

export type LanguageTutorProgressDto = {
  curve7d: LanguageCurvePoint[];
  speakingEst: number;
  levelBand: string;
  streakDays: number;
  weekDelta: number | null;
  focusSkill: string;
  lastDrill: string | null;
  totalSessions: number;
  todayCoachLine: string;
};

const SKILL_ZH: Record<string, string> = {
  fluency: '流利度',
  logic: '逻辑链',
  vocab: '词汇',
  grammar: '语法',
  delivery: '表达',
};

export function getLanguageTutorProgress(userId: string): LanguageTutorProgressDto {
  const uid = userId.trim();
  const profile = getLanguageProfile(uid);
  const mission = buildTutorMission(uid);
  const curve7d = listSpeakingCurveDays(uid, 7);
  const scores = curve7d.map((p) => p.score).filter((s): s is number => s != null);
  const weekDelta =
    scores.length >= 2 ? Math.round((scores[scores.length - 1]! - scores[0]!) * 10) / 10 : null;

  const focusZh = SKILL_ZH[mission.focusSkill] ?? mission.focusSkill;
  const todayCoachLine =
    weekDelta != null && weekDelta > 0
      ? `7 日口语 +${weekDelta}，今天继续攻「${focusZh}」。`
      : weekDelta != null && weekDelta < 0
        ? `7 日口语回落 ${weekDelta}，今天 shadow 关必过，专攻「${focusZh}」。`
        : `今日陪练：${focusZh} · ${mission.microDrill.slice(0, 48)}…`;

  return {
    curve7d,
    speakingEst: mission.speakingEst,
    levelBand: mission.levelBand,
    streakDays: profile?.streak_days ?? 0,
    weekDelta,
    focusSkill: mission.focusSkill,
    lastDrill: profile?.last_drill ?? null,
    totalSessions: profile?.total_sessions ?? 0,
    todayCoachLine,
  };
}

/** 日复盘 P0：若托福滞后或近练口语偏低，改为陪练战役 */
export function languageP0CorrectionIfNeeded(userId: string): PlanCorrectionDto | null {
  const uid = userId.trim();
  const progress = getLanguageTutorProgress(uid);
  const recent = listRecentLanguageSessions(uid, 3);
  const lastSpeak = recent.find((s) => s.intake_type === 'SPEAKING' && s.score_numeric != null);
  const lowRecent = lastSpeak != null && Number(lastSpeak.score_numeric) < 20;

  if (progress.totalSessions === 0 && progress.speakingEst >= 24) return null;

  const mission = buildTutorMission(uid);
  const focusZh = SKILL_ZH[mission.focusSkill] ?? mission.focusSkill;

  return {
    subjectId: 'toefl',
    subjectName: '托福口语',
    action: `口语陪练 P0：${mission.prepSeconds}s 准备 + ${mission.speakSeconds}s 完成「${mission.taskPrompt.slice(0, 72)}…」，今日只改「${focusZh}」${lowRecent ? '（上次偏低，shadow 关必过）' : ''}`,
    priority: 'P0',
    dueBy: '今晚 22:00',
  };
}

export function mergeLanguageIntoPlanCorrections(
  userId: string,
  corrections: PlanCorrectionDto[],
  subjects: Array<{ id: string; progressPct: number }>,
): PlanCorrectionDto[] {
  const toefl = subjects.find((s) => s.id === 'toefl');
  const shouldBoost =
    (toefl && toefl.progressPct < 40) ||
    corrections.some((c) => c.subjectId === 'toefl' && c.priority === 'P0');

  if (!shouldBoost) return corrections;

  const langP0 = languageP0CorrectionIfNeeded(userId);
  if (!langP0) return corrections;

  const rest = corrections.filter((c) => !(c.subjectId === 'toefl' && c.priority === 'P0'));
  return [langP0, ...rest];
}
