/**
 * 梦校路径识别 · 左侧 PINNED 目录 / 云目录节点 / 分科进度条 对齐
 */

import type { DirectoryType } from '../db/directory-schema';
import type { ZhiNodeType } from '../db/zhi-cloud-schema';

export type SchoolPathway = 'domestic_cn' | 'us_intl' | 'generic' | 'k12_stage';

export const PATHWAY_LABEL: Record<SchoolPathway, string> = {
  domestic_cn: '国内高考/强基/竞赛路径',
  us_intl: '美本/国际标化路径',
  generic: '综合升学路径',
  k12_stage: '校内成长路径（小学/初中·暂无大学目标）',
};

/** 梦校航标扩展上下文（现就读与地理） */
export type AnchorGeoContext = {
  currentSchool?: string;
  currentRegion?: string;
  targetSchoolRegion?: string;
  currentGrade?: string;
};

/** 梦校字段已写明大学/学院等，不应因年级误判为「还没想好大学」 */
function hasExplicitCollegeDreamSchool(school: string): boolean {
  const s = school.trim();
  if (!s || /校内成长|暂无大学|还没想好大学/.test(s)) return false;
  return (
    /大学|学院|University|College/i.test(s) ||
    /\b(CMU|MIT|Stanford|Harvard|Berkeley)\b/i.test(s) ||
    /清华|北大|复旦|上交|浙大|中科大|人大|南大|武大|哈工大|西交|港大|港科大|卡内基|卡梅/.test(s)
  );
}

/** 小学/初中阶段或「暂无大学目标、校内排名/单科提分」 */
export function isK12StageAnchor(school: string, major: string, grade = ''): boolean {
  const s = school.trim();
  if (s === '校内成长目标') return true;
  const blob = `${s} ${major}`;
  if (/暂无大学|还没想好大学|校内成长|校内目标|全校第一|全班第一|年级前|年级第|单科.*提分|单科提升|提高.*科|先把.*科/.test(blob)) {
    return true;
  }
  if (/^单科[·:]/.test(major.trim())) return true;
  if (hasExplicitCollegeDreamSchool(s)) return false;
  const g = grade.trim();
  if (/小学|一年级|二年级|三年级|四年级|五年级|六年级|初一|初二|初三/.test(g)) return true;
  if (/^[一二三四五六]年级/.test(g)) return true;
  return false;
}

export type K12GoalType = 'school_top' | 'subject_boost';

/** 前端「校内成长」唤醒时写入航标的规范字段 */
export function buildK12AnchorFields(input: {
  goalType: K12GoalType;
  focusSubject?: string;
  targetApplyAt?: string;
}): { school: string; major: string; targetApplyAt: string } {
  const school = '校内成长目标';
  const major =
    input.goalType === 'school_top'
      ? '全校第一名'
      : `单科提升·${(input.focusSubject ?? '数学').trim() || '数学'}`;
  const d = new Date();
  const defaultApply =
    d.getMonth() >= 1 && d.getMonth() <= 6
      ? `${d.getFullYear()}-07`
      : `${d.getFullYear() + 1}-01`;
  return {
    school,
    major,
    targetApplyAt: (input.targetApplyAt ?? defaultApply).trim() || defaultApply,
  };
}

export function parseK12FocusSubject(major: string): string | null {
  const m = major.trim();
  const m1 = m.match(/单科[·:]\s*([^\s+]+)/);
  if (m1?.[1]) return m1[1].trim();
  const m2 = m.match(/(数学|语文|英语|科学|物理|化学|生物|历史|地理)/);
  return m2?.[1] ?? null;
}

const US_METRIC_KEY = /^(toefl|sat|gre|gmat|act|ap|gpa|common\s*app|文书|essay)$/i;
const US_METRIC_LABEL = /托福|雅思|SAT|GRE|GPA|AP\s|Common\s*App|美本标化/i;
const DOMESTIC_METRIC_KEY = /^(高考|gaokao|数学|物理|化学|英语|语文|信息|csp|noi|oi|竞赛|强基|综评)/i;

const US_PINNED_SUFFIXES = [
  'DIR_GOAL_CMU',
  'DIR_AP_CALC',
  'DIR_AP_CALC_ERR',
  'DIR_AP_PHYS',
  'DIR_AP_PHYS_ERR',
  'DIR_TOEFL',
  'DIR_TOEFL_ERR',
] as const;

