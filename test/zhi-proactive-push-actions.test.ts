import { describe, it, expect } from 'vitest';
import {
  buildProactivePushQuickActions,
  mapPushToolTabToOpen,
} from '../web/src/lib/zhi-proactive-push-actions';

describe('zhi-proactive-push-actions', () => {
  it('mapPushToolTabToOpen 映射四类工具', () => {
    expect(mapPushToolTabToOpen('mistake')?.toolId).toBe('learning-assessment');
    expect(mapPushToolTabToOpen('mistake')?.launch?.assessmentTab).toBe('mistake');
    expect(mapPushToolTabToOpen('plan')?.toolId).toBe('learning-path');
    expect(mapPushToolTabToOpen('exam')?.launch?.assessmentTab).toBe('exam');
    expect(mapPushToolTabToOpen('textbook')?.launch?.visionTab).toBe('textbook');
  });

  it('buildProactivePushQuickActions 含 openToolId', () => {
    const actions = buildProactivePushQuickActions({
      type: 'review_due',
      title: '错题到期复习',
      body: '3 道',
      priority: 'medium',
      action: { label: '去复习', toolTab: 'mistake' },
    });
    expect(actions[0]?.openToolId).toBe('learning-assessment');
    expect(actions[0]?.label).toBe('去复习');
  });
});
