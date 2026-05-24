/**
 * ZHI · 学习向上下文快照（借鉴「结构化上下文」，范围仅限学业，不拉邮箱/日历）
 */

import { getBaselineStatus, parseBaseline } from '../db/baseline-schema';
import { listUserDirectories } from '../db/directory-schema';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { buildLearningProgressDashboard } from './learning-progress-dashboard';
import { buildLearnerProfile, formatLearnerProfileBlock, type LearnerProfile } from './learner-profile';
import { detectSchoolPathway, PATHWAY_LABEL, type SchoolPathway } from './school-pathway';
import { getLearningPath } from './learning-path-engine';
import { aggregateLearnerEvidence } from './learner-evidence-hub';
import type { PathPhase } from '../db/learning-path-schema';

export type LearningContextSnapshot = {
  pathway: SchoolPathway;
  pathwayLabel: string;
  anchorLine: string;
  geoLine: string;
  learnerProfile: LearnerProfile | null;
  focusDirectory: string | null;
  subjectLines: string[];
  momentumHint: string | null;
  baselineEvidenceCount: number;
  weakSubjects: string[];
  weakestSubject: { name: string; progressPct: number } | null;
  patrolQuestions: string[];
  learningPathLine: string | null;
};

export function buildLearningContextSnapshot(
  userId: string,
  opts?: { focusDirectoryId?: string | null },
): LearningContextSnapshot | null {
  const uid = userId.trim();
  const anchor = getSchoolAnchorProfile(uid);
  if (!anchor?.school) return null;

  const pathway = detectSchoolPathway(anchor.school, anchor.major, {
    currentSchool: anchor.currentSchool,
    currentRegion: anchor.currentRegion,
    targetSchoolRegion: anchor.targetSchoolRegion,
  });

  const dash = buildLearningProgressDashboard(uid);
  const dirs = listUserDirectories(uid);
  const allDirs = [...dirs.pinned, ...dirs.custom];
  const focusId = opts?.focusDirectoryId?.trim();
  const activeDir = focusId
    ? (allDirs.find((d) => d.id === focusId) ??
      dirs.pinned.find((d) => d.type === 'ACADEMIC_SUBJECT') ??
      dirs.custom[0] ??
      null)
    : (dirs.pinned.find((d) => d.type === 'ACADEMIC_SUBJECT') ??
      dirs.custom[0] ??
      dirs.pinned.find((d) => d.type === 'STRATEGIC_GOAL') ??
      null);

  const subjectLines = dash.subjects.slice(0, 6).map((s) => {
    const cur = s.displayCurrent === '待录入' ? '待录入' : `${s.displayCurrent}${s.unit}`;
    return `  · ${s.name}：${cur} / 目标 ${s.displayTarget}${s.unit ? s.unit : ''}（${s.progressPct}%）`;
  });

  const baselineRow = getBaselineStatus(uid);
  let baselineEvidenceCount = 0;
  let weakSubjects: string[] = [];
  if (baselineRow) {
    try {
      const parsed = parseBaseline(baselineRow);
      baselineEvidenceCount = Object.keys(parsed.currentScores).length;
      weakSubjects = parsed.weakSubjects;
    } catch {
      baselineEvidenceCount = 0;
      weakSubjects = [];
    }
  }

  const weakestSubject =
    dash.subjects.length > 0
      ? dash.subjects
          .slice()
          .sort((a, b) => (a.progressPct - b.progressPct) || a.name.localeCompare(b.name))
          .map((s) => ({ name: s.name, progressPct: s.progressPct }))
          [0]
      : null;

  const geoParts: string[] = [];
  if (anchor.currentSchool) geoParts.push(`现就读 ${anchor.currentSchool}`);
  if (anchor.currentRegion) geoParts.push(anchor.currentRegion);
  if (anchor.targetSchoolRegion) geoParts.push(`梦校所在地 ${anchor.targetSchoolRegion}`);

  const learnerProfile = buildLearnerProfile(uid);
  const track = learnerProfile?.curriculumTrack ?? pathway;

  const patrolQuestions =
    track === 'cn_gaokao' || pathway === 'domestic_cn'
      ? [
          '1. 自上次对话以来，高考/学考/竞赛节点推进了多少？',
          '2. 数学/物理/选考科目：哪一章或哪类题仍卡壳？',
          '3. 明天之前你能交付什么证据（省卷模拟/错题本/竞赛提交）？',
        ]
      : track === 'intl_ib_ap' || track === 'intl_us_uk' || pathway === 'us_intl'
        ? [
            '1. 自上次对话以来，标化或国际课程单元推进了多少？',
            '2. AP/IB/A-Level/托福雅思：哪一块仍卡壳？',
            '3. 明天之前你能交付什么证据（模考卷面/口语录音/作业截图）？',
          ]
        : [
            '1. 自上次对话以来，校内单元或弱项推进了多少？',
            '2. 今天最卡的一科/一章是什么？',
            '3. 明天之前你能交付什么可检验的证据？',
          ];

  const pathDoc = getLearningPath(uid);
  const evidence = pathDoc ? null : anchor?.school ? aggregateLearnerEvidence(uid) : null;
  const learningPathLine = pathDoc
    ? [
        pathDoc.pushHeadline ?? pathDoc.summaryLine,
        pathDoc.weaknessLedger?.[0] ? `短板：${pathDoc.weaknessLedger[0].title}` : '',
        pathDoc.todayFocus ? `今日攻坚：${pathDoc.todayFocus.title}（${pathDoc.todayFocus.dueDate}）` : '',
        `证据 ${pathDoc.dataCompletenessPct ?? '—'}% · 必考 ${pathDoc.nextAssessmentDue ?? '待排'}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : evidence
      ? `${evidence.pushHeadline} · 完备度 ${evidence.dataCompletenessPct}%`
      : null;

  return {
    pathway,
    pathwayLabel: PATHWAY_LABEL[pathway],
    anchorLine: `${anchor.school} · ${anchor.major} · ${anchor.currentGrade} · 入学 ${anchor.targetApplyAt}`,
    geoLine: geoParts.length ? geoParts.join(' · ') : '（建议补全现就读学校与所在地，科目轨会更准）',
    learnerProfile,
    focusDirectory: activeDir?.title ?? null,
    subjectLines,
    momentumHint: dash.momentum?.momentumHint ?? null,
    baselineEvidenceCount,
    weakSubjects,
    weakestSubject,
    patrolQuestions,
    learningPathLine,
  };
}

export function formatLearningSnapshotBlock(snap: LearningContextSnapshot): string {
  const lines = [
    `升学路径：${snap.pathwayLabel}`,
    `梦校航标：${snap.anchorLine}`,
    `地理/就读：${snap.geoLine}`,
  ];
  if (snap.learnerProfile) {
    lines.push('【学习者画像】', formatLearnerProfileBlock(snap.learnerProfile));
  }
  if (snap.focusDirectory) lines.push(`当前聚焦目录：${snap.focusDirectory}`);
  if (snap.subjectLines.length) {
    lines.push('分科进度（学习向快照）：', ...snap.subjectLines);
  } else {
    lines.push('分科进度：待首次建档后生成');
  }
  if (snap.momentumHint) lines.push(`本周动能：${snap.momentumHint}`);
  if (snap.learningPathLine) lines.push(`梦校学习路径：${snap.learningPathLine}`);
  lines.push(`学业建档条目：${snap.baselineEvidenceCount} 条（试卷/教材/归档）`);
  return lines.join('\n');
}
