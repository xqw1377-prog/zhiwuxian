import { describe, it, expect } from 'vitest';
import {
  buildK12AnchorFields,
  detectSchoolPathway,
  inferTargetSchoolRegion,
  normalizeAnchorMajorName,
  normalizeAnchorSchoolName,
  directoryTitleAllowedForPathway,
  filterMetricsForPathway,
  isK12StageAnchor,
  isUsIntlDirectoryTitle,
  mergeMetricsForPathway,
  parseK12FocusSubject,
  pinnedSuffixesForPathway,
  pinnedSuffixesToDrop,
} from '../src/services/school-pathway';

describe('detectSchoolPathway', () => {
  it('识别清华为国内路径', () => {
    expect(detectSchoolPathway('清华大学', '计算机')).toBe('domestic_cn');
  });

  it('清华可推断目标院校所在地为北京', () => {
    expect(inferTargetSchoolRegion('清华大学')).toBe('北京');
  });

  it('中国清华大学归一化后仍为国内路径', () => {
    expect(normalizeAnchorSchoolName('中国清华大学')).toBe('清华大学');
    expect(detectSchoolPathway('中国清华大学', '计算机专业')).toBe('domestic_cn');
    expect(normalizeAnchorMajorName('计算机专业')).toBe('计算机');
  });

  it('国内路径隐藏托福/SAT/Common App 目录标题', () => {
    expect(isUsIntlDirectoryTitle('Common App 主文书')).toBe(true);
    expect(directoryTitleAllowedForPathway('🗣️ 托福多模态语言战舱', 'domestic_cn')).toBe(false);
    expect(directoryTitleAllowedForPathway('📐 数学 · 高考/竞赛主线', 'domestic_cn')).toBe(true);
  });

  it('识别 CMU 为美本路径', () => {
    expect(detectSchoolPathway('Carnegie Mellon University', 'CS')).toBe('us_intl');
  });

  it('国内所在地倾向 domestic_cn', () => {
    expect(
      detectSchoolPathway('某大学', '工科', {
        currentRegion: '北京',
        currentSchool: '人大附中',
        targetSchoolRegion: '北京',
      }),
    ).toBe('domestic_cn');
  });

  it('国际部倾向 us_intl', () => {
    expect(
      detectSchoolPathway('MIT', 'Engineering', {
        currentSchool: '深圳某外国语学校国际部',
        currentRegion: '广东',
      }),
    ).toBe('us_intl');
  });

  it('小学五年级 + 全校第一 → k12_stage', () => {
    expect(
      detectSchoolPathway('校内成长目标', '全校第一名', { currentGrade: '小学五年级' }),
    ).toBe('k12_stage');
  });

  it('单科提升·数学 → k12_stage 并解析科目', () => {
    expect(detectSchoolPathway('校内成长目标', '单科提升·数学')).toBe('k12_stage');
    expect(parseK12FocusSubject('单科提升·数学')).toBe('数学');
  });
});

describe('k12 anchor helpers', () => {
  it('buildK12AnchorFields 全校第一', () => {
    const f = buildK12AnchorFields({ goalType: 'school_top' });
    expect(f.school).toBe('校内成长目标');
    expect(f.major).toBe('全校第一名');
  });

  it('isK12StageAnchor 按年级识别', () => {
    expect(isK12StageAnchor('某小学', '', '小学四年级')).toBe(true);
    expect(isK12StageAnchor('清华大学', '计算机', '高三')).toBe(false);
  });

  it('已填大学梦校时初中年级不判为 k12', () => {
    expect(isK12StageAnchor('清华大学', '计算机', '初二')).toBe(false);
    expect(isK12StageAnchor('校内成长目标', '全校第一名', '初二')).toBe(true);
  });
});

describe('filterMetricsForPathway', () => {
  it('国内路径剔除托福/SAT', () => {
    const out = filterMetricsForPathway(
      { 托福: '110', 数学: '140', SAT: '1500', 高考总分: '690+' },
      'domestic_cn',
    );
    expect(out).toHaveProperty('数学');
    expect(out).toHaveProperty('高考总分');
    expect(out).not.toHaveProperty('托福');
    expect(out).not.toHaveProperty('SAT');
  });

  it('美本路径保留托福', () => {
    const out = filterMetricsForPathway({ 托福: '110', 高考总分: '690+' }, 'us_intl');
    expect(out).toHaveProperty('托福');
    expect(out).not.toHaveProperty('高考总分');
  });
});

describe('mergeMetricsForPathway', () => {
  it('合并后仍按路径过滤', () => {
    const merged = mergeMetricsForPathway(
      { 托福: '102+', 数学: '竞赛省一' },
      { SAT: '1520' },
      'domestic_cn',
    );
    expect(merged).toHaveProperty('数学');
    expect(merged).not.toHaveProperty('托福');
    expect(merged).not.toHaveProperty('SAT');
  });
});

describe('pinnedSuffixesForPathway', () => {
  it('国内路径 PINNED 含高考数学', () => {
    expect(pinnedSuffixesForPathway('domestic_cn')).toContain('DIR_GAOKAO_MATH');
    expect(pinnedSuffixesToDrop('domestic_cn')).toContain('DIR_TOEFL');
  });

  it('美本路径 PINNED 含托福', () => {
    expect(pinnedSuffixesForPathway('us_intl')).toContain('DIR_TOEFL');
    expect(pinnedSuffixesToDrop('us_intl')).toContain('DIR_GAOKAO_MATH');
  });

  it('k12 路径 PINNED 为校内目录，丢弃托福与高考', () => {
    expect(pinnedSuffixesForPathway('k12_stage')).toContain('DIR_K12_GOAL');
    expect(pinnedSuffixesToDrop('k12_stage')).toContain('DIR_TOEFL');
    expect(pinnedSuffixesToDrop('k12_stage')).toContain('DIR_GAOKAO_MATH');
  });
});

describe('directoryTitleAllowedForPathway k12', () => {
  it('k12 隐藏托福与高考目录', () => {
    expect(directoryTitleAllowedForPathway('🗣️ 托福多模态语言战舱', 'k12_stage')).toBe(false);
    expect(directoryTitleAllowedForPathway('📐 数学 · 高考/竞赛主线', 'k12_stage')).toBe(false);
    expect(directoryTitleAllowedForPathway('🏫 校内目标 · 排名与习惯', 'k12_stage')).toBe(true);
  });
});
