/**
 * ZHI · 课件智能匹配：按用户知识缺口 + 标签体系快速推荐
 */

import { getBaselineStatus, parseBaseline } from '../db/baseline-schema';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import { getSchoolMatrixView } from '../db/school-matrix';
import {
  getCoursewareById,
  listActiveCourseware,
  parseCoursewareRow,
  type CoursewareCatalogRow,
} from '../db/zhi-courseware-catalog-schema';
import { listTextbooksForUser, parseTextbookOutline } from '../db/zhi-textbook-catalog-schema';
import { getTodayDailyReview } from './zhi-daily-review-engine';
import { getLanguageProfile } from '../db/zhi-language-profile-schema';
import { matchSchoolIntel } from './school-anchor-brief';

export type UserKnowledgeNeed = {
  focusSubject: string;
  weakTopics: string[];
  priorityTopics: string[];
  dreamSchool: string;
  major: string;
  examTargets: string[];
  needSummary: string;
};

export type CoursewareMatchDto = {
  courseware: ReturnType<typeof parseCoursewareRow>;
  matchScore: number;
  matchReasons: string[];
  coveredNeeds: string[];
  qualityHighlight: string;
};

export type CoursewareMatchPackDto = {
  needs: UserKnowledgeNeed;
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

const SUBJECT_ZH: Record<string, string> = {
  math: '数学',
  physics: '物理',
  chemistry: '化学',
  cs: '计算机',
  algo: '算法',
  toefl: '托福',
  sat: 'SAT',
  essay: '文书',
  english: '英语',
};

const TAG_GLOSSARY: Record<string, string> = {
  subject: '学科：math/cs/algo/toefl/sat/essay/physics',
  difficulty: '难度：A2→C1 或 B1/B2/B3 高中到大学',
  qualityGrade: '质量：S顶尖 A优质 B可用 C慎用',
  topicTags: '知识点标签，用于缺口匹配',
  schoolAlign: '梦校对标：CMU/MIT/Ivy 等',
  examAlign: '考试对标：TOEFL/SAT/USACO/AP 等',
  wormholeValue: '虫洞值：越高越适合快速补洞',
};

const GRADE_SCORE: Record<string, number> = { S: 20, A: 15, B: 8, C: 2 };

function normalizeTag(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

const SUBJECT_ALIAS: Record<string, string[]> = {
  math: ['数学', 'math', '微积分', '线代', '概率', 'calculus'],
  physics: ['物理', 'physics', '力学'],
  algo: ['算法', 'algo', '数据结构', 'usaco', 'csp', '竞赛'],
  cs: ['计算机', 'cs', '系统', 'csapp'],
  toefl: ['托福', 'toefl', '口语', '英语'],
  sat: ['sat', '标化'],
  essay: ['文书', 'essay', 'commonapp'],
};

function expandNeedTokens(needs: UserKnowledgeNeed): string[] {
  const raw = [
    ...needs.weakTopics,
    ...needs.priorityTopics,
    ...needs.examTargets,
    needs.focusSubject,
    needs.major,
    needs.dreamSchool,
  ];
  const expanded = new Set<string>();
  for (const r of raw) {
    const n = normalizeTag(r);
    if (n) expanded.add(n);
    for (const [sub, aliases] of Object.entries(SUBJECT_ALIAS)) {
      if (aliases.some((a) => n.includes(normalizeTag(a)) || normalizeTag(a).includes(n))) {
        expanded.add(sub);
        aliases.forEach((a) => expanded.add(normalizeTag(a)));
      }
    }
  }
  return [...expanded];
}

function inferNeeds(userId: string): UserKnowledgeNeed {
  const uid = userId.trim();
  const anchor = getSchoolAnchorProfile(uid);
  const matrix = getSchoolMatrixView(uid);
  const baseline = getBaselineStatus(uid);
  const parsed = baseline ? parseBaseline(baseline) : { currentScores: {}, weakSubjects: [] as string[] };
  const review = getTodayDailyReview(uid);
  const p0 = review?.planCorrections?.find((c) => c.priority === 'P0');

  const weakTopics: string[] = [];
  const priorityTopics: string[] = [];
  const examTargets: string[] = [];

  for (const w of parsed.weakSubjects ?? []) weakTopics.push(w);

  const subjects = review?.subjectDeltas?.filter((s) => s.progressPct < 40 || s.deltaPct < 0) ?? [];
  for (const s of subjects) {
    weakTopics.push(s.name);
    if (s.id === 'toefl') examTargets.push('TOEFL', '托福口语');
    if (s.id === 'sat') examTargets.push('SAT', 'SAT-Math');
    if (s.id === 'algo') examTargets.push('USACO', '算法');
    if (s.id === 'essay') examTargets.push('CommonApp', '文书');
  }

  if (p0) {
    priorityTopics.push(p0.action.slice(0, 120));
    weakTopics.push(p0.subjectName);
  }

  const lang = getLanguageProfile(uid);
  if (lang && lang.speaking_est < 22) {
    weakTopics.push('托福', '口语', '流利度');
    examTargets.push('TOEFL');
  }

  for (const tb of listTextbooksForUser(uid).slice(0, 3)) {
    const chapters = parseTextbookOutline(tb);
    const cur = chapters.find((c) => c.index === (tb.progress_chapter ?? 1));
    if (cur?.knowledgePoints?.length) {
      priorityTopics.push(...cur.knowledgePoints.slice(0, 4));
      weakTopics.push(tb.subject ?? tb.title);
    }
  }

  const school = anchor?.school ?? matrix?.targetSchool ?? '梦校';
  const major = anchor?.major ?? 'CS';
  const intel = anchor?.school ? matchSchoolIntel(anchor.school, major) : null;
  if (intel?.requiredMetrics) {
    const m = intel.requiredMetrics as Record<string, string>;
    if (m.托福 || m.TOEFL) examTargets.push('TOEFL');
    if (m.SAT) examTargets.push('SAT');
  }

  if (major.includes('CS') || major.includes('计算机')) {
    priorityTopics.push('算法', '数据结构', '计算机系统');
    examTargets.push('USACO');
  }

  let focusSubject = 'math';
  const p0Name = p0?.subjectName ?? '';
  if (/托福|英语|TOEFL/i.test(p0Name)) focusSubject = 'toefl';
  else if (/SAT/i.test(p0Name)) focusSubject = 'sat';
  else if (/算法|CS|计算机/i.test(p0Name)) focusSubject = 'algo';
  else if (/物理/i.test(p0Name)) focusSubject = 'physics';
  else if (/文书/i.test(p0Name)) focusSubject = 'essay';
  else if (subjects[0]?.id) focusSubject = subjects[0].id === 'toefl' ? 'toefl' : subjects[0].id;

  const uniqueWeak = [...new Set(weakTopics.map(normalizeTag))].slice(0, 12);
  const uniquePri = [...new Set(priorityTopics.map((t) => t.slice(0, 40)))].slice(0, 10);
  const uniqueExam = [...new Set(examTargets)].slice(0, 8);

  const needSummary = [
    `梦校 ${school} · ${major}`,
    uniqueWeak.length ? `薄弱：${uniqueWeak.slice(0, 4).join('、')}` : '薄弱项待建档',
    p0 ? `今日 P0：${p0.subjectName}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    focusSubject,
    weakTopics: uniqueWeak,
    priorityTopics: uniquePri,
    dreamSchool: school,
    major,
    examTargets: uniqueExam,
    needSummary,
  };
}

function scoreCoursewareWithBoost(
  row: CoursewareCatalogRow,
  needs: UserKnowledgeNeed,
  boostTags: string[] = [],
): CoursewareMatchDto | null {
  const base = scoreCourseware(row, needs);
  if (!base) return null;
  if (boostTags.length === 0) return base;

  const cwTags = [
    ...parseCoursewareRow(row).topicTags,
    ...parseCoursewareRow(row).knowledgePoints.map((k) => k.name),
  ].map(normalizeTag);

  let extra = 0;
  const covered: string[] = [...base.coveredNeeds];
  for (const tag of boostTags) {
    const n = normalizeTag(tag);
    if (cwTags.some((t) => t.includes(n) || n.includes(t))) {
      extra += 10;
      covered.push(tag);
    }
  }
  if (extra > 0) {
    base.matchReasons.unshift(`教材知识点命中 +${Math.min(30, extra)}`);
  }
  return {
    ...base,
    matchScore: Math.min(100, base.matchScore + Math.min(30, extra)),
    coveredNeeds: [...new Set(covered)].slice(0, 6),
  };
}

function buildTextbookAlignments(userId: string, needs: UserKnowledgeNeed): TextbookAlignmentDto[] {
  const uid = userId.trim();
  const catalog = listActiveCourseware();
  const out: TextbookAlignmentDto[] = [];

  for (const tb of listTextbooksForUser(uid).slice(0, 5)) {
    const chapters = parseTextbookOutline(tb);
    const prog = tb.progress_chapter ?? 1;
    const cur = chapters.find((c) => c.index === prog) ?? chapters[prog - 1];
    if (!cur) continue;

    const kps = cur.knowledgePoints ?? [];
    if (!kps.length) continue;

    const matches = catalog
      .map((row) => scoreCoursewareWithBoost(row, needs, kps))
      .filter((m): m is CoursewareMatchDto => m != null)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 3);

    if (matches.length === 0) continue;

    out.push({
      catalogId: tb.id,
      textbookTitle: tb.title,
      publisher: tb.publisher,
      subject: tb.subject ?? '综合',
      chapterIndex: cur.index,
      chapterTitle: cur.title,
      knowledgePoints: kps,
      matches,
    });
  }
  return out;
}

function scoreCourseware(row: CoursewareCatalogRow, needs: UserKnowledgeNeed): CoursewareMatchDto | null {
  const cw = parseCoursewareRow(row);
  const reasons: string[] = [];
  const covered: string[] = [];
  let score = 0;

  const needTags = expandNeedTokens(needs);

  const cwTags = [
    ...cw.topicTags,
    cw.subject,
    ...cw.schoolAlign,
    ...cw.examAlign,
    cw.difficulty ?? '',
  ].map(normalizeTag);

  let tagHits = 0;
  for (const need of needTags) {
    if (!need || need.length < 2) continue;
    const hit = cwTags.some((t) => t.includes(need) || need.includes(t));
    if (hit) {
      tagHits += 1;
      covered.push(need);
    }
  }
  score += Math.min(40, tagHits * 8);
  if (tagHits > 0) reasons.push(`知识点标签命中 ${tagHits} 项`);

  if (cw.subject === needs.focusSubject) {
    score += 20;
    reasons.push(`学科对齐：${SUBJECT_ZH[cw.subject] ?? cw.subject}`);
  } else if (needs.focusSubject === 'toefl' && cw.subject === 'english') {
    score += 12;
  }

  const schoolNorm = normalizeTag(needs.dreamSchool);
  if (cw.schoolAlign.some((s) => schoolNorm.includes(normalizeTag(s)) || normalizeTag(s).includes(schoolNorm))) {
    score += 15;
    reasons.push(`梦校对标 ${needs.dreamSchool}`);
  }

  for (const ex of needs.examTargets) {
    if (cw.examAlign.some((e) => normalizeTag(e).includes(normalizeTag(ex)))) {
      score += 8;
      reasons.push(`考试对标 ${ex}`);
      break;
    }
  }

  score += GRADE_SCORE[cw.qualityGrade] ?? 5;
  reasons.push(`质量 ${cw.qualityGrade} 级 · 综合 ${cw.quality.composite} 分`);

  score += Math.round(cw.wormholeValue * 10);
  if (cw.wormholeValue >= 0.9) reasons.push('高虫洞值，适合快速补洞');

  if (score < 18) return null;

  const qualityHighlight = `逻辑${Math.round(cw.quality.logic * 100)} · 直觉${Math.round(cw.quality.intuition * 100)} · 严谨${Math.round(cw.quality.rigor * 100)}`;

  return {
    courseware: cw,
    matchScore: Math.min(100, score),
    matchReasons: reasons.slice(0, 4),
    coveredNeeds: [...new Set(covered)].slice(0, 5),
    qualityHighlight,
  };
}

export function matchCoursewareForUser(userId: string, limit = 6): CoursewareMatchPackDto {
  const needs = inferNeeds(userId);
  const textbookAlignments = buildTextbookAlignments(userId, needs);
  const catalog = listActiveCourseware();

  const scored = catalog
    .map((row) => scoreCourseware(row, needs))
    .filter((m): m is CoursewareMatchDto => m != null)
    .sort((a, b) => b.matchScore - a.matchScore);

  const merged: CoursewareMatchDto[] = [];
  for (const a of textbookAlignments) {
    for (const m of a.matches) {
      if (!merged.find((x) => x.courseware.id === m.courseware.id)) merged.push(m);
    }
  }
  for (const m of scored) {
    if (merged.length >= limit) break;
    if (!merged.find((x) => x.courseware.id === m.courseware.id)) merged.push(m);
  }

  const matches = merged.slice(0, limit);

  if (matches.length === 0) {
    const fallback = catalog
      .filter((r) => r.quality_grade === 'S' || r.quality_grade === 'A')
      .slice(0, limit)
      .map((row) => {
        const cw = parseCoursewareRow(row);
        return {
          courseware: cw,
          matchScore: 50,
          matchReasons: ['优质课件库推荐', `质量 ${cw.qualityGrade} 级`],
          coveredNeeds: [] as string[],
          qualityHighlight: `综合 ${cw.quality.composite} 分`,
        };
      });
    return { needs, matches: fallback, textbookAlignments, tagGlossary: TAG_GLOSSARY };
  }

  return { needs, matches, textbookAlignments, tagGlossary: TAG_GLOSSARY };
}

export function matchCoursewareForTextbookChapter(
  userId: string,
  catalogId: string,
  chapterIndex?: number,
  limit = 4,
): TextbookAlignmentDto | null {
  const uid = userId.trim();
  const tb = listTextbooksForUser(uid).find((t) => t.id === catalogId);
  if (!tb) return null;
  const chapters = parseTextbookOutline(tb);
  const idx = chapterIndex ?? tb.progress_chapter ?? 1;
  const cur = chapters.find((c) => c.index === idx) ?? chapters[idx - 1];
  if (!cur) return null;

  const needs = inferNeeds(uid);
  const kps = cur.knowledgePoints ?? [];
  const catalog = listActiveCourseware();
  const matches = catalog
    .map((row) => scoreCoursewareWithBoost(row, needs, kps))
    .filter((m): m is CoursewareMatchDto => m != null)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return {
    catalogId: tb.id,
    textbookTitle: tb.title,
    publisher: tb.publisher,
    subject: tb.subject ?? '综合',
    chapterIndex: cur.index,
    chapterTitle: cur.title,
    knowledgePoints: kps,
    matches,
  };
}

export function getCoursewareByIdDto(id: string) {
  const row = getCoursewareById(id);
  return row ? parseCoursewareRow(row) : null;
}