const K12_PINNED_SUFFIXES = [
  'DIR_K12_GOAL',
  'DIR_K12_FOCUS',
  'DIR_K12_FOCUS_ERR',
  'DIR_K12_WEEKLY',
] as const;

const DOMESTIC_PINNED_SUFFIXES = [
  'DIR_GAOKAO_MATH',
  'DIR_GAOKAO_MATH_ERR',
  'DIR_GAOKAO_PHYS',
  'DIR_GAOKAO_PHYS_ERR',
  'DIR_OI_CSP',
  'DIR_GAOKAO_EN',
] as const;

function isDomesticRegion(region: string): boolean {
  const r = region.trim();
  if (!r) return false;
  return /中国|大陆|内地|北京|上海|天津|重庆|广东|浙江|江苏|山东|四川|湖北|湖南|河南|河北|陕西|福建|安徽|辽宁|吉林|黑龙江|内蒙古|广西|云南|贵州|甘肃|海南|宁夏|青海|西藏|新疆|香港|澳门|台湾/.test(
    r,
  );
}

function isIntlRegion(region: string): boolean {
  const r = region.trim();
  if (!r) return false;
  return /美国|英国|加拿大|澳洲|澳大利亚|新加坡|日本|韩国|欧洲|纽约|加州|伦敦|温哥华|悉尼|美高|海外/.test(r);
}

function isIntlCurrentSchool(school: string): boolean {
  return /国际|外国语|双语|美高|ap\s*班|ib\s*班|外籍|留学预备|海外/.test(school.trim());
}

/** 按梦校名称推断目标院校所在地（表单未填时用于国内路径默认） */
export function inferTargetSchoolRegion(school: string): string {
  const s = school.trim();
  if (!s) return '';
  if (/清华|北大|人大|北航|北理|北师大|中央民族|中国传媒|对外经贸|北京/.test(s)) return '北京';
  if (/复旦|上交|同济|华东师范|上海大学|上海/.test(s)) return '上海';
  if (/浙大|西湖大学/.test(s)) return '浙江杭州';
  if (/南大|东南|南航|南京/.test(s)) return '江苏南京';
  if (/武大|华中科|华科|武汉/.test(s)) return '湖北武汉';
  if (/中山|华南理工|深大|广州|港中深/.test(s)) return '广东广州';
  if (/厦大|福州大学/.test(s)) return '福建厦门';
  if (/哈工大|哈尔滨/.test(s)) return '黑龙江哈尔滨';
  if (/西交|西安|西北工业|西北大学/.test(s)) return '陕西西安';
  if (/成电|川大|西南|成都/.test(s)) return '四川成都';
  if (/中南|湖大|湖南大学|长沙|湖南师大|湘潭/.test(s)) return '湖南长沙';
  if (/港大|港科大|港中文|香港/.test(s)) return '中国香港';
  if (/台大|台湾/.test(s)) return '中国台湾';
  return '';
}

export type AnchorProfileInput = {
  userId: string;
  school: string;
  major: string;
  currentGrade: string;
  targetApplyAt: string;
  currentSchool?: string;
  currentRegion?: string;
  targetSchoolRegion?: string;
};

/** 唤醒/保存航标前补全地理字段，避免仅填梦校却无法通过校验或侧栏仍走美本轨 */
/** 去掉「中国」前缀、「专业」后缀，避免同一梦校生成多套 DIR_GOAL_* */
export function normalizeAnchorSchoolName(school: string): string {
  return school.trim().replace(/^中国/, '').trim() || school.trim();
}

export function normalizeAnchorMajorName(major: string): string {
  const m = major.trim();
  return m.replace(/专业$/u, '').trim() || m;
}

export function normalizeAnchorProfileInput(input: AnchorProfileInput): Required<
  Pick<AnchorProfileInput, 'userId' | 'school' | 'major' | 'currentGrade' | 'targetApplyAt'>
