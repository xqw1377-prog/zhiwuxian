/**
 * 学习者证据汇聚 · 短板排序 · 推动指令
 * 汇总：建档 / 评估 / 矩阵 / 日报 / 因果汇报 / 进度 → 驱动路径与 ZHI 推动
 */

import { getBaselineStatus, parseBaseline } from '../db/baseline-schema';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { getMentorPlanView, getSchoolMatrixView } from '../db/school-matrix';
import { listAssessmentPapers, type AssessmentPaperRow } from '../db/zhi-assessment-schema';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { getTodayDailyReview } from './zhi-daily-review-engine';
import { buildLearningProgressDashboard } from './learning-progress-dashboard';
import { buildLearnerProfile } from './learner-profile';
import type { PathKnowledgeUnit, PathTodayFocus } from '../db/learning-path-schema';
import { inferAssessmentSubjectId } from './zhi-chat-intent';

export type WeaknessSource =
  | 'baseline'
  | 'assessment'
  | 'matrix'
  | 'mentor'
  | 'daily_review'
  | 'causal'
  | 'dashboard'
  | 'momentum';

export type WeaknessItem = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  severity: number;
  sources: WeaknessSource[];
  evidence: string;
  actionDue?: string;
};

export type PathPushAction = {
  id: string;
  label: string;
  reason: string;
  subjectId?: string;
  kind: 'assessment' | 'vision' | 'causal' | 'path' | 'anchor';
};

export type LearnerEvidencePack = {
  weaknesses: WeaknessItem[];
  evidenceCount: number;
  lastEvidenceAt: string | null;
  dataCompletenessPct: number;
  pushHeadline: string;
  pushActions: PathPushAction[];
  missingSignals: string[];
};

