import { describe, expect, it } from 'vitest';
import { resolveDialogIntent } from '../src/services/zhi-dialog-router';
import { isPathPlanningRequest } from '../src/services/zhi-chat-intent';

describe('zhi-dialog-router', () => {
  it('识别整体评估', () => {
    const intent = resolveDialogIntent('帮我整体做一次评估', 'cn_gaokao');
    expect(intent.kind).toBe('comprehensive_assessment');
  });

  it('识别科目薄弱并给出选项包', () => {
    const intent = resolveDialogIntent('我数学比较差', 'cn_gaokao');
    expect(intent.kind).toBe('subject_weak_bundle');
    expect(intent.subjectId).toBe('math');
  });

  it('识别数字选择 1/2/3', () => {
    const intent = resolveDialogIntent('2', 'cn_gaokao');
    expect(intent.kind).toBe('numeric_choice');
    expect(intent.choiceNumber).toBe(2);
  });

  it('识别知识点归纳菜单', () => {
    const intent = resolveDialogIntent('把数学知识点归纳出来让我选', 'cn_gaokao');
    expect(intent.kind).toBe('subject_knowledge_menu');
  });

  it('识别看视频诉求', () => {
    const intent = resolveDialogIntent('数学给我找个讲解视频', 'cn_gaokao');
    expect(intent.kind).toBe('subject_video');
    expect(intent.subjectId).toBe('math');
  });
});

describe('zhi-chat-intent vs dialog', () => {
  it('整体评估不走路径规划', () => {
    expect(isPathPlanningRequest('帮我整体做一次评估')).toBe(false);
  });
});