> &
  Pick<AnchorProfileInput, 'currentSchool' | 'currentRegion' | 'targetSchoolRegion'> {
  const school = normalizeAnchorSchoolName(input.school);
  const major = normalizeAnchorMajorName(input.major);
  const currentGrade = input.currentGrade.trim();
  const targetApplyAt = input.targetApplyAt.trim();
  const ctx: AnchorGeoContext = {
    currentSchool: input.currentSchool,
    currentRegion: input.currentRegion,
    targetSchoolRegion: input.targetSchoolRegion,
    currentGrade,
  };
  const pathway = detectSchoolPathway(school, major, ctx);
  let targetSchoolRegion = (input.targetSchoolRegion ?? '').trim();
  if (!targetSchoolRegion && pathway === 'domestic_cn') {
    targetSchoolRegion = inferTargetSchoolRegion(school);
  }
  if (!targetSchoolRegion && pathway === 'us_intl') {
    targetSchoolRegion = /英国|牛津|剑桥|帝国|UCL|LSE|爱丁堡/i.test(school) ? '英国' : '美国';
  }
  const currentSchool = (input.currentSchool ?? '').trim() || '待定';
  const currentRegion = (input.currentRegion ?? '').trim() || '待定';
  return {
    userId: input.userId.trim(),
    school,
    major,
    currentGrade,
    targetApplyAt,
    currentSchool,
    currentRegion,
    targetSchoolRegion,
  };
}

export function detectSchoolPathway(
  school: string,
  major = '',
  ctx: AnchorGeoContext = {},
): SchoolPathway {
  const schoolNorm = normalizeAnchorSchoolName(school);
  const majorNorm = normalizeAnchorMajorName(major);
  if (isK12StageAnchor(schoolNorm, majorNorm, ctx.currentGrade ?? '')) return 'k12_stage';

  const s = `${schoolNorm} ${majorNorm}`.trim().toLowerCase();
  const targetDomestic =
    /清华|北大|复旦|上交|浙大|中科大|南大|人大|同济|华科|武大|中山|厦大|哈工大|西交|东南|北航|北理|成电|tsinghua|peking|fudan|sjtu|zju|ustc|nju|ruc|tongji|hust|sysu|xmu|hit|xjtu|seu|buaa|bit|uestc/.test(
      s,
    )
    || (/大学|学院/.test(schoolNorm)
      && !/美|英|澳|加|stanford|mit|cmu|harvard|yale|cornell|ivy|college|university\s+of|berkeley|caltech/.test(schoolNorm));
  const targetUs =
    /cmu|carnegie|mit|stanford|harvard|yale|cornell|berkeley|caltech|princeton|columbia|upenn|duke|brown|dartmouth|美本|美高|common\s*app|ivy|加州大学|纽约大学|nyu|ucla|usc/.test(
      s,
    );

  if (targetDomestic) return 'domestic_cn';
  if (targetUs) return 'us_intl';

  const cnUniversity =
    /大学|学院|清华|北大|复旦|上交|浙大|中科大|南大|人大|同济|华科|武大|中山|厦大|哈工大|西交|东南|北航|北理|成电/.test(
      schoolNorm,
    ) && !/美|英|澳|加|Stanford|MIT|CMU|Harvard|Yale|Cornell|Berkeley|Caltech|College/i.test(schoolNorm);
  if (cnUniversity) return 'domestic_cn';

  if (isDomesticRegion(ctx.targetSchoolRegion ?? '') || isDomesticRegion(ctx.currentRegion ?? '')) {
    if (!isIntlRegion(ctx.currentRegion ?? '') && !isIntlCurrentSchool(ctx.currentSchool ?? '')) {
      return 'domestic_cn';
    }
  }

  if (isIntlRegion(ctx.currentRegion ?? '') || isIntlCurrentSchool(ctx.currentSchool ?? '')) {
    return 'us_intl';
  }

  return 'generic';
}

/** 国内路径下剔除美本标化指标；美本路径下剔除纯高考键 */
export function filterMetricsForPathway(
  metrics: Record<string, unknown>,
  pathway: SchoolPathway,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metrics)) {
    if (v == null || String(v).trim() === '') continue;
    const key = k.trim();
    if (pathway === 'k12_stage') {
      if (US_METRIC_KEY.test(key) || US_METRIC_LABEL.test(key)) continue;
      if (/高考总分|强基|CSP|NOI|Common/i.test(key)) continue;
    } else if (pathway === 'domestic_cn') {
      if (US_METRIC_KEY.test(key) || US_METRIC_LABEL.test(key)) continue;
    } else if (pathway === 'us_intl') {
      if (DOMESTIC_METRIC_KEY.test(key) && !/英语|english/i.test(key)) continue;
    }
    out[key] = v;
  }
  return out;
}

