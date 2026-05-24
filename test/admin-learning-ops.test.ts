import { describe, expect, it } from 'vitest';
import { resolveDialogIntent } from '../src/services/zhi-dialog-router';

describe('admin-learning-ops (smoke)', () => {
  it('dialog intent 仍可用于运营话术抽检', () => {
    expect(resolveDialogIntent('帮我整体做一次评估', 'cn_gaokao').kind).toBe(
      'comprehensive_assessment',
    );
  });
});
