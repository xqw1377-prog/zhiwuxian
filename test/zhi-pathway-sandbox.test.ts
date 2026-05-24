import { describe, expect, it } from 'vitest';
import { ZhiPathwaySandbox } from '../server/gateway/ZhiPathwaySandbox';

describe('ZhiPathwaySandbox', () => {
  it('国内轨防护栏含禁止美本术语清单', () => {
    const prompt = ZhiPathwaySandbox.injectSystemGuardrail({
      userId: '__no_such_user__',
    });
    expect(prompt.systemPrompt).toMatch(/国内高考|绝对禁止/);
    expect(prompt.systemPrompt).toMatch(/TOEFL/);
    expect(prompt.systemPrompt).toMatch(/Common App/);
  });

  it('sanitizeModelText 屏蔽国内轨误吐英文标化', () => {
    const out = ZhiPathwaySandbox.sanitizeModelText(
      '今晚刷 TOEFL 阅读，顺便看 Common App',
      'DOMESTIC_GAOKAO',
    );
    expect(out).not.toMatch(/TOEFL/);
    expect(out).toMatch(/已屏蔽/);
  });

  it('prefixGuardrail 将铁律置于业务指令之前', () => {
    const merged = ZhiPathwaySandbox.prefixGuardrail('业务测试 system', {
      userId: '__no_such_user__',
    });
    expect(merged.indexOf('【核心铁律')).toBeLessThan(merged.indexOf('【业务指令】'));
    expect(merged).toContain('业务测试 system');
  });
});