export function mergeMetricsForPathway(
  intelMetrics: Record<string, string>,
  compiled: Record<string, unknown> | undefined,
  pathway: SchoolPathway,
): Record<string, unknown> {
  const base = { ...intelMetrics, ...(compiled ?? {}) };
  const filtered = filterMetricsForPathway(base, pathway);
  if (Object.keys(filtered).length > 0) return filtered;
  return filterMetricsForPathway(intelMetrics, pathway);
}

export function pinnedSuffixesForPathway(pathway: SchoolPathway): readonly string[] {
  if (pathway === 'k12_stage') return K12_PINNED_SUFFIXES;
  if (pathway === 'domestic_cn') return DOMESTIC_PINNED_SUFFIXES;
  if (pathway === 'us_intl') return US_PINNED_SUFFIXES;
  return [...US_PINNED_SUFFIXES, ...DOMESTIC_PINNED_SUFFIXES];
}

export function pinnedSuffixesToDrop(pathway: SchoolPathway): readonly string[] {
  if (pathway === 'k12_stage') return [...US_PINNED_SUFFIXES, ...DOMESTIC_PINNED_SUFFIXES];
  if (pathway === 'domestic_cn') return US_PINNED_SUFFIXES;
  if (pathway === 'us_intl') return DOMESTIC_PINNED_SUFFIXES;
  return [];
}

/** 侧栏目录标题是否属于美本/标化轨（国内路径下应隐藏） */
export function isUsIntlDirectoryTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  return (
    US_METRIC_LABEL.test(t) ||
    /Common\s*App|主文书|补充文书|托福|TOEFL|SAT\b|AP\s*微积分|AP\s*物理|AP\s*Calc|AP\s*CS|美本|CMU|Carnegie|Ivy|加州大学/i.test(
      t,
    )
  );
}

/** 侧栏目录是否应在当前升学路径下展示 */
export function directoryTitleAllowedForPathway(title: string, pathway: SchoolPathway): boolean {
  if (pathway === 'k12_stage') {
    return !isUsIntlDirectoryTitle(title) && !/高考\/竞赛|强基|CSP|信息学\/OI|AP\s|CMU/.test(title.trim());
  }
  if (pathway === 'domestic_cn') return !isUsIntlDirectoryTitle(title);
  if (pathway === 'us_intl') {
    return !/高考总分|强基\/综评|信息学\/OI · CSP|数学 · 高考\/竞赛主线/.test(title.trim());
  }
  return true;
}

export type PinnedDirTemplate = {
  suffix: string;
  title: string;
  type: DirectoryType;
  parentSuffix: string | null;
  displayOrder: number;
};

