/**
 * WUXIAN P0 E2E 验收脚本
 *
 * 运行：npx tsx scripts/e2e-p0.ts
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
  const ok = (name: string) => { results.push(`✅ ${name}`); };
  const fail = (name: string, err: unknown) => {
    results.push(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  };

  let userId = 'e2e-user';
  let orderId = '';
  let goalId = '';
  let taskId = '';

  try {
    const boot = await req<{ data: { userId: string; token: string; wallet: { availableWarpMinutes: number } } }>(
      '/api/v1/auth/bootstrap',
      { method: 'POST', body: JSON.stringify({ deviceId: 'e2e-device', displayName: 'e2e' }) },
    );
    userId = boot.data.userId;
    authToken = boot.data.token;
    if (boot.data.wallet.availableWarpMinutes >= 0) ok('auth/bootstrap + wallet');
    else throw new Error('wallet missing');
  } catch (e) { fail('auth/bootstrap', e); }

  try {
    const wallet = await req<{ data: { availableWarpMinutes: number } }>(`/api/v1/wallet/${userId}`);
    if (typeof wallet.data.availableWarpMinutes === 'number') ok('GET wallet');
    else throw new Error('invalid wallet');
  } catch (e) { fail('GET wallet', e); }

  try {
    const order = await req<{ data: { orderId: string } }>(
      '/api/v1/payment/create',
      { method: 'POST', body: JSON.stringify({ userId, productId: 'warp_10h' }) },
    );
    orderId = order.data.orderId;
    const confirmed = await req<{ data: { order: { status: string }; wallet: { availableWarpMinutes: number } } }>(
      '/api/v1/payment/confirm',
      { method: 'POST', body: JSON.stringify({ orderId }) },
    );
    if (confirmed.data.order.status === 'PAID' && confirmed.data.wallet.availableWarpMinutes >= 600) ok('payment create → confirm');
    else throw new Error(`unexpected: ${JSON.stringify(confirmed.data)}`);
  } catch (e) { fail('payment flow', e); }

  try {
    const assimilate = await req<{ data: { success: boolean; folded: boolean; sessionId: string } }>(
      '/api/v1/quantum/assimilate',
      { method: 'POST', body: JSON.stringify({ userId, rawInput: '30天学会线性代数，今天卡在特征值分解' }) },
    );
    if (assimilate.data.success && assimilate.data.sessionId) ok('quantum assimilate (goal)');
    else throw new Error(JSON.stringify(assimilate.data));
  } catch (e) { fail('quantum assimilate', e); }

  try {
    const video = await req<{ data: { protocol: string } }>(
      '/api/v1/video/assimilate',
      { method: 'POST', body: JSON.stringify({ userId, simulate: true, goalId: userId }) },
    );
    if (video.data.protocol === 'VIDEO_ASSIMILATION_MOCK') ok('video assimilate (explicit simulate)');
    else throw new Error(`protocol=${video.data.protocol}`);
  } catch (e) { fail('video assimilate simulate', e); }

  try {
    const ts = new Date().toISOString();
    await req('/api/v1/telemetry/ingest', {
      method: 'POST',
      body: JSON.stringify({ userId, events: [{ ts, type: 'TASK_COMPLETED', payload: { nodeId: 'e2e-node' } }] }),
    });
    const agg = await req<{ data: { window: { events: number } } }>(`/api/v1/telemetry/${userId}/aggregate?windowDays=1`);
    if (agg.data.window.events >= 1) ok('telemetry SQLite persist + aggregate');
    else throw new Error('no events in aggregate');
  } catch (e) { fail('telemetry persist', e); }

  if (orderId) {
    try {
      await req('/api/v1/payment/webhook/simulate', {
        method: 'POST',
        body: JSON.stringify({ orderId, thirdPartyTxId: `wh-${Date.now()}` }),
      });
      ok('payment webhook (idempotent re-fulfill)');
    } catch (e) {
      if (String(e).includes('PAID') || String(e).includes('200')) ok('payment webhook (already paid)');
      else fail('payment webhook', e);
    }
  }

  try {
    const health = await req<{ status: string }>(`/api/health`);
    if (health.status === 'ok') ok('/api/health');
    else throw new Error('health not ok');
  } catch (e) { fail('/api/health', e); }

  try {
    const deconstruct = await req<{ data: { sessionId: string; todayTasks: { id: string }[]; persisted: boolean } }>(
      '/api/v1/goal/deconstruct',
      {
        method: 'POST',
        body: JSON.stringify({
          userId,
          goal: 'TOEFL 90',
          totalDays: 90,
          driveSource: { why: 'e2e' },
          personaType: 'BUDDY',
        }),
      },
    );
    goalId = deconstruct.data.sessionId;
    taskId = deconstruct.data.todayTasks?.[0]?.id ?? '';
    if (goalId) ok('goal deconstruct (TOEFL 90)');
    else throw new Error('missing sessionId');
  } catch (e) { fail('goal deconstruct', e); }

  try {
    const dash = await req<{ data: { goal?: { id: string }; tasks?: { id: string; status: string }[] } }>(
      `/api/v1/goal/${goalId}/dashboard`,
    );
    if (dash.data.goal?.id) ok('goal dashboard persisted');
    else throw new Error('goal missing');
  } catch (e) { fail('goal dashboard', e); }

  if (goalId && taskId) {
    try {
      await req(`/api/v1/task/update`, { method: 'POST', body: JSON.stringify({ goalId, taskId, status: 'DONE' }) });
      ok('task mark DONE');
    } catch (e) { fail('task mark DONE', e); }

    try {
      const dash2 = await req<{ data: { tasks?: { id: string; status: string }[] } }>(`/api/v1/goal/${goalId}/dashboard`);
      const t = dash2.data.tasks?.find(x => x.id === taskId);
      if (t?.status === 'DONE') ok('task status reflected in dashboard');
      else throw new Error('task not DONE');
    } catch (e) { fail('task status reflected', e); }
  }

  try {
    const dirs = await req<{ data: { pinned: unknown[]; custom: unknown[] } }>(`/api/v3.5/zhi/directories/${userId}`);
    if (Array.isArray(dirs.data.pinned) && Array.isArray(dirs.data.custom)) ok('v3.5 directories list');
    else throw new Error('invalid directories');
  } catch (e) { fail('v3.5 directories list', e); }

  try {
    const vision = await req<{ data: { subject: string; chatText: string } }>(
      `/api/v3.5/zhi/vision/analyze`,
      { method: 'POST', body: JSON.stringify({ userId, ocrText: '数学 80分', userHint: '函数单调性不会' }) },
    );
    if (vision.data.subject && vision.data.chatText) ok('v3.5 vision analyze (template)');
    else throw new Error('invalid vision');
  } catch (e) { fail('v3.5 vision analyze', e); }

  try {
    const billBefore = await req<{ data: { availableWarpPoints: number; deepSeekConfigured: boolean } }>(
      `/api/v3.5/billing/status/${userId}`,
    );
    const warpBefore = billBefore.data.availableWarpPoints;
    const topo = await req<{ data: { warpDeducted: number; warpPointsRemaining: number; syllabusDirect: string } }>(
      '/api/v3.5/zhi/topology',
      {
        method: 'POST',
        body: JSON.stringify({ userId, intentText: '泰勒级数收敛判定', subjectTrack: 'AP_CALC_BC' }),
      },
    );
    const d = Number(topo.data.warpDeducted ?? 0);
    const rem = Number(topo.data.warpPointsRemaining ?? 0);
    if (!billBefore.data.deepSeekConfigured) {
      ok('gateway flatWarp (skipped: DeepSeek 未配置)');
    } else if (d > 0 && warpBefore - rem === d) {
      ok(`gateway flatWarp deduct (${d})`);
    } else if (topo.data.syllabusDirect?.trim()) {
      ok('gateway topology (heuristic or private key, warpDeducted=0)');
    } else {
      throw new Error(`unexpected topology: ${JSON.stringify(topo.data)}`);
    }
  } catch (e) { fail('gateway flatWarp via topology', e); }

  console.log('\n═══ WUXIAN P0 E2E ═══\n');
  results.forEach(r => console.log(r));
  const failed = results.filter(r => r.startsWith('❌'));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
