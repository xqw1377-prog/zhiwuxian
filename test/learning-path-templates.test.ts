import { describe, expect, it } from 'vitest';
import {
  buildCriticalDates,
  buildPhasesFromTemplates,
  resolvePhaseTemplates,
} from '../src/services/learning-path-templates';

describe('learning-path-templates', () => {
  it('湖南高二 domestic 含省情阶段与知识点种子', () => {
    const ctx = {
      pathway: 'domestic_cn' as const,
      curriculumTrack: 'cn_gaokao' as const,
      grade: '高二',
      province: '湖南',
      school: '清华大学',
      major: '计算机',
      targetApplyAt: '2027-09',
      daysRemaining: 500,
    };
    const templates = resolvePhaseTemplates(ctx);
    expect(templates.some((t) => t.code === 'P2_TOPIC_DRILL')).toBe(true);
    const phases = buildPhasesFromTemplates(ctx, { extraUnits: [], gapTitles: [] });
    expect(phases.length).toBeGreaterThanOrEqual(5);
    const p2 = phases.find((p) => p.id === 'P2_TOPIC_DRILL');
    expect(p2?.knowledgeUnits.some((u) => /函数|力学|阅读/.test(u.title))).toBe(true);
  });

  it('国际课程轨使用 I 系列阶段', () => {
    const ctx = {
      pathway: 'us_intl' as const,
      curriculumTrack: 'intl_ib_ap' as const,
      grade: '高二',
      province: '湖南',
      school: 'CMU',
      major: 'CS',
      targetApplyAt: '2027-09',
      daysRemaining: 400,
    };
    const templates = resolvePhaseTemplates(ctx);
    expect(templates[0]?.code).toBe('I0_DIAG');
  });

  it('生成关键考期', () => {
    const dates = buildCriticalDates({
      pathway: 'domestic_cn',
      curriculumTrack: 'cn_gaokao',
      grade: '高二',
      province: '湖南',
      school: '清华大学',
      major: '计算机',
      targetApplyAt: '2027-09',
      daysRemaining: 500,
    });
    expect(dates.some((d) => d.label.includes('高考') || d.label.includes('期末'))).toBe(true);
  });
});
