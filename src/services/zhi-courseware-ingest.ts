/**
 * ZHI · 同化后课件自动入库（质量审计 → 标签化 → 目录）
 */

import type { SecondaryAssessmentReport } from '../../engine/core/video-assimilation-brain';
import {
  getCoursewareBySourceUrl,
  upsertCourseware,
  type CoursewareCatalogInput,
  type CoursewareQualityGrade,
} from '../db/zhi-courseware-catalog-schema';
import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';

export type AssimilationIngestResult = {
  ingested: boolean;
  coursewareId?: string;
  qualityGrade?: CoursewareQualityGrade;
  reason: string;
};

function detectPlatform(url: string): string {
  if (/bilibili/i.test(url)) return 'Bilibili';
  if (/youtube|youtu\.be/i.test(url)) return 'YouTube';
  if (/coursera/i.test(url)) return 'Coursera';
  if (/mit\.edu|ocw/i.test(url)) return 'OpenCourse';
  return 'Web';
}

function inferSubject(report: SecondaryAssessmentReport, title: string): string {
  const text = `${report.primaryCategory} ${report.subCategory} ${title}`.toLowerCase();
  if (/toefl|托福|口语|speaking/i.test(text)) return 'toefl';
  if (/sat|标化/i.test(text)) return 'sat';
  if (/算法|algorithm|usaco|data structure/i.test(text)) return 'algo';
  if (/系统|csapp|computer system|15-213/i.test(text)) return 'cs';
  if (/物理|physics|力学/i.test(text)) return 'physics';
  if (/化学|chemistry/i.test(text)) return 'chemistry';
  if (/文书|essay|common/i.test(text)) return 'essay';
  if (/概率|统计|probability/i.test(text)) return 'math';
  if (/线代|矩阵|linear|calculus|微积分|导数|极限/i.test(text)) return 'math';
  return 'math';
}

function gradeFromReport(report: SecondaryAssessmentReport): CoursewareQualityGrade {
  const g = report.overallGrade;
  if (g === 'S' || g === 'A' || g === 'B' || g === 'C') return g;
  const pa = report.primaryAssessment;
  const composite =
    pa.logicDensity * 0.35 +
    pa.intuitionScore * 0.3 +
    pa.academicAccuracy * 0.25 +
    report.spatialFoldRate * 0.1;
  if (composite >= 0.88) return 'S';
  if (composite >= 0.72) return 'A';
  if (composite >= 0.55) return 'B';
  return 'C';
}

function shouldIngest(grade: CoursewareQualityGrade, simulate?: boolean, sourceUrl?: string): string | null {
  if (!sourceUrl?.trim()) return '缺少可索引的视频 URL，未入库';
  if (simulate && !/^https?:\/\//i.test(sourceUrl)) return '本地模拟视频不入公共课件库';
  if (grade === 'C') return '质量评级 C，未入库（可继续学习）';
  return null;
}

function extractTopicTags(report: SecondaryAssessmentReport, title: string): string[] {
  const tags = new Set<string>();
  const parts = `${report.primaryCategory} ${report.subCategory}`.split(/[\/\/>·]/).map((s) => s.trim());
  for (const p of parts) if (p.length > 1) tags.add(p);
  for (const cell of report.knowledgeCells.slice(0, 8)) tags.add(cell.name);
  if (title) tags.add(title.slice(0, 40));
  tags.add('同化入库');
  return [...tags].slice(0, 20);
}

export function ingestCoursewareFromAssimilation(input: {
  userId: string;
  sourceUrl?: string;
  title?: string;
  durationMin?: number;
  simulate?: boolean;
  report: SecondaryAssessmentReport;
}): AssimilationIngestResult {
  const uid = input.userId.trim();
  const sourceUrl = (input.sourceUrl ?? input.report.videoId).trim();
  const title = input.title?.trim() || `课件 ${input.report.videoId}`;
  const grade = gradeFromReport(input.report);
  const reject = shouldIngest(grade, input.simulate, sourceUrl.startsWith('http') ? sourceUrl : input.sourceUrl);
  if (reject) return { ingested: false, qualityGrade: grade, reason: reject };

  const url = sourceUrl.startsWith('http') ? sourceUrl : input.sourceUrl;
  if (!url?.startsWith('http')) {
    return { ingested: false, qualityGrade: grade, reason: '无有效外链，未入库' };
  }

  const existing = getCoursewareBySourceUrl(url);
  if (existing) {
    return {
      ingested: false,
      coursewareId: existing.id,
      qualityGrade: grade,
      reason: '课件库已存在该链接，已复用',
    };
  }

  const anchor = getSchoolAnchorProfile(uid);
  const pa = input.report.primaryAssessment;
  const subject = inferSubject(input.report, title);
  const topicTags = extractTopicTags(input.report, title);

  const payload: CoursewareCatalogInput = {
    title,
    platform: detectPlatform(url),
    sourceUrl: url,
    durationMin: input.durationMin ?? Math.round(input.report.knowledgeCells.at(-1)?.timestampEnd ?? 1800) / 60,
    subject,
    difficulty: grade === 'S' ? 'B3' : 'B2',
    qualityGrade: grade,
    logicScore: pa.logicDensity,
    intuitionScore: pa.intuitionScore,
    rigorScore: pa.academicAccuracy,
    productionScore: 0.7,
    completenessScore: Math.min(1, input.report.knowledgeCells.length / 6),
    topicTags,
    knowledgePoints: input.report.knowledgeCells.map((c) => ({
      id: c.id,
      name: c.name,
      timestampSec: c.timestampStart,
    })),
    schoolAlign: anchor?.school ? [anchor.school.split(/\s/)[0] ?? 'CMU'] : ['CMU'],
    examAlign: subject === 'toefl' ? ['TOEFL'] : subject === 'sat' ? ['SAT'] : subject === 'algo' ? ['USACO'] : [],
    wormholeValue: input.report.spatialFoldRate,
    recommendedSec: input.report.knowledgeCells[0]?.timestampStart ?? 0,
    summary: `同化自动入库 · ${input.report.primaryCategory} · 折叠率 ${Math.round(input.report.spatialFoldRate * 100)}%`,
  };

  const row = upsertCourseware(payload);
  return {
    ingested: true,
    coursewareId: row.id,
    qualityGrade: grade,
    reason: grade === 'B' ? '质量 B 级已入库，待人工复核可升 A' : `质量 ${grade} 级，已写入课件库供匹配`,
  };
}
