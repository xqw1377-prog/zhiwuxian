import { describe, expect, it } from 'vitest';
import { isAssessmentRequest, isPathPlanningRequest } from '../src/services/zhi-chat-intent';

describe('zhi-chat-intent', () => {
  it('识别评估请求', () => {
    expect(isAssessmentRequest('帮我评估一下数学')).toBe(true);
    expect(isAssessmentRequest('今天天气不错')).toBe(false);
  });

  it('识别学习路径规划请求', () => {
    expect(isPathPlanningRequest('帮我做学习规划')).toBe(true);
    expect(isPathPlanningRequest('梦校学习路径时间轴')).toBe(true);
    expect(isPathPlanningRequest('帮我评估数学')).toBe(false);
  });

  it('规划优先于纯评估关键词组合', () => {
    expect(isPathPlanningRequest('按知识点做学习路径规划')).toBe(true);
  });

  it('整体评估不被误判为路径规划', () => {
    expect(isPathPlanningRequest('帮我整体做一次评估')).toBe(false);
    expect(isAssessmentRequest('帮我整体做一次评估')).toBe(true);
  });
});
