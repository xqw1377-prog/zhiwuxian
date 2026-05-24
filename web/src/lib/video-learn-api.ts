import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';
import { followUpAfterLearningEvidence } from './zhi-learning-followup';
import { emitDirectoryWorkspaceRefresh } from './wuxian-events';

export type ParsedVideoUrl = {
  kind: 'youtube' | 'bilibili' | 'unknown';
  embedUrl: string | null;
  rawUrl: string;
};

export type KnowledgeCellDto = {
  id: string;
  name: string;
  timestampStart: number;
  timestampEnd: number;
  densityScore?: number;
};

export type CoursewareKnowledgePointDto = {
  id: string;
  name: string;
  chapterHint?: string;
  timestampSec?: number;
};

export type CoursewareItemDto = {
  id: string;
  title: string;
  instructor: string | null;
  platform: string;
  sourceUrl: string;
  durationMin: number | null;
  subject: string;
  difficulty: string | null;
  qualityGrade: string;
  quality: { logic: number; intuition: number; rigor: number; production: number; completeness: number; composite: number };
  topicTags: string[];
  knowledgePoints: CoursewareKnowledgePointDto[];
  schoolAlign: string[];
  examAlign: string[];
  wormholeValue: number;
  recommendedSec: number;
  summary: string | null;
};

export type CoursewareMatchDto = {
  courseware: CoursewareItemDto;
  matchScore: number;
  matchReasons: string[];
  coveredNeeds: string[];
  qualityHighlight: string;
};

export type CoursewareMatchPackDto = {
  needs: {
    focusSubject: string;
    weakTopics: string[];
    priorityTopics: string[];
    dreamSchool: string;
    major: string;
    examTargets: string[];
    needSummary: string;
  };
  matches: CoursewareMatchDto[];
  textbookAlignments: TextbookAlignmentDto[];
  tagGlossary: Record<string, string>;
};

export type TextbookAlignmentDto = {
  catalogId: string;
  textbookTitle: string;
  publisher: string;
  subject: string;
  chapterIndex: number;
  chapterTitle: string;
  knowledgePoints: string[];
  matches: CoursewareMatchDto[];
};

export async function fetchCoursewareMatches(userId: string): Promise<CoursewareMatchPackDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/courseware/match/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<CoursewareMatchPackDto>(json);
}

export async function fetchTextbookCoursewareMatch(
  userId: string,
  catalogId: string,
  chapterIndex?: number,
): Promise<TextbookAlignmentDto | null> {
  const q = chapterIndex != null ? `?chapter=${chapterIndex}` : '';
  const res = await authFetch(
    `/api/v3.5/zhi/courseware/textbook/${encodeURIComponent(userId)}/${encodeURIComponent(catalogId)}${q}`,
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<TextbookAlignmentDto>(json);
}

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

export type VideoCheckpointEvalDto = {
  masteryScore: number;
  passed: boolean;
  whatWorked: string[];
  gapFix: string;
  coachFeedback: string;
  rewatchHint: string | null;
  sessionId: string;
  courseProgress?: { passedChapters: number; totalChapters: number; progressPct: number } | null;
};

export async function fetchVideoLearnContext(userId: string): Promise<VideoLearnContextDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/video/context/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<VideoLearnContextDto>(json);
}

export async function askVideoCheckpointApi(input: {
  userId: string;
  chapterTitle: string;
  courseId?: string;
  timestampSec?: number;
  videoTitle?: string;
}): Promise<{ question: string; coachLine: string; checkType: string }> {
  const res = await authFetch('/api/v3.5/zhi/video/checkpoint/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '????');
  }
  return unwrapEnvelope(json);
}

export async function evalVideoCheckpointApi(input: {
  userId: string;
  chapterTitle: string;
  courseId?: string;
  videoTitle?: string;
  timestampSec?: number;
  question: string;
  userAnswer: string;
  totalChapters?: number;
}): Promise<VideoCheckpointEvalDto> {
  const res = await authFetch('/api/v3.5/zhi/video/checkpoint/eval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '????');
  }
  return unwrapEnvelope<VideoCheckpointEvalDto>(json);
}

export async function finalizeVideoCheckpoint(userId: string, label: string, excerpt: string): Promise<void> {
  await followUpAfterLearningEvidence(userId, {
    kind: 'video',
    label,
    excerpt,
    forceDailyReview: false,
  });
  emitDirectoryWorkspaceRefresh();
}

export type CourseNodeDto = {
  id: string;
  title: string;
  video_timestamp_start: number;
  video_timestamp_end: number;
};

