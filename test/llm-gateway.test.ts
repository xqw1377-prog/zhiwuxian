import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filterMetricsForPathway } from '../src/services/school-pathway';

const mocks = vi.hoisted(() => ({
  chargePlatformCompute: vi.fn(),
  assertWarpBalance: vi.fn(),
  reserveLlmTokens: vi.fn(),
  releaseLlmTokenReservation: vi.fn(),
  chatCompletionJson: vi.fn(),
  resolveUserLlm: vi.fn(),
}));

vi.mock('../src/services/billing-hub', () => ({
  assertWarpBalance: mocks.assertWarpBalance,
  chargePlatformCompute: mocks.chargePlatformCompute,
  reserveLlmTokens: mocks.reserveLlmTokens,
  releaseLlmTokenReservation: mocks.releaseLlmTokenReservation,
  WARP_COST: { CHAT_COMPLETION: 2, VISION_INTERCEPT: 5 },
}));

vi.mock('../src/services/deepseek-client', () => ({
  resolveUserLlm: mocks.resolveUserLlm,
  DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
}));

vi.mock('../server/llm/llm-provider', () => ({
  chatCompletionJson: mocks.chatCompletionJson,
  chatCompletionMessages: vi.fn(),
}));

vi.mock('../src/db/user-llm-config-schema', () => ({
  getUserLlmApiKey: vi.fn(() => null),
  getUserLlmSnapshot: vi.fn(() => ({ hasKey: false, baseURL: '', model: '' })),
}));

vi.mock('../src/services/qwen-client', () => ({
  resolveQwenVision: vi.fn(() => null),
  getPlatformQwenKey: vi.fn(() => null),
}));

import { gatewayJsonCompletion } from '../src/services/llm-gateway';

describe('llm-gateway billing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    mocks.assertWarpBalance.mockReturnValue({ ok: true, remaining: 100, deducted: 0 });
    mocks.resolveUserLlm.mockReturnValue(null);
    mocks.reserveLlmTokens.mockReturnValue({ ok: true, remaining: 0, reserved: 0 });
  });

  it('flatWarp：先扣固定 Warp，LLM 调用 billable=false', async () => {
    mocks.chargePlatformCompute.mockReturnValue({ ok: true, remaining: 98, deducted: 2 });
    mocks.chatCompletionJson.mockResolvedValue({
      data: { ok: true },
      provider: 'deepseek',
      usedFallback: false,
    });

    const gw = await gatewayJsonCompletion<{ ok: boolean }>(
      'user-a',
      [{ role: 'user', content: 'test' }],
      { flatWarp: { cost: 2, reason: 'CHAT_COMPLETION' } },
    );

    expect(mocks.chargePlatformCompute).toHaveBeenCalledWith('user-a', 2, 'CHAT_COMPLETION', false);
    expect(mocks.chatCompletionJson).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ billable: false, userId: 'user-a' }),
    );
    expect(gw.chargeOk).toBe(true);
    expect(gw.warpDeducted).toBe(2);
    expect(gw.warpRemaining).toBe(98);
    expect(gw.data).toEqual({ ok: true });
  });

  it('flatWarp 余额不足时不调用 LLM', async () => {
    mocks.chargePlatformCompute.mockReturnValue({
      ok: false,
      remaining: 0,
      deducted: 0,
      error: 'INSUFFICIENT_WARP',
    });

    const gw = await gatewayJsonCompletion('user-b', [{ role: 'user', content: 'x' }], {
      flatWarp: { cost: 5, reason: 'VISION_INTERCEPT' },
    });

    expect(gw.chargeOk).toBe(false);
    expect(gw.error).toBe('INSUFFICIENT_WARP');
    expect(mocks.chatCompletionJson).not.toHaveBeenCalled();
  });

  it('自备 Key 不触发 flatWarp 扣费', async () => {
    mocks.resolveUserLlm.mockReturnValue({
      client: {},
      model: 'deepseek-chat',
      usesPrivateKey: true,
    });
    mocks.chatCompletionJson.mockResolvedValue({
      data: { ok: true },
      provider: 'deepseek',
      usedFallback: false,
    });

    const gw = await gatewayJsonCompletion('user-c', [{ role: 'user', content: 'hi' }], {
      flatWarp: { cost: 2, reason: 'CHAT_COMPLETION' },
    });

    expect(mocks.chargePlatformCompute).not.toHaveBeenCalled();
    expect(mocks.chatCompletionJson).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ billable: false }),
    );
    expect(gw.warpDeducted).toBe(0);
  });

  it('无 flatWarp 时平台托管默认 billable=true', async () => {
    mocks.chatCompletionJson.mockResolvedValue({
      data: null,
      provider: 'none',
      usedFallback: true,
      error: 'timeout',
    });

    await gatewayJsonCompletion('user-d', [{ role: 'user', content: 'z' }]);

    expect(mocks.chargePlatformCompute).not.toHaveBeenCalled();
    expect(mocks.chatCompletionJson).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ billable: true }),
    );
  });

  it('billable:false 可显式关闭 token 计费', async () => {
    mocks.chatCompletionJson.mockResolvedValue({
      data: { n: 1 },
      provider: 'deepseek',
      usedFallback: false,
    });

    await gatewayJsonCompletion('user-e', [{ role: 'user', content: 'q' }], { billable: false });

    expect(mocks.chatCompletionJson).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ billable: false }),
    );
  });
});

describe('llm-gateway invariants (pathway)', () => {
  it('国内路径指标过滤仍剔除托福', () => {
    const out = filterMetricsForPathway({ 托福: '110', 数学: '140' }, 'domestic_cn');
    expect(out).toHaveProperty('数学');
    expect(out).not.toHaveProperty('托福');
  });
});
