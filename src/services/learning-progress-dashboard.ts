/**
 * 梦想进度条 · 分科进度 · 目录目标值 · 能力增长 · 知识成果
 */

import { getBaselineStatus, parseBaseline } from '../db/baseline-schema';
import { listUserDirectories } from '../db/directory-schema';
import { getMentorPlanView, getSchoolMatrixView } from '../db/school-matrix';
import { getSchoolAnchorProfile, listZhiArtifacts } from '../db/zhi-cloud-schema';
import { daysUntilApply, matchSchoolIntel } from './school-anchor-brief';
import {
  detectSchoolPathway,
  getSubjectTrackBlueprint,
  mergeMetricsForPathway,
  PATHWAY_LABEL,
  type SchoolPathway,
} from './school-pathway';
import {
  getLatestSnapshot,
  getSnapshotNear,
  recordProgressSnapshot,
} from '../db/zhi-progress-history-schema';
import {
  listTextbooksForUser,
  parseTextbookOutline,
} from '../db/zhi-textbook-catalog-schema';
import { listRecentVideoSessions } from '../db/zhi-video-session-schema';
import { syncAllTextbookDirectories, textbookDirectoryId } from './zhi-textbook-directory';
import { getLanguageTutorProgress, type LanguageCurvePoint } from './zhi-language-progress';
import { getVideoLearnContext } from './zhi-video-coach';

export type SubjectTrackDto = {
  id: string;
  name: string;
  current: number;
  target: number;
  unit: string;
  displayCurrent: string;
  displayTarget: string;
  progressPct: number;
  deltaPct: number;
  trend: 'up' | 'down' | 'flat';
  chaptersDone?: number;
  chaptersTotal?: number;
};

export type DreamProgressDto = {
  certaintyPct: number;
  challengeIndex: number;
  daysRemaining: number;
  milestonePct: number;
  delta7d: number;
  targetSchool: string;
  targetApplyAt: string;
  activePhase: string | null;
};

export type DirectoryTargetDto = {
  directoryId: string;
  title: string;
  currentPct: number;
  targetPct: number;
  type: string;
};

export type AbilityGrowthDto = {
  id: string;
  label: string;
  value: number;
  delta: number;
};

export type KnowledgeOutcomeDto = {
  id: string;
  title: string;
  source: string;
  at: number;
  tag?: string;
};

export type TextbookTrackDto = {
  catalogId: string;
  directoryId: string;
  title: string;
  publisher: string;
  subject: string;
  progressChapter: number;
  totalChapters: number;
  progressPct: number;
  currentChapterTitle: string;
  knowledgePoints: string[];
  gapNote: string;
};

export type DreamMomentumDto = {
  languageCurve7d: LanguageCurvePoint[];
  videoCurve7d: Array<{ date: string; checkpoints: number; avgMastery: number | null; passed: number }>;
  weekLanguageSessions: number;
  weekVideoCheckpoints: number;
  speakingWeekDelta: number | null;
  momentumHint: string;
};

export type LearningProgressDashboardDto = {
  pathway: SchoolPathway;
  pathwayLabel: string;
  dream: DreamProgressDto;
  momentum: DreamMomentumDto;
  subjects: SubjectTrackDto[];
  textbooks: TextbookTrackDto[];
  directories: DirectoryTargetDto[];
  abilities: AbilityGrowthDto[];
  outcomes: KnowledgeOutcomeDto[];
  updatedAt: number;
};

function parseNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').replace(/[^\d.]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function pct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function trend(delta: number): 'up' | 'down' | 'flat' {
  if (delta > 0.5) return 'up';
  if (delta < -0.5) return 'down';
  return 'flat';
}

function subjectDelta(
  id: string,
  currentPct: number,
  prevSubjects: Record<string, number> | null,
): number {
  if (!prevSubjects || prevSubjects[id] == null) return 0;
  return Math.round((currentPct - prevSubjects[id]) * 10) / 10;
}

function metricValue(
  sources: Array<Record<string, unknown>>,
  keys: string[],
): number {
  for (const src of sources) {
    for (const key of keys) {
      const v = src[key];
      if (v != null && v !== '') {
        const n = parseNum(v);
        if (n > 0) return n;
      }
    }
  }
  return 0;
}

