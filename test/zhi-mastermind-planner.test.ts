import { describe, expect, it } from 'vitest';
import { buildMastermindPlanSync } from '../src/services/zhi-mastermind-planner';
import { isPassiveOrVagueReply } from '../src/services/zhi-chat-intent';

describe('zhi-mastermind-planner', () => {
  it('无航标用户返回 null', () => {
    expect(buildMastermindPlanSync('no-anchor-user-xyz-999')).toBeNull();
  });

  it('识别敷衍回复', () => {
    expect(isPassiveOrVagueReply('还行')).toBe(true);
    expect(isPassiveOrVagueReply('我今天完成了函数专题练习共三道大题')).toBe(false);
  });
});
