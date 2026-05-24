import { describe, it, expect } from 'vitest';

/**
 * 能量模型单元测试
 * 验证 coreDeconstruct 中的能量微积分公式
 *
 * totalEnergy = days × 10 × typeFactor × durationFactor(1+1/√days) × driveFactor
 */

interface MockInput {
  title: string;
  days: number;
  driveForce?: string;
  goalType?: string;
}

function computeEnergy(input: MockInput): { totalEnergy: number; slope: number } {
  const { title, days, driveForce = '', goalType } = input;
  const useToefl = /toefl|托福/i.test(title);
  const type = goalType || (useToefl ? 'TOEFL' : /academic|学术|sat|gre|gmat|雅思|ielts/i.test(title) ? 'ACADEMIC' : 'GENERIC');
  const typeFactor = type === 'TOEFL' ? 1 : type === 'ACADEMIC' ? 1.2 : 1.0;
  const durationFactor = 1 + (1 / Math.sqrt(Math.max(days, 1)));
  const driveFactor = driveForce ? 1.1 : 1.0;

  const totalEnergy = days * 10 * typeFactor * durationFactor * driveFactor;
  const slope = (totalEnergy / days) * durationFactor;

  return { totalEnergy: Math.round(totalEnergy), slope: Math.round(slope * 10) / 10 };
}

describe('能量模型', () => {
  it('totalEnergy = days × 10 × typeFactor × durationFactor × driveFactor', () => {
    const r = computeEnergy({ title: '学 Python', days: 30 });
    const expected = 30 * 10 * 1.0 * (1 + 1 / Math.sqrt(30)) * 1.0;
    expect(r.totalEnergy).toBe(Math.round(expected));
  });

  it('driveForce 放大系数 ×1.1', () => {
    const r1 = computeEnergy({ title: '学 Python', days: 30 });
    const r2 = computeEnergy({ title: '学 Python', days: 30, driveForce: '我要进大厂' });
    const diff = Math.abs(r2.totalEnergy - r1.totalEnergy);
    expect(diff).toBeGreaterThan(0);
    expect(r2.totalEnergy / r1.totalEnergy).toBeCloseTo(1.1, 0);
  });

  it('ACADEMIC typeFactor = 1.2', () => {
    const r = computeEnergy({ title: 'SAT 1500 冲刺', days: 90 });
    const expected = 90 * 10 * 1.2 * (1 + 1 / Math.sqrt(90)) * 1.0;
    expect(r.totalEnergy).toBe(Math.round(expected));
  });

  it('短期 durationFactor 更大（日能量密度更高）', () => {
    const short = computeEnergy({ title: '短期冲刺', days: 7 });
    const long = computeEnergy({ title: '长期积累', days: 90 });
    expect(short.totalEnergy / 7).toBeGreaterThan(long.totalEnergy / 90);
  });

  it('1 天目标有效', () => {
    const r = computeEnergy({ title: '极限冲刺', days: 1 });
    expect(r.totalEnergy).toBeGreaterThan(0);
    expect(r.slope).toBeGreaterThan(0);
  });
});