function buildSubjects(
  required: Record<string, unknown>,
  baseline: Record<string, unknown>,
  scores: Record<string, string>,
  prevSubjects: Record<string, number> | null,
  pathway: SchoolPathway,
): SubjectTrackDto[] {
  const sources = [baseline, required, scores as Record<string, unknown>];
  const blueprint = getSubjectTrackBlueprint(pathway);

  const tracks: Omit<SubjectTrackDto, 'deltaPct' | 'trend'>[] = blueprint.map((bp) => {
    const current = metricValue(sources, bp.metricKeys);
    const target = bp.target;
    const hasScore = current > 0;
    let displayCurrent = '待录入';
    if (hasScore) {
      displayCurrent = bp.unit === '' && bp.id === 'gpa' ? current.toFixed(2) : String(current);
    } else if (bp.id === 'algo' || bp.id === 'comp' || bp.id === 'oi') {
      displayCurrent = '待建';
    }
    let progressPct = pct(current, target);
    if (!hasScore && (bp.id === 'gpa' || bp.id === 'essay' || bp.id === 'comp')) {
      progressPct = bp.id === 'gpa' ? 12 : 15;
    }
    if (!hasScore && bp.id === 'algo') progressPct = 8;
    if (hasScore && (bp.id === 'algo' || bp.id === 'comp')) {
      displayCurrent = '有成果';
      progressPct = Math.max(progressPct, 45);
    }

    return {
      id: bp.id,
      name: bp.name,
      current,
      target,
      unit: bp.unit,
      displayCurrent,
      displayTarget: bp.displayTarget,
      progressPct,
      chaptersDone: bp.chaptersTotal && hasScore ? Math.min(bp.chaptersTotal, Math.round(current / 25)) : undefined,
      chaptersTotal: bp.chaptersTotal,
    };
  });

  return tracks.map((t) => {
    const deltaPct = subjectDelta(t.id, t.progressPct, prevSubjects);
    return { ...t, deltaPct, trend: trend(deltaPct) };
  });
}

function mapDirectoryTargets(
  dirs: Array<{ id: string; title: string; type: string }>,
  dreamPct: number,
  subjects: SubjectTrackDto[],
): DirectoryTargetDto[] {
  const byId = (sid: string) => subjects.find((s) => s.id === sid)?.progressPct ?? 0;

  return dirs.map((d) => {
    let currentPct = 20;
    let targetPct = 100;
    const t = d.title;

    if (d.type === 'STRATEGIC_GOAL' || t.includes('目标')) {
      currentPct = dreamPct;
      targetPct = 100;
    } else if (t.includes('托福') || t.includes('TOEFL')) {
      currentPct = byId('toefl');
    } else if (t.includes('数学') || t.includes('微积分') || t.includes('CALC')) {
      currentPct = byId('math') || Math.round((byId('ap') + byId('gpa')) / 2);
      targetPct = 95;
    } else if (t.includes('物理') || t.includes('PHYS')) {
      currentPct = byId('physics') || byId('ap');
      targetPct = 90;
    } else if (t.includes('信息') || t.includes('CSP') || t.includes('OI')) {
      currentPct = byId('oi') || byId('algo');
    } else if (t.includes('语文') || t.includes('英语') && !t.includes('托福')) {
      currentPct = Math.round((byId('english') + byId('toefl')) / 2) || byId('english');
    } else if (t.includes('文书') || t.includes('ESSAY') || t.includes('强基') || t.includes('综评')) {
      currentPct = byId('essay') || byId('comp');
    } else if (d.type === 'ERROR_BANK') {
      currentPct = Math.min(85, byId('toefl') + 10);
      targetPct = 100;
    } else if (d.type === 'ACADEMIC_SUBJECT' && t.includes('📚')) {
      const bookMatch = /(\d+)\/(\d+)章\s+(\d+)%/.exec(t);
      if (bookMatch) {
        currentPct = Number(bookMatch[3]) || currentPct;
        targetPct = 100;
      }
    } else if (d.type === 'ACADEMIC_SUBJECT') {
      currentPct = Math.round(subjects.reduce((a, s) => a + s.progressPct, 0) / Math.max(1, subjects.length));
    }

    return {
      directoryId: d.id,
      title: d.title,
      currentPct,
      targetPct,
      type: d.type,
    };
  });
}

