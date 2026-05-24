import { describe, it, expect } from 'vitest';
import { inferCurriculumTrack } from '../src/services/learner-profile';
import { isAssessmentRequest, inferAssessmentSubjectId } from '../src/services/zhi-chat-intent';

describe('inferCurriculumTrack', () => {
  it('湖南高二 + 国内梦校 → 高考轨', () => {
    expect(
      inferCurriculumTrack('domestic_cn', {
        school: '清华大学',
        major: '计算机',
        currentGrade: '高二',
        currentRegion: '湖南长沙',
        currentSchool: '长郡中学',
      }),
    ).toBe('cn_gaokao');
  });

  it('湖南 + 国际部 → 国际课程轨', () => {
    expect(
      inferCurriculumTrack('domestic_cn', {
        school: '香港大学',
        major: '工程',
        currentGrade: '高二',
        currentRegion: '湖南',
        currentSchool: '长沙某外国语学校国际部',
      }),
    ).toBe('intl_ib_ap');
  });

  it('美本梦校 → 标化轨', () => {
    expect(
      inferCurriculumTrack('us_intl', {
        school: 'CMU',
        major: 'CS',
        currentRegion: '广东深圳',
      }),
    ).toBe('intl_us_uk');
  });
});

describe('zhi-chat-intent', () => {
  it('识别评估请求', () => {
    expect(isAssessmentRequest('帮我做一次能力评估')).toBe(true);
    expect(isAssessmentRequest('今天天气不错')).toBe(false);
  });

  it('从话术推断科目', () => {
    expect(inferAssessmentSubjectId('我想摸底数学函数', 'cn_gaokao')).toBe('math');
    expect(inferAssessmentSubjectId('托福口语练得不好', 'intl_us_uk')).toBe('toefl');
  });
});
