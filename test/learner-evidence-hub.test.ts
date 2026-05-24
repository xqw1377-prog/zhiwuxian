import { describe, expect, it } from 'vitest';
import { aggregateLearnerEvidence, weaknessesToPathUnits } from '../src/services/learner-evidence-hub';

describe('learner-evidence-hub', () => {
  it('无用户时返回空短板与补齐提示', () => {
    const pack = aggregateLearnerEvidence('test-no-anchor-user-xyz');
    expect(pack.weaknesses).toBeInstanceOf(Array);
    expect(pack.missingSignals.length).toBeGreaterThan(0);
    expect(pack.pushActions.length).toBeGreaterThan(0);
    expect(pack.dataCompletenessPct).toBeLessThan(50);
  });

  it('weaknessesToPathUnits 首项为待验收', () => {
    const units = weaknessesToPathUnits(
      [
        {
          id: 'w1',
          title: '函数与导数',
          subjectId: 'math',
          subjectName: '数学',
          severity: 85,
          sources: ['assessment'],
          evidence: '评估 52%',
          actionDue: '2026-05-25',
        },
      ],
      '2026-05-30',
    );
    expect(units[0]?.status).toBe('assessment_due');
    expect(units[0]?.requiresAssessment).toBe(true);
  });
});