function buildAbilities(dreamPct: number, milestonePct: number, subjects: SubjectTrackDto[]): AbilityGrowthDto[] {
  const subjectAvg = subjects.length
    ? subjects.reduce((a, s) => a + s.progressPct, 0) / subjects.length
    : 0;
  return [
    { id: 'il', label: '直觉跳跃 IL', value: Math.round(38 + dreamPct * 0.42), delta: Math.round(subjectAvg * 0.08) },
    { id: 'ps', label: '模式敏感 PS', value: Math.round(35 + subjectAvg * 0.55), delta: Math.round(milestonePct * 0.12) },
    { id: 'rd', label: '韧性密度 RD', value: Math.round(40 + milestonePct * 0.5), delta: Math.round(dreamPct * 0.06) },
    { id: 'ns', label: '叙事整合 NS', value: Math.round(30 + (subjects.find((s) => s.id === 'essay')?.progressPct ?? 15) * 0.6), delta: 2 },
  ].map((a) => ({ ...a, value: Math.min(99, a.value), delta: Math.min(15, a.delta) }));
}

function buildTextbooks(userId: string): TextbookTrackDto[] {
  try {
    syncAllTextbookDirectories(userId);
  } catch {
    /* ignore */
  }
  return listTextbooksForUser(userId).map((row) => {
    const chapters = parseTextbookOutline(row);
    const total = chapters.length || 1;
    const prog = row.progress_chapter ?? 1;
    const current = chapters.find((c) => c.index === prog) ?? chapters[prog - 1];
    return {
      catalogId: row.id,
      directoryId: textbookDirectoryId(userId, row.id),
      title: row.title,
      publisher: row.publisher,
      subject: row.subject ?? '综合',
      progressChapter: prog,
      totalChapters: total,
      progressPct: Math.round(row.progress_pct ?? (prog / total) * 100),
      currentChapterTitle: current?.title ?? `第${prog}章`,
      knowledgePoints: current?.knowledgePoints ?? [],
      gapNote: row.knowledge_summary ?? '',
    };
  });
}

function buildOutcomes(userId: string): KnowledgeOutcomeDto[] {
  const videoOutcomes: KnowledgeOutcomeDto[] = listRecentVideoSessions(userId, 5).map((v) => ({
    id: v.id,
    title: `${v.chapter_title} · 掌握 ${Math.round(v.mastery_score ?? 0)}%`,
    source: '视频卡点',
    at: v.created_at * 1000,
    tag: v.passed_checkpoint ? 'PASS' : 'REVIEW',
  }));

  try {
    const arts = listZhiArtifacts(userId).slice(0, 8);
    const cloud = arts.map((a) => ({
      id: a.artifactId,
      title: a.fileTitle,
      source: '云归档',
      at: a.syncTimestamp * 1000,
      tag: a.versionTag,
    }));
    return [...videoOutcomes, ...cloud];
  } catch {
    return videoOutcomes;
  }
}

