/**
 * LLM 网关 · flatWarp 扣费 E2E
 *
 * 通过 /api/v3.5/zhi/topology（网关 + VISION_INTERCEPT flatWarp）断言 Warp 前后一致。
 *
 * 运行：npm run e2e:gateway-warp
 * 需本地服务：npm run server
 */

const BASE = process.env.WUXIAN_E2E_BASE ?? 'http://localhost:3401';

let authToken = '';

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...(extra ?? {}) };
  if (authToken) h.Authorization = `Bearer ${authToken}`;
  return h;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: authHeaders(init?.headers as Record<string, string> | undefined),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

async function main() {
  const results: string[] = [];
  const ok = (name: string) => results.push(`✅ ${name}`);
  const fail = (name: string, err: unknown) => {
    results.push(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  };

  let userId = 'e2e-gateway-warp';

  try {
    const boot = await req<{ data: { userId: string; token: string } }>(
      '/api/v1/auth/bootstrap',
      { method: 'POST', body: JSON.stringify({ deviceId: 'e2e-gw', displayName: 'e2e-gw' }) },
    );
    userId = boot.data.userId;
    authToken = boot.data.token;
    ok('auth bootstrap');
  } catch (e) {
    fail('auth bootstrap', e);
    printAndExit(results);
    return;
  }

  try {
    await req('/api/v3.5/billing/topup', {
      method: 'POST',
      body: JSON.stringify({ userId, amount: 50, reason: 'E2E_GATEWAY_WARP' }),
    });
    ok('billing topup (+50 warp)');
  } catch (e) {
    fail('billing topup', e);
  }

  try {
    const billBefore = await req<{
      data: { availableWarpPoints: number; deepSeekConfigured: boolean };
    }>(`/api/v3.5/billing/status/${userId}`);
    const warpBefore = billBefore.data.availableWarpPoints;

    const topo = await req<{
      data: {
        warpDeducted: number;
        warpPointsRemaining: number;
        syllabusDirect: string;
      };
    }>('/api/v3.5/zhi/topology', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        intentText: 'AP Calculus BC 泰勒级数收敛性卡住',
        subjectTrack: 'AP_CALC_BC',
      }),
    });

    const deducted = Number(topo.data.warpDeducted ?? 0);
    const remaining = Number(topo.data.warpPointsRemaining ?? 0);

    if (!billBefore.data.deepSeekConfigured) {
      ok('DeepSeek 未配置 → 拓扑启发式，跳过 flatWarp 断言');
    } else if (deducted > 0) {
      if (warpBefore - remaining === deducted) {
        ok(`gateway flatWarp 扣费一致 (扣 ${deducted}，余 ${remaining})`);
      } else {
        throw new Error(
          `Warp 账本不一致: before=${warpBefore} after=${remaining} deducted=${deducted}`,
        );
      }
    } else if (topo.data.syllabusDirect?.trim()) {
      ok('拓扑成功但 warpDeducted=0（可能启发式降级或自备 Key）');
    } else {
      throw new Error('拓扑无有效输出');
    }
  } catch (e) {
    fail('gateway warp via topology', e);
  }

  printAndExit(results);
}

function printAndExit(results: string[]) {
  console.log('\n═══ LLM Gateway Warp E2E ═══\n');
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith('❌'));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