export function getPinnedDirectoryTemplates(pathway: SchoolPathway): PinnedDirTemplate[] {
  if (pathway === 'k12_stage') {
    return [
      {
        suffix: 'DIR_K12_GOAL',
        title: '🏫 校内目标 · 排名与习惯',
        type: 'STRATEGIC_GOAL',
        parentSuffix: null,
        displayOrder: 1,
      },
      {
        suffix: 'DIR_K12_FOCUS',
        title: '📐 主攻科目 · 单元攻坚',
        type: 'ACADEMIC_SUBJECT',
        parentSuffix: null,
        displayOrder: 2,
      },
      {
        suffix: 'DIR_K12_FOCUS_ERR',
        title: '└ 📓 错题与变式本',
        type: 'ERROR_BANK',
        parentSuffix: 'DIR_K12_FOCUS',
        displayOrder: 3,
      },
      {
        suffix: 'DIR_K12_WEEKLY',
        title: '📋 周测/单元卷归档',
        type: 'ACADEMIC_SUBJECT',
        parentSuffix: null,
        displayOrder: 4,
      },
    ];
  }

  if (pathway === 'domestic_cn') {
    return [
      {
        suffix: 'DIR_GAOKAO_MATH',
        title: '📐 数学 · 高考/竞赛主线',
        type: 'ACADEMIC_SUBJECT',
        parentSuffix: null,
        displayOrder: 2,
      },
      {
        suffix: 'DIR_GAOKAO_MATH_ERR',
        title: '└ 📓 数学错题与变式本',
        type: 'ERROR_BANK',
        parentSuffix: 'DIR_GAOKAO_MATH',
        displayOrder: 3,
      },
      {
        suffix: 'DIR_GAOKAO_PHYS',
        title: '⚡ 物理 · 力学与电磁',
        type: 'ACADEMIC_SUBJECT',
        parentSuffix: null,
        displayOrder: 4,
      },
      {
        suffix: 'DIR_GAOKAO_PHYS_ERR',
        title: '└ 📓 物理模型与计算错题本',
        type: 'ERROR_BANK',
        parentSuffix: 'DIR_GAOKAO_PHYS',
        displayOrder: 5,
      },
      {
        suffix: 'DIR_OI_CSP',
        title: '💻 信息学 / CSP · 竞赛轨',
        type: 'ACADEMIC_SUBJECT',
        parentSuffix: null,
        displayOrder: 6,
      },
      {
        suffix: 'DIR_GAOKAO_EN',
        title: '📖 语文 · 英语 · 综合素养',
        type: 'ACADEMIC_SUBJECT',
        parentSuffix: null,
        displayOrder: 7,
      },
    ];
  }

  return [
    {
      suffix: 'DIR_GOAL_CMU',
      title: '🎯 目标学校：CMU 计算机系进度',
      type: 'STRATEGIC_GOAL',
      parentSuffix: null,
      displayOrder: 1,
    },
    {
      suffix: 'DIR_AP_CALC',
      title: '⚛️ AP 微积分 BC 战线',
      type: 'ACADEMIC_SUBJECT',
      parentSuffix: null,
      displayOrder: 2,
    },
    {
      suffix: 'DIR_AP_CALC_ERR',
      title: '└ 📓 微积分铁血错题本',
      type: 'ERROR_BANK',
      parentSuffix: 'DIR_AP_CALC',
      displayOrder: 3,
    },
    {
      suffix: 'DIR_AP_PHYS',
      title: '⚡ AP 物理 C 电磁学',
      type: 'ACADEMIC_SUBJECT',
      parentSuffix: null,
      displayOrder: 4,
    },
    {
      suffix: 'DIR_AP_PHYS_ERR',
      title: '└ 📓 物理电磁因果断层本',
      type: 'ERROR_BANK',
      parentSuffix: 'DIR_AP_PHYS',
      displayOrder: 5,
    },
    {
      suffix: 'DIR_TOEFL',
      title: '🗣️ 托福多模态语言战舱',
      type: 'ACADEMIC_SUBJECT',
      parentSuffix: null,
      displayOrder: 6,
    },
    {
      suffix: 'DIR_TOEFL_ERR',
      title: '└ 🎙️ 口语/写作流速清算本',
      type: 'ERROR_BANK',
      parentSuffix: 'DIR_TOEFL',
      displayOrder: 7,
    },
  ];
}

export function getDefaultCloudNodes(
  school: string,
  major: string,
  pathway: SchoolPathway,
): Array<{ name: string; type: ZhiNodeType }> {
  if (pathway === 'k12_stage') {
    const focus = parseK12FocusSubject(major) ?? '主攻科目';
    return [
      { name: `🎯 校内目标：${major}`, type: 'STRATEGY' },
      { name: `📐 ${focus} · 单元与练习`, type: 'MATERIAL' },
      { name: '└ 📓 错题本', type: 'ERROR_BANK' },
      { name: '📋 周测/单元卷证据', type: 'MATERIAL' },
      { name: '📒 课堂笔记与习惯打卡', type: 'MATERIAL' },
    ];
  }

  if (pathway === 'domestic_cn') {
    return [
      { name: `🎯 ${school} ${major} 核心战略轨道`, type: 'STRATEGY' },
      { name: '📐 数学 · 高考/竞赛对齐', type: 'MATERIAL' },
      { name: '⚡ 物理 · 力学与电磁', type: 'MATERIAL' },
      { name: '💻 信息学/OI · CSP 竞赛轨', type: 'ERROR_BANK' },
      { name: '📖 语文 · 阅读与写作', type: 'MATERIAL' },
      { name: '📂 强基/综评/竞赛材料清算', type: 'MATERIAL' },
    ];
  }

  return [
    { name: `🎯 ${school} ${major} 核心战略轨道`, type: 'STRATEGY' },
    { name: '✍️ Common App 主文书舱', type: 'ESSAY_ESSENTIAL' },
    { name: '📓 学术对齐 · 物理/微积分错题熔炉', type: 'ERROR_BANK' },
    { name: '📂 申请材料与作品集清算', type: 'MATERIAL' },
  ];
}