export function buildLearningProgressDashboard(userId: string): LearningProgressDashboardDto {
  const uid = userId.trim();
  const anchor = getSchoolAnchorProfile(uid);
  const matrix = getSchoolMatrixView(uid);
  const plan = getMentorPlanView(uid);
  const baselineRow = getBaselineStatus(uid);
  const baselineParsed = baselineRow ? parseBaseline(baselineRow) : null;

  const required = (matrix?.requiredMetrics ?? {}) as Record<string, unknown>;
  const baseline = (matrix?.currentBaseline ?? {}) as Record<string, unknown>;
  const scores = baselineParsed?.currentScores ?? {};

  const challengeIndex = plan?.challengeIndex ?? matrix?.challengeIndex ?? 88;
  const certaintyPct = Math.max(1, Math.min(99, 100 - challengeIndex));
  const milestones = plan?.dynamicMilestones?.length
    ? plan.dynamicMilestones
    : [];
  const completed = milestones.filter((m) => m.status === 'COMPLETED').length;
  const milestonePct =
    milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : Math.round(certaintyPct * 0.6);

  const prevWeek = getSnapshotNear(uid, 7 * 86400);
  const prevSubjects = prevWeek
    ? (JSON.parse(prevWeek.subjects_json) as Record<string, number>)
    : null;
  const lastSnap = getLatestSnapshot(uid);
  const prevSubjectsRecent = lastSnap
    ? (JSON.parse(lastSnap.subjects_json) as Record<string, number>)
    : prevSubjects;

  const pathway = anchor
    ? detectSchoolPathway(anchor.school, anchor.major, {
        currentSchool: anchor.currentSchool,
        currentRegion: anchor.currentRegion,
        targetSchoolRegion: anchor.targetSchoolRegion,
      })
    : 'generic';
  const requiredAligned = mergeMetricsForPathway(
    anchor ? matchSchoolIntel(anchor.school, anchor.major).requiredMetrics : {},
    required,
    pathway,
  );
  const subjects = buildSubjects(requiredAligned, baseline, scores, prevSubjectsRecent, pathway);
  const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s.progressPct]));

  const dreamDelta7d = prevWeek ? Math.round((certaintyPct - prevWeek.dream_pct) * 10) / 10 : 0;

  const textbooks = buildTextbooks(uid);

  const dirs = listUserDirectories(uid);
  const allDirs = [...dirs.pinned, ...dirs.custom].map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type,
  }));
  const directoryTargets = mapDirectoryTargets(allDirs, certaintyPct, subjects);

  const abilities = buildAbilities(certaintyPct, milestonePct, subjects);
  let outcomes = buildOutcomes(uid);

  const langProgress = getLanguageTutorProgress(uid);
  const videoCtx = getVideoLearnContext(uid);
  const videoCurve7d = videoCtx.studyCurve7d;
  const weekLanguageSessions = langProgress.curve7d.filter((p) => p.score != null).length;
  const weekVideoCheckpoints = videoCurve7d.reduce((a, d) => a + d.checkpoints, 0);

  for (const tb of textbooks.slice(0, 6)) {
    outcomes.unshift({
      id: `book-${tb.catalogId}`,
      title: `${tb.title} · ${tb.currentChapterTitle}`,
      source: '教材指认',
      at: Date.now(),
      tag: `${tb.progressPct}%`,
    });
  }
  if (outcomes.length === 0 && anchor) {
    outcomes = [
      {
        id: 'seed-1',
        title: `梦校航标：${anchor.school} · ${anchor.major}`,
        source: '航标',
        at: Date.now() - 86400000,
        tag: 'STRATEGY',
      },
    ];
  }

  const now = Date.now();
  const last = lastSnap?.recorded_at ?? 0;
  if (now / 1000 - last > 3600) {
    recordProgressSnapshot({ userId: uid, dreamPct: certaintyPct, subjects: subjectMap });
  }

  const daysRemaining = anchor ? daysUntilApply(anchor.targetApplyAt) : 365;
  const momentumHint =
    weekLanguageSessions + weekVideoCheckpoints >= 3
      ? `本周口语 ${weekLanguageSessions} 天、视频 ${weekVideoCheckpoints} 卡点 — 与倒计时同步推进中。`
      : daysRemaining < 180
        ? `距入学仅 ${daysRemaining} 天，口语/视频流水偏少，今晚补一次可验证练习。`
        : `距入学 ${daysRemaining} 天 · 保持每周 ≥3 次口语或视频撞击。`;

  return {
    pathway,
    pathwayLabel: PATHWAY_LABEL[pathway],
    dream: {
      certaintyPct,
      challengeIndex,
      daysRemaining,
      milestonePct,
      delta7d: dreamDelta7d,
      targetSchool: plan?.targetSchool ?? (anchor ? `${anchor.school} · ${anchor.major}` : '未锁定'),
      targetApplyAt: anchor?.targetApplyAt ?? '—',
      activePhase: plan?.activePhase ?? matrix?.activePhase ?? milestones.find((m) => m.status === 'IN_PROGRESS')?.codeName ?? null,
    },
    subjects,
    textbooks,
    directories: directoryTargets,
    abilities,
    outcomes,
    momentum: {
      languageCurve7d: langProgress.curve7d,
      videoCurve7d,
      weekLanguageSessions,
      weekVideoCheckpoints,
      speakingWeekDelta: langProgress.weekDelta,
      momentumHint,
    },
    updatedAt: now,
  };
}
