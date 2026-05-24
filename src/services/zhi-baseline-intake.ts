/**
 * ZHI · 学业建档证据落库（试卷/教材/对话归档 → baseline 表 + 进度快照）
 */

import { getBaselineStatus, parseBaseline, upsertBaselineStatus } from '../db/baseline-schema';
import { recordProgressSnapshot } from '../db/zhi-progress-history-schema';
import { buildLearningProgressDashboard } from './learning-progress-dashboard';
import { generatePostLearningActivePaper } from './zhi-learning-assessment';
import { rebuildLearningPathFromEvidence } from './learning-path-engine';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';

export type BaselineEvidenceKind = 'vision' | 'chat' | 'archive' | 'voice' | 'video';

export async function recordBaselineEvidence(input: {
  userId: string;
  kind: BaselineEvidenceKind;
  label?: string;
  excerpt?: string;
}): Promise<{ keys: string[]; activeExam?: Awaited<ReturnType<typeof generatePostLearningActivePaper>> }> {
  const uid = input.userId.trim();
  const row = getBaselineStatus(uid);
  const parsed = row
    ? parseBaseline(row)
    : { currentScores: {} as Record<string, string>, weakSubjects: [] as string[], estimatedHoursPerDay: null };

  const stamp = new Date().toISOString().slice(0, 10);
  const key =
    input.label?.trim().slice(0, 32) ||
    (input.kind === 'vision' ? '试卷/教材影像' : input.kind === 'voice' ? '语音汇报' : input.kind === 'video' ? '视频学习' : '学业建档');
  const snippet = (input.excerpt ?? '').trim().slice(0, 200);
  const prev = parsed.currentScores[key];
  parsed.currentScores[key] = prev
    ? `${prev} · ${stamp}${snippet ? `：${snippet}` : ''}`
    : `${stamp}${snippet ? `：${snippet}` : '（已收到）'}`;

  upsertBaselineStatus({
    userId: uid,
    currentScores: parsed.currentScores,
    weakSubjects: parsed.weakSubjects,
    estimatedHoursPerDay: parsed.estimatedHoursPerDay,
  });

  try {
    const dash = buildLearningProgressDashboard(uid);
    const subjectMap: Record<string, number> = {};
    for (const s of dash.subjects) subjectMap[s.id] = s.progressPct;
    recordProgressSnapshot({
      userId: uid,
      dreamPct: dash.dream.certaintyPct,
      subjects: subjectMap,
    });
  } catch {
    /* 快照失败不阻断建档 */
  }

  let activeExam: Awaited<ReturnType<typeof generatePostLearningActivePaper>> = null;
  if (snippet.length >= 12 || input.kind === 'vision' || input.kind === 'video') {
    activeExam = await generatePostLearningActivePaper(uid, {
      kind: input.kind,
      label: input.label,
      excerpt: input.excerpt,
    });
  }

  return { keys: Object.keys(parsed.currentScores), activeExam };
}

/** 结构化建档（摄影拦截 / 教材指认确认后） */
export function applyStructuredBaseline(
  userId: string,
  input: {
    scores?: Record<string, string>;
    weakSubjects?: string[];
  },
): { keys: string[] } {
  const uid = userId.trim();
  const row = getBaselineStatus(uid);
  const parsed = row
    ? parseBaseline(row)
    : { currentScores: {} as Record<string, string>, weakSubjects: [] as string[], estimatedHoursPerDay: null };

  const stamp = new Date().toISOString().slice(0, 10);
  for (const [k, v] of Object.entries(input.scores ?? {})) {
    const key = k.trim().slice(0, 40);
    const val = String(v ?? '').trim().slice(0, 240);
    if (!key || !val) continue;
    const prev = parsed.currentScores[key];
    parsed.currentScores[key] = prev ? `${val} · 更新${stamp}` : `${val}（${stamp}）`;
  }

  const weak = input.weakSubjects?.length
    ? [...new Set([...parsed.weakSubjects, ...input.weakSubjects.map((s) => s.trim()).filter(Boolean)])].slice(0, 16)
    : parsed.weakSubjects;

  upsertBaselineStatus({
    userId: uid,
    currentScores: parsed.currentScores,
    weakSubjects: weak,
    estimatedHoursPerDay: parsed.estimatedHoursPerDay,
  });

  try {
    const dash = buildLearningProgressDashboard(uid);
    const subjectMap: Record<string, number> = {};
    for (const s of dash.subjects) subjectMap[s.id] = s.progressPct;
    recordProgressSnapshot({
      userId: uid,
      dreamPct: dash.dream.certaintyPct,
      subjects: subjectMap,
    });
  } catch {
    /* ignore */
  }

  if (getSchoolAnchorProfile(uid)?.school) {
    void rebuildLearningPathFromEvidence(uid);
  }
  return { keys: Object.keys(parsed.currentScores) };
}