export function parseVideoUrl(raw: string): ParsedVideoUrl {
  const url = raw.trim();
  if (!url) return { kind: 'unknown', embedUrl: null, rawUrl: url };

  const ytMatch =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i) ??
    url.match(/youtube\.com\/embed\/([\w-]{6,})/i);
  if (ytMatch?.[1]) {
    return {
      kind: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`,
      rawUrl: url,
    };
  }

  const biliMatch = url.match(/bilibili\.com\/video\/(BV[\w]+)/i);
  if (biliMatch?.[1]) {
    return {
      kind: 'bilibili',
      embedUrl: `https://player.bilibili.com/player.html?bvid=${biliMatch[1]}&high_quality=1`,
      rawUrl: url,
    };
  }

  return { kind: 'unknown', embedUrl: null, rawUrl: url };
}

export async function assimilateVideoSession(input: {
  userId: string;
  videoUrl?: string;
  simulate?: boolean;
  videoDurationMinutes?: number;
  title?: string;
}): Promise<{
  courseId: string;
  nodeCount: number;
  cells: KnowledgeCellDto[];
  grade?: string;
  title?: string;
  coursewareIngest?: { ingested: boolean; coursewareId?: string; reason: string };
}> {
  const res = await authFetch('/api/v1/video/assimilate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      videoUrl: input.videoUrl,
      simulate: input.simulate,
      videoDurationMinutes: input.videoDurationMinutes,
      payload: input.title
        ? { title: input.title, estimatedDuration: input.videoDurationMinutes ?? 30 }
        : undefined,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string; status?: string };
    throw new Error(err.message ?? err.error ?? err.status ?? '??????');
  }
  const d = unwrapEnvelope<{
    courseId?: string;
    nodeCount?: number;
    coursewareIngest?: { ingested: boolean; coursewareId?: string; reason: string };
    report?: {
      videoId?: string;
      overallGrade?: string;
      knowledgeCells?: KnowledgeCellDto[];
    };
  }>(json);

  const report = d.report;
  const videoId = report?.videoId ?? `v-${Date.now()}`;
  const courseId = d.courseId ?? `course-${videoId}`;
  const cells = report?.knowledgeCells ?? [];

  return {
    courseId,
    nodeCount: d.nodeCount ?? cells.length,
    cells,
    grade: report?.overallGrade,
    title: input.title,
    coursewareIngest: d.coursewareIngest,
  };
}

export async function fetchCourseGraph(courseId: string): Promise<CourseNodeDto[]> {
  const res = await authFetch(`/api/v1/course/${encodeURIComponent(courseId)}/graph`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return [];
  const d = unwrapEnvelope<{ nodes?: CourseNodeDto[] }>(json);
  return (d.nodes ?? []).map((n) => ({
    id: String(n.id),
    title: String(n.title),
    video_timestamp_start: Number(n.video_timestamp_start),
    video_timestamp_end: Number(n.video_timestamp_end),
  }));
}

export async function resolveVideoCheckpoint(input: {
  userId: string;
  courseId: string;
  currentTimestamp: number;
  quizScore?: number;
}): Promise<{ event: string; redirectToSeconds?: number; meta?: Record<string, unknown> }> {
  const res = await authFetch('/api/v1/video/resolve-clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      courseId: input.courseId,
      currentTimestamp: Math.floor(input.currentTimestamp),
      telemetryData: { quizScore: input.quizScore ?? 0.6 },
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? '??????');
  }
  return unwrapEnvelope<{ event: string; redirectToSeconds?: number; meta?: Record<string, unknown> }>(json);
}

/** @deprecated use askVideoCheckpointApi */
export async function askZhiVideoCheckpoint(input: {
  userId: string;
  chapterTitle: string;
  userAnswer?: string;
}): Promise<string> {
  const title = input.chapterTitle;
  const feedback = input.userAnswer
    ? '\u3010\u89c6\u9891\u5b66\u4e60\u00b7\u4f5c\u7b54\u3011\u7ae0\u8282\u300c' + title + '\u300d\uff1a' + input.userAnswer
    : '\u3010\u89c6\u9891\u5b66\u4e60\u00b7\u51fa\u9898\u3011\u7ae0\u8282\u300c' + title + '\u300d\uff1a\u8bf7\u5411\u5b66\u4e60\u8005\u63d0\u51fa\u4e00\u4e2a\u7b80\u77ed\u7684\u68c0\u9a8c\u95ee\u9898\uff08\u4e00\u53e5\u8bdd\uff0c\u4e0d\u8981\u7b54\u6848\uff09\u3002';

  const res = await authFetch('/api/v3.5/zhi/intrusion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: input.userId, userFeedback: feedback }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? 'ZHI no response');
  }
  const d = unwrapEnvelope<{ zhiOpening?: string; zhiTip?: string }>(json);
  return [d.zhiOpening, d.zhiTip].filter(Boolean).join('\n') || 'continue';
}

export function formatTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function cellsToChapters(cells: KnowledgeCellDto[]): CourseNodeDto[] {
  return cells.map((c) => ({
    id: c.id,
    title: c.name,
    video_timestamp_start: c.timestampStart,
    video_timestamp_end: c.timestampEnd,
  }));
}