export type SubjectBlueprint = {
  id: string;
  name: string;
  target: number;
  unit: string;
  displayTarget: string;
  chaptersTotal?: number;
  metricKeys: string[];
};

export function getSubjectTrackBlueprint(pathway: SchoolPathway): SubjectBlueprint[] {
  if (pathway === 'k12_stage') {
    return [
      {
        id: 'rank',
        name: '校内名次',
        target: 1,
        unit: '名',
        displayTarget: '第1名',
        metricKeys: ['名次', '排名', '全班', '年级'],
      },
      {
        id: 'math',
        name: '数学',
        target: 100,
        unit: '分',
        displayTarget: '满分',
        metricKeys: ['数学', 'Math'],
      },
      {
        id: 'chinese',
        name: '语文',
        target: 100,
        unit: '分',
        displayTarget: '满分',
        metricKeys: ['语文', '作文'],
      },
      {
        id: 'english',
        name: '英语',
        target: 100,
        unit: '分',
        displayTarget: '满分',
        metricKeys: ['英语', 'English'],
      },
      {
        id: 'science',
        name: '科学/综合',
        target: 100,
        unit: '分',
        displayTarget: '优秀',
        metricKeys: ['科学', '综合'],
      },
    ];
  }

  if (pathway === 'domestic_cn') {
    return [
      { id: 'gaokao', name: '高考总分', target: 690, unit: '分', displayTarget: '690+', metricKeys: ['高考', 'Gaokao', '总分'] },
      { id: 'math', name: '数学', target: 145, unit: '分', displayTarget: '145+', chaptersTotal: 4, metricKeys: ['数学', 'Math'] },
      { id: 'physics', name: '物理', target: 90, unit: '分', displayTarget: '90+', metricKeys: ['物理', 'Physics'] },
      { id: 'english', name: '英语', target: 140, unit: '分', displayTarget: '140+', metricKeys: ['英语', 'English', 'EN'] },
      { id: 'oi', name: '信息学/CSP', target: 100, unit: '级', displayTarget: '省一+/CSP-S', metricKeys: ['CSP', 'NOI', 'OI', '信息学'] },
      { id: 'comp', name: '竞赛/强基', target: 100, unit: '%', displayTarget: '有硬核成果', metricKeys: ['竞赛', '强基', '综评'] },
    ];
  }

  if (pathway === 'generic') {
    return [
      { id: 'math', name: '数学', target: 145, unit: '分', displayTarget: '145+', metricKeys: ['数学', 'Math'] },
      { id: 'physics', name: '物理', target: 90, unit: '分', displayTarget: '90+', metricKeys: ['物理', 'Physics'] },
      { id: 'english', name: '英语', target: 140, unit: '分', displayTarget: '140+', metricKeys: ['英语', 'English'] },
      { id: 'comp', name: '综合进展', target: 100, unit: '%', displayTarget: '可验证成果', metricKeys: ['竞赛', '综合'] },
    ];
  }

  return [
    { id: 'toefl', name: '托福', target: 102, unit: '分', displayTarget: '102+', chaptersTotal: 4, metricKeys: ['TOEFL', 'toefl', '托福'] },
    { id: 'sat', name: 'SAT', target: 1520, unit: '分', displayTarget: '1520+', metricKeys: ['SAT', 'sat'] },
    { id: 'gpa', name: 'GPA', target: 3.9, unit: '', displayTarget: '3.90', metricKeys: ['GPA', 'gpa'] },
    { id: 'ap', name: 'AP/课程', target: 5, unit: '门', displayTarget: '5', chaptersTotal: 5, metricKeys: ['AP', 'AP_Count'] },
    { id: 'algo', name: '算法/项目', target: 100, unit: '%', displayTarget: '可追问深度', metricKeys: ['USACO', 'CSP', '算法'] },
    { id: 'essay', name: '文书叙事', target: 100, unit: '%', displayTarget: '100', metricKeys: ['Essay', '文书'] },
  ];
}
