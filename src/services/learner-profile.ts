/**
 * 学习者画像：地区 · 年级 · 课程轨（高考 / 国际课程 / 标化）
 * 供 ZHI 对话、主动议程、评估出卷统一引用
 */

import { getSchoolAnchorProfile } from '../db/zhi-cloud-schema';
import {
  detectSchoolPathway,
  PATHWAY_LABEL,
  type AnchorGeoContext,
  type SchoolPathway,
} from './school-pathway';

export type CurriculumTrack =
  | 'cn_gaokao'
  | 'intl_ib_ap'
  | 'intl_us_uk'
  | 'k12_stage'
  | 'undetermined';

export type LearnerProfile = {
  pathway: SchoolPathway;
  pathwayLabel: string;
  curriculumTrack: CurriculumTrack;
  curriculumLabel: string;
  provinceOrRegion: string | null;
  gradeBand: string;
  currentSchool: string;
  usesGaokaoCurriculum: boolean;
  assessmentFormats: string[];
  textbookGuidance: string;
  zhiDialogueRules: string[];
};

function extractProvince(region: string): string | null {
  const r = region.trim();
  if (!r) return null;
  const m = r.match(
    /(北京|上海|天津|重庆|湖南|湖北|广东|浙江|江苏|山东|四川|河南|河北|陕西|福建|安徽|辽宁|吉林|黑龙江|内蒙古|广西|云南|贵州|甘肃|海南|宁夏|青海|西藏|新疆|香港|澳门|台湾)/,
  );
  return m?.[1] ?? null;
}

function isIntlSchool(school: string): boolean {
  return /国际|外国语|双语|美高|ap\s*班|ib\s*班|外籍|留学预备|海外|国际部/.test(school.trim());
}

function isIntlRegion(region: string): boolean {
  return /美国|英国|加拿大|澳洲|澳大利亚|新加坡|日本|韩国|欧洲|纽约|加州|伦敦|温哥华|悉尼|美高|海外/.test(
    region.trim(),
  );
}

export function inferCurriculumTrack(
  pathway: SchoolPathway,
  ctx: AnchorGeoContext & { school?: string; major?: string },
): CurriculumTrack {
  if (pathway === 'k12_stage') return 'k12_stage';
  const school = (ctx.school ?? '').trim();
  const intlSchool = isIntlSchool(ctx.currentSchool ?? '');
  const intlRegion = isIntlRegion(ctx.currentRegion ?? '');
  if (intlSchool || intlRegion) {
    if (/英国|牛津|剑桥|A\s*Level|alevel|GCE/i.test(`${school} ${ctx.major ?? ''}`)) return 'intl_us_uk';
    if (
      /AP|IB|国际课程|双语|A-Level|国际部|外国语/i.test(
        `${school} ${ctx.currentSchool ?? ''} ${ctx.major ?? ''}`,
      )
    ) {
      return 'intl_ib_ap';
    }
    return 'intl_us_uk';
  }
  if (pathway === 'us_intl') return 'intl_us_uk';
  if (pathway === 'domestic_cn') return 'cn_gaokao';
  return 'undetermined';
}

const CURRICULUM_LABEL: Record<CurriculumTrack, string> = {
  cn_gaokao: '国内高考/新课标（含省卷）',
  intl_ib_ap: '国际课程（AP/IB/A-Level 等，默认非高考教材）',
  intl_us_uk: '美本/英本标化与申请轨',
  k12_stage: '校内成长（暂无大学目标）',
  undetermined: '待根据就读校与梦校补全后自动对齐',
};

function assessmentFormatsFor(track: CurriculumTrack, province: string | null): string[] {
  const prov = province ? `${province}卷` : '省卷/全国卷';
  switch (track) {
    case 'cn_gaokao':
      return [
        `${prov}·高二同步限时练（按新高考题型）`,
        '学考/合格考模拟（若年级适用）',
        '专题突破卷（函数/立体几何/电磁等）',
      ];
    case 'intl_ib_ap':
      return ['AP/IB 单元诊断卷', 'A-Level/IGCSE 章节测', '双语校期中模拟（非高考纲）'];
    case 'intl_us_uk':
      return ['托福/雅思切片（听说读写）', 'SAT/ACT 阅读或数学单节', 'AP 单科模考块'];
    case 'k12_stage':
      return ['单元卷/周测', '错题本变式', '单科限时练'];
    default:
      return ['分科掌握度快测', '今日知识点快测'];
  }
}

