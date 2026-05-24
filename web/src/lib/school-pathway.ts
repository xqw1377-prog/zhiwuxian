/** 与后端 `src/services/school-pathway.ts` 对齐（前端展示与航标编码） */
export type SchoolPathway = 'domestic_cn' | 'us_intl' | 'generic' | 'k12_stage';

export const PATHWAY_LABEL: Record<SchoolPathway, string> = {
  domestic_cn: '国内高考/强基/竞赛路径',
  us_intl: '美本/国际标化路径',
  generic: '综合升学路径',
  k12_stage: '校内成长路径（小学/初中·暂无大学目标）',
};

export type K12GoalType = 'school_top' | 'subject_boost';

function hasExplicitCollegeDreamSchool(school: string): boolean {
  const s = school.trim();
  if (!s || /校内成长|暂无大学|还没想好大学/.test(s)) return false;
  return (
    /大学|学院|University|College/i.test(s) ||
    /\b(CMU|MIT|Stanford|Harvard|Berkeley)\b/i.test(s) ||
    /清华|北大|复旦|上交|浙大|中科大|人大|南大|武大|哈工大|西交|港大|港科大|卡内基|卡梅/.test(s)
  );
}

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
    d.getMonth() >= 1 && d.getMonth() <= 6 ? `${d.getFullYear()}-07` : `${d.getFullYear() + 1}-01`;
  return {
    school,
    major,
    targetApplyAt: (input.targetApplyAt ?? defaultApply).trim() || defaultApply,
  };
}

export function inferTargetSchoolRegion(school: string): string {
  const s = school.trim();
  if (!s) return '';
  if (/清华|北大|人大|北航|北理|北师大|北京/.test(s)) return '北京';
  if (/复旦|上交|同济|华东师范|上海/.test(s)) return '上海';
  if (/浙大|西湖/.test(s)) return '浙江杭州';
  if (/南大|东南|南京/.test(s)) return '江苏南京';
  if (/武大|华中科|华科|武汉/.test(s)) return '湖北武汉';
  if (/中山|华南|广州|深大/.test(s)) return '广东广州';
  if (/厦大|福州/.test(s)) return '福建厦门';
  if (/哈工大|哈尔滨/.test(s)) return '黑龙江哈尔滨';
  if (/西交|西安|西北/.test(s)) return '陕西西安';
  if (/成电|川大|成都/.test(s)) return '四川成都';
  if (/中南|湖大|湖南大学|长沙|湖南师大|湘潭/.test(s)) return '湖南长沙';
  return '';
}

export function detectSchoolPathway(
  school: string,
  major = '',
  ctx: { currentGrade?: string; currentSchool?: string; currentRegion?: string; targetSchoolRegion?: string } = {},
): SchoolPathway {
  if (isK12StageAnchor(school, major, ctx.currentGrade ?? '')) return 'k12_stage';
  const s = `${school} ${major}`.trim().toLowerCase();
  if (
    /清华|北大|复旦|上交|浙大|中科大|tsinghua|peking|fudan|sjtu|zju|ustc/.test(s) ||
    (/大学|学院/.test(school.trim()) &&
      !/美|英|澳|加|stanford|mit|cmu|harvard|college|university\s+of|berkeley/.test(s))
  ) {
    return 'domestic_cn';
  }
  if (/cmu|carnegie|mit|stanford|harvard|美本|common\s*app|ivy|ucla|nyu/.test(s)) return 'us_intl';
  return 'generic';
}