function addDaysStr(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function subjectLabel(subjectId: string): string {
  const map: Record<string, string> = {
    math: '数学',
    phys: '物理',
    chem: '化学',
    en: '英语',
    toefl: '标化',
    sat: 'SAT',
    ap: 'AP',
    algo: '算法',
    essay: '文书',
    gpa: '综合',
  };
  return map[subjectId] ?? '综合';
}

function inferSubjectFromText(
  text: string,
  curriculumTrack: import('./learner-profile').CurriculumTrack = 'cn_gaokao',
): { subjectId: string; subjectName: string } {
  const id = inferAssessmentSubjectId(text, curriculumTrack) ?? 'gpa';
  return { subjectId: id, subjectName: subjectLabel(id) };
}

function mergeWeakness(
  map: Map<string, WeaknessItem>,
  item: Omit<WeaknessItem, 'id'> & { id?: string },
): void {
  const key = `${item.subjectId}::${item.title.slice(0, 40)}`;
  const existing = map.get(key);
  if (existing) {
    existing.severity = Math.min(100, existing.severity + Math.round(item.severity * 0.35));
    for (const s of item.sources) {
      if (!existing.sources.includes(s)) existing.sources.push(s);
    }
    if (item.evidence.length > existing.evidence.length) existing.evidence = item.evidence;
    if (item.actionDue && (!existing.actionDue || item.actionDue < existing.actionDue)) {
      existing.actionDue = item.actionDue;
    }
  } else {
    map.set(key, {
      id: item.id ?? key,
      title: item.title,
      subjectId: item.subjectId,
      subjectName: item.subjectName,
      severity: item.severity,
      sources: [...item.sources],
      evidence: item.evidence,
      actionDue: item.actionDue,
    });
  }
}

function listRecentAssessmentGaps(userId: string, limit = 8): Array<{
  subjectId: string;
  subjectName: string;
  scorePct: number;
  gaps: string[];
}> {
  const papers = listAssessmentPapers(userId, limit).filter((p) => p.status === 'reckoned');
  const out: Array<{ subjectId: string; subjectName: string; scorePct: number; gaps: string[] }> = [];
  const db = getLearningDb();
  for (const p of papers) {
    const attempt = db
      .prepare(
        `SELECT eval_json, score_pct FROM zhi_assessment_attempts
         WHERE paper_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(p.id) as { eval_json: string | null; score_pct: number | null } | undefined;
    let gaps: string[] = [];
    let scorePct = parseInt(String(p.score_summary ?? '').replace(/%/g, ''), 10) || 0;
    if (attempt?.eval_json) {
      try {
        const ev = JSON.parse(attempt.eval_json) as { gaps?: string[]; scorePct?: number };
        gaps = Array.isArray(ev.gaps) ? ev.gaps.map(String).slice(0, 4) : [];
        if (typeof ev.scorePct === 'number') scorePct = ev.scorePct;
      } catch {
        /* ignore */
      }
    }
    if (attempt?.score_pct != null) scorePct = Math.round(attempt.score_pct);
    if (gaps.length || scorePct < 75) {
      out.push({
        subjectId: p.subject_id,
        subjectName: p.subject_name,
        scorePct,
        gaps: gaps.length ? gaps : [`${p.subject_name} 掌握待提升（${scorePct}%）`],
      });
    }
  }
  return out;
}

function parseCausalStuck(userId: string): string[] {
  const row = getBaselineStatus(userId);
  if (!row) return [];
  try {
    const b = parseBaseline(row);
    const stuck: string[] = [];
    for (const [k, v] of Object.entries(b.currentScores)) {
      if (k.startsWith('汇报·') && /卡点/.test(String(v))) {
        const m = String(v).match(/卡点：([^|]+)/);
        if (m?.[1]) stuck.push(m[1].trim().slice(0, 80));
      }
    }
    return stuck;
  } catch {
    return [];
  }
}

/** 汇聚全渠道证据并排序短板 */
export function aggregateLearnerEvidence(userId: string): LearnerEvidencePack {
  const uid = userId.trim();
  const map = new Map<string, WeaknessItem>();
  let evidenceCount = 0;
  let lastTs = 0;

  const anchor = getSchoolAnchorProfile(uid);
  const profile = anchor?.school ? buildLearnerProfile(uid) : null;
  const track = profile?.curriculumTrack ?? 'cn_gaokao';
  const baselineRow = getBaselineStatus(uid);

  if (baselineRow) {
    const b = parseBaseline(baselineRow);
    evidenceCount += Object.keys(b.currentScores).length;
    lastTs = Math.max(lastTs, baselineRow.updated_at ?? 0);
    for (const w of b.weakSubjects) {
      const t = String(w).trim();
      if (!t) continue;
      const { subjectId, subjectName } = inferSubjectFromText(t, track);
      mergeWeakness(map, {
        title: t.slice(0, 80),
        subjectId,
        subjectName,
        severity: 72,
        sources: ['baseline'],
        evidence: `学业建档·薄弱科目：${t}`,
        actionDue: addDaysStr(3),
      });
    }
    for (const [k, v] of Object.entries(b.currentScores)) {
      const val = String(v);
      if (/待提升|卡点|薄弱|未过|<\s*60|不足/i.test(val) || (/%/.test(val) && parseInt(val, 10) < 65)) {
        const { subjectId, subjectName } = inferSubjectFromText(k, track);
        mergeWeakness(map, {
          title: `${k}`.slice(0, 60),
          subjectId,
          subjectName,
          severity: 58,
          sources: ['baseline'],
          evidence: val.slice(0, 120),
          actionDue: addDaysStr(5),
        });
      }
    }
  }

  const matrix = getSchoolMatrixView(uid);
  for (const g of matrix?.gapDetails ?? []) {
    const t = String(g).trim();
    if (!t) continue;
    const { subjectId, subjectName } = inferSubjectFromText(t, track);
    mergeWeakness(map, {
      title: t.slice(0, 80),
      subjectId,
      subjectName,
      severity: 68,
      sources: ['matrix'],
      evidence: `梦校差距项：${t}`,
      actionDue: addDaysStr(7),
    });
  }

  const plan = getMentorPlanView(uid);
  for (const g of plan?.causalityGaps ?? []) {
    const t = String(g.causalityEffect ?? g.weakness ?? '').trim();
    if (!t) continue;
    const { subjectId, subjectName } = inferSubjectFromText(t, track);
    mergeWeakness(map, {
      title: t.slice(0, 80),
      subjectId,
      subjectName,
      severity: 65,
      sources: ['mentor'],
      evidence: `导师因果：${t}`,
      actionDue: addDaysStr(5),
    });
  }

  for (const a of listRecentAssessmentGaps(uid, 10)) {
    evidenceCount += 1;
    for (const gap of a.gaps) {
      mergeWeakness(map, {
        title: gap.slice(0, 80),
        subjectId: a.subjectId,
        subjectName: a.subjectName,
        severity: Math.max(55, 95 - a.scorePct),
        sources: ['assessment'],
        evidence: `评估 ${a.scorePct}% · ${gap}`,
        actionDue: addDaysStr(a.scorePct >= 60 ? 5 : 2),
      });
    }
  }

  const review = getTodayDailyReview(uid);
  if (review) {
    evidenceCount += review.retrospective?.length ?? 0;
    for (const c of review.planCorrections ?? []) {
      if (c.priority === 'P0' || c.priority === 'P1') {
        mergeWeakness(map, {
          title: `${c.subjectName}：${c.action}`.slice(0, 80),
          subjectId: c.subjectId,
          subjectName: c.subjectName,
          severity: c.priority === 'P0' ? 78 : 62,
          sources: ['daily_review'],
          evidence: `每日复盘 ${c.priority} · 截止 ${c.dueBy}`,
          actionDue: addDaysStr(c.priority === 'P0' ? 1 : 2),
        });
      }
    }
  }

  for (const stuck of parseCausalStuck(uid)) {
    const { subjectId, subjectName } = inferSubjectFromText(stuck);
    mergeWeakness(map, {
      title: stuck.slice(0, 80),
      subjectId,
      subjectName,
      severity: 80,
      sources: ['causal'],
      evidence: `因果汇报卡点：${stuck}`,
      actionDue: addDaysStr(1),
    });
  }

  try {
    const dash = buildLearningProgressDashboard(uid);
    if (dash.momentum?.momentumHint && /停滞|落后|预警|不足|放缓/.test(dash.momentum.momentumHint)) {
      mergeWeakness(map, {
        title: '学习动能不足 · 需证据推进',
        subjectId: 'gpa',
        subjectName: '综合',
        severity: 70,
        sources: ['momentum'],
        evidence: dash.momentum.momentumHint,
        actionDue: addDaysStr(2),
      });
    }
    for (const s of dash.subjects) {
      if (s.progressPct < 45) {
        mergeWeakness(map, {
          title: `${s.name} 进度 ${s.progressPct}% · 低于梦校线`,
          subjectId: s.id,
          subjectName: s.name,
          severity: Math.max(50, 85 - s.progressPct),
          sources: ['dashboard'],
          evidence: `分科进度 ${s.displayCurrent} / 目标 ${s.displayTarget}`,
          actionDue: addDaysStr(4),
        });
      }
    }
  } catch {
    /* ignore */
  }

  const weaknesses = [...map.values()]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 12);

  const missingSignals: string[] = [];
  if (!anchor?.school) missingSignals.push('梦校航标');
  if (!baselineRow || Object.keys(parseBaseline(baselineRow).currentScores).length < 2) {
    missingSignals.push('试卷/教材建档');
  }
  if (!listAssessmentPapers(uid, 3).some((p) => p.status === 'reckoned')) {
    missingSignals.push('至少一次学习评估');
  }
  if (!profile?.provinceOrRegion) missingSignals.push('就读省份/地区');
  if (!anchor?.currentGrade) missingSignals.push('年级');

  let dataCompletenessPct = 0;
  if (anchor?.school) dataCompletenessPct += 25;
  if (baselineRow && Object.keys(parseBaseline(baselineRow).currentScores).length >= 2) {
    dataCompletenessPct += 25;
  }
  if (listAssessmentPapers(uid, 5).some((p) => p.status === 'reckoned')) dataCompletenessPct += 20;
  if (weaknesses.length > 0) dataCompletenessPct += 15;
  if (profile?.provinceOrRegion) dataCompletenessPct += 10;
  if (review) dataCompletenessPct += 5;
  dataCompletenessPct = Math.min(100, dataCompletenessPct);

  const top = weaknesses[0];
  const pushHeadline = top
    ? `短板优先：${top.title}（${top.subjectName}）— ${top.actionDue ?? '尽快'} 前验收`
    : missingSignals.length
      ? `信息不足：先补齐 ${missingSignals.slice(0, 2).join('、')}，我才能精准推你`
      : '继续建档与评估，路径会随证据自动收紧';

  const pushActions: PathPushAction[] = [];
  if (missingSignals.includes('试卷/教材建档')) {
    pushActions.push({
      id: 'push-vision',
      label: '📷 拍试卷/教材建档',
      reason: '没有卷面证据，短板只能猜',
      kind: 'vision',
    });
  }
  if (missingSignals.includes('至少一次学习评估')) {
    pushActions.push({
      id: 'push-assess',
      label: '📋 立即摸底评估',
      reason: '有学必考，用分数替换猜测',
      kind: 'assessment',
      subjectId: top?.subjectId ?? 'math',
    });
  }
  if (top) {
    pushActions.push({
      id: 'push-focus-assess',
      label: `验收：${top.title.slice(0, 20)}`,
      reason: top.evidence.slice(0, 60),
      kind: 'assessment',
      subjectId: top.subjectId,
    });
  }
  pushActions.push({
    id: 'push-path',
    label: '🗺 查看全路径',
    reason: '按时间轴推进，不跳阶段',
    kind: 'path',
  });
  if (parseCausalStuck(uid).length === 0 && dataCompletenessPct >= 50) {
    pushActions.push({
      id: 'push-causal',
      label: '⚡ 因果汇报今日卡点',
      reason: '汇报后我会把卡点写进路径',
      kind: 'causal',
    });
  }

  const lastEvidenceAt =
    lastTs > 0 ? new Date(lastTs * 1000).toISOString().slice(0, 10) : null;

  return {
    weaknesses,
    evidenceCount,
    lastEvidenceAt,
    dataCompletenessPct,
    pushHeadline,
    pushActions: pushActions.slice(0, 5),
    missingSignals,
  };
}

export function weaknessesToPathUnits(
  weaknesses: WeaknessItem[],
  defaultDue: string,
): PathKnowledgeUnit[] {
  return weaknesses.map((w, i) => ({
    id: `weak-${w.id}`,
    title: w.title,
    subjectId: w.subjectId,
    subjectName: w.subjectName,
    masteryTargetPct: 85,
    currentPct: Math.max(0, 100 - w.severity),
    dueDate: w.actionDue ?? defaultDue,
    status: (i === 0 ? 'assessment_due' : 'locked') as PathKnowledgeUnit['status'],
    source: 'gap' as const,
    requiresAssessment: true,
  }));
}

export function pickFocusFromWeaknesses(
  weaknesses: WeaknessItem[],
  fallback: PathTodayFocus | null,
): PathTodayFocus | null {
  const top = weaknesses[0];
  if (!top) return fallback;
  return {
    subjectId: top.subjectId,
    title: top.title,
    dueDate: top.actionDue ?? addDaysStr(3),
    reason: `短板推动 · ${top.sources.join('+')} · ${top.evidence.slice(0, 48)}`,
  };
}

export function formatEvidencePushBlock(pack: LearnerEvidencePack): string {
  const lines = [pack.pushHeadline];
  if (pack.missingSignals.length) {
    lines.push(`待补齐：${pack.missingSignals.join('、')}`);
  }
  if (pack.weaknesses.length) {
    lines.push('当前短板 TOP3：');
    for (const w of pack.weaknesses.slice(0, 3)) {
      lines.push(`  · [${w.severity}] ${w.title}（${w.evidence.slice(0, 40)}）`);
    }
  }
  lines.push(`证据完备度 ${pack.dataCompletenessPct}% · 已收录 ${pack.evidenceCount} 条`);
  return lines.join('\n');
}