function textbookGuidanceFor(track: CurriculumTrack, province: string | null): string {
  if (track === 'cn_gaokao') {
    return province === '湖南'
      ? '默认对齐湖南新高考用书与省情题型；勿强行塞入未使用的全国甲卷/乙卷旧纲。'
      : '按就读省份与新高考选科组合对齐教材与题型；未确认省份前先问清再推荐书目。';
  }
  if (track === 'intl_ib_ap') {
    return '国际生：以 AP/IB/A-Level/校内 syllabus 为准，勿默认人教版高考总复习；可对接 Cambridge/Oxford/校历大纲。';
  }
  if (track === 'intl_us_uk') {
    return '标化轨：教材与练习以 TOEFL/IELTS/SAT/AP 官方或校内国际课程大纲为准。';
  }
  if (track === 'k12_stage') {
    return '校内成长：跟年级教材与单元进度，不涉及大学申请标化。';
  }
  return '补全现就读学校与所在地后，再推荐具体教材与练习来源。';
}

function dialogueRulesFor(track: CurriculumTrack, grade: string): string[] {
  const base = [
    '先根据快照中的地区、年级、课程轨回应；不要假设学生一定走中国高考。',
    '学生明确要「评估/摸底/模考」时，应说明将按课程轨生成对口的短试卷（非一律高考卷）。',
  ];
  if (track === 'cn_gaokao') {
    return [
      ...base,
      `当前按国内高考/新课标对话（${grade || '年级待定'}）；可谈选科、省卷差异、学考与竞赛节点。`,
      '禁止对明确国内梦校学生主推托福/SAT/AP 作为主战役（除非学生自述国际部/双轨）。',
    ];
  }
  if (track === 'intl_ib_ap' || track === 'intl_us_uk') {
    return [
      ...base,
      '当前按国际课程/标化轨对话；勿布置中国高考总复习卷或「人教版全套」作为默认作业。',
      '若学生说没有高考教材，应认可并改推 AP/IB/A-Level/标化诊断卷。',
    ];
  }
  return base;
}

export function buildLearnerProfile(userId: string): LearnerProfile | null {
  const anchor = getSchoolAnchorProfile(userId.trim());
  if (!anchor?.school?.trim()) return null;

  const ctx: AnchorGeoContext & { school: string; major: string } = {
    school: anchor.school,
    major: anchor.major,
    currentSchool: anchor.currentSchool,
    currentRegion: anchor.currentRegion,
    targetSchoolRegion: anchor.targetSchoolRegion,
    currentGrade: anchor.currentGrade,
  };
  const pathway = detectSchoolPathway(anchor.school, anchor.major, ctx);
  const curriculumTrack = inferCurriculumTrack(pathway, ctx);
  const provinceOrRegion =
    extractProvince(anchor.currentRegion) ??
    extractProvince(anchor.targetSchoolRegion) ??
    null;

  return {
    pathway,
    pathwayLabel: PATHWAY_LABEL[pathway],
    curriculumTrack,
    curriculumLabel: CURRICULUM_LABEL[curriculumTrack],
    provinceOrRegion,
    gradeBand: anchor.currentGrade?.trim() || '待定',
    currentSchool: anchor.currentSchool?.trim() || '待定',
    usesGaokaoCurriculum: curriculumTrack === 'cn_gaokao',
    assessmentFormats: assessmentFormatsFor(curriculumTrack, provinceOrRegion),
    textbookGuidance: textbookGuidanceFor(curriculumTrack, provinceOrRegion),
    zhiDialogueRules: dialogueRulesFor(curriculumTrack, anchor.currentGrade),
  };
}

export function formatLearnerProfileBlock(profile: LearnerProfile): string {
  const lines = [
    `课程轨：${profile.curriculumLabel}`,
    `升学路径：${profile.pathwayLabel}`,
    `年级：${profile.gradeBand}`,
    profile.provinceOrRegion ? `就读省份/地区：${profile.provinceOrRegion}` : '就读省份/地区：待补全',
    `现就读：${profile.currentSchool}`,
    `教材与练习：${profile.textbookGuidance}`,
    `可用评估形式：${profile.assessmentFormats.join('；')}`,
    '对话规则：',
    ...profile.zhiDialogueRules.map((r) => `  · ${r}`),
  ];
  return lines.join('\n');
}
