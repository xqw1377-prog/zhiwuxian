/**
 * 模拟：注册(引导) → 登录(会话) → 购买 Warp/Credits → 充值/Token
 * 运行：npm run e2e:user-journey
 * 默认自启测试服务（production 鉴权）；已有服务可设 WUXIAN_E2E_BASE
 */

import { spawn, type ChildProcess } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const USE_EXTERNAL = Boolean(process.env.WUXIAN_E2E_BASE?.trim());
const TEST_PORT = Number(process.env.WUXIAN_USER_JOURNEY_PORT) || 3512;
const BASE = USE_EXTERNAL ? process.env.WUXIAN_E2E_BASE!.trim() : `http://127.0.0.1:${TEST_PORT}`;
const ROOT = join(__dirname, '..');
const TEST_DATA_DIR = join(ROOT, '.tmp', 'e2e-user-journey-data');

let serverProc: ChildProcess | null = null;

function deviceScopedUserId(deviceId: string): string {
  return `d-${createHash('sha256').update(deviceId).digest('hex').slice(0, 10)}`;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(maxMs = 45_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error('服务启动超时');
}

function startTestServer(): ChildProcess {
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  return spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: ROOT,
    shell: true,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: 'production',
      WUXIAN_AUTH_RELAXED: '0',
      WUXIAN_DATA_DIR: TEST_DATA_DIR,
      DB_ENCRYPTION_KEY: process.env.DB_ENCRYPTION_KEY ?? 'wuxian-e2e-test-key-32chars-minimum!!',
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? 'sk-e2e-placeholder',
      WUXIAN_PAYMENT_MODE: 'simulate',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function stopServer() {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
    serverProc = null;
  }
}

type Envelope<T> = { data: T };

async function jsonFetch<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<{ status: number; body: Envelope<T> & { code?: number; message?: string } }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as Envelope<T> & { code?: number; message?: string };
  return { status: res.status, body };
}

async function main() {
  const results: string[] = [];
  const ok = (n: string) => results.push(`✅ ${n}`);
  const fail = (n: string, e: unknown) => {
    results.push(`❌ ${n}: ${e instanceof Error ? e.message : String(e)}`);
  };

  if (!USE_EXTERNAL) {
    console.log(`\n[WUXIAN] 用户旅程 E2E · 启动生产鉴权测试服 :${TEST_PORT}\n`);
    serverProc = startTestServer();
    await waitForHealth();
    ok('测试服务就绪');
  }

  const deviceId = `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const fakeLocalUserId = `u-${Math.random().toString(16).slice(2, 10)}`;
  let token = '';
  let userId = '';
  let orderId = '';

  // —— 1. 新用户「注册」：仅 deviceId（生产正确路径）——
  try {
    const r = await jsonFetch<{ token: string; userId: string; wallet: { availableWarpMinutes: number } }>(
      '/api/v1/auth/bootstrap',
      { method: 'POST', body: JSON.stringify({ deviceId, displayName: '旅程测试用户' }) },
    );
    if (r.status !== 200 || !r.body.data?.token || !r.body.data?.userId) {
      throw new Error(JSON.stringify(r.body));
    }
    token = r.body.data.token;
    userId = r.body.data.userId;
    const expected = deviceScopedUserId(deviceId);
    if (userId !== expected) throw new Error(`userId 应为 ${expected}，实际 ${userId}`);
    if (typeof r.body.data.wallet.availableWarpMinutes !== 'number') throw new Error('wallet 缺失');
    ok(`新用户 bootstrap(deviceId) → ${userId}`);
  } catch (e) {
    fail('新用户 bootstrap(deviceId)', e);
    printAndExit(results);
    return;
  }

  // —— 2. 错误路径：仅传前端自造 userId（生产应忽略）——
  try {
    const r = await jsonFetch<{ token: string; userId: string }>('/api/v1/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ userId: fakeLocalUserId }),
    });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (r.body.data.userId === fakeLocalUserId) {
      throw new Error('生产环境不应采纳客户端自造 userId（与 OmniCockpit 仅传 userId 的隐患一致）');
    }
    ok('生产 bootstrap 忽略客户端自造 userId');
  } catch (e) {
    fail('bootstrap userId 隔离', e);
  }

  // —— 3. 「登录」：带 token 恢复会话 ——
  try {
    const r = await jsonFetch<{ token: string; userId: string }>('/api/v1/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    if (r.status !== 200 || r.body.data.userId !== userId) throw new Error(JSON.stringify(r.body));
    ok('token 恢复会话（再登录）');
  } catch (e) {
    fail('token 恢复会话', e);
  }

  // —— 4. 钱包查询 ——
  try {
    const r = await jsonFetch<{ availableWarpMinutes: number; credits: number }>(
      `/api/v1/wallet/${encodeURIComponent(userId)}`,
      { token },
    );
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    ok(`钱包可读 · Warp ${r.body.data.availableWarpMinutes} min · Credits ${r.body.data.credits}`);
  } catch (e) {
    fail('GET wallet', e);
  }

  // —— 5. 商品目录 ——
  try {
    const r = await jsonFetch<{ products: Record<string, unknown>; mode: string }>('/api/v1/payment/catalog');
    if (r.status !== 200 || !r.body.data?.products?.warp_10h) throw new Error(JSON.stringify(r.body));
    ok(`商品目录 · mode=${r.body.data.mode}`);
  } catch (e) {
    fail('payment/catalog', e);
  }

  // —— 6. 购买 Warp 10h（创建订单 → 验单）——
  try {
    const warpBefore = (
      await jsonFetch<{ availableWarpMinutes: number }>(`/api/v1/wallet/${userId}`, { token })
    ).body.data.availableWarpMinutes;

    const create = await jsonFetch<{ orderId: string }>('/api/v1/payment/create', {
      method: 'POST',
      token,
      body: JSON.stringify({ userId, productId: 'warp_10h' }),
    });
    if (create.status !== 200 || !create.body.data?.orderId) throw new Error(JSON.stringify(create.body));
    orderId = create.body.data.orderId;

    const confirm = await jsonFetch<{
      order: { status: string };
      wallet: { availableWarpMinutes: number };
    }>('/api/v1/payment/confirm', {
      method: 'POST',
      token,
      body: JSON.stringify({ orderId }),
    });
    if (confirm.status !== 200 || confirm.body.data.order.status !== 'PAID') {
      throw new Error(JSON.stringify(confirm.body));
    }
    if (confirm.body.data.wallet.availableWarpMinutes < warpBefore + 600) {
      throw new Error(
        `Warp 未增加 600+：前 ${warpBefore} 后 ${confirm.body.data.wallet.availableWarpMinutes}`,
      );
    }
    ok('购买 warp_10h：create → confirm → 到账');
  } catch (e) {
    fail('购买 warp_10h', e);
  }

  // —— 7. 购买 Credits ——
  try {
    const creditsBefore = (
      await jsonFetch<{ credits: number }>(`/api/v1/wallet/${userId}`, { token })
    ).body.data.credits;

    const create = await jsonFetch<{ orderId: string }>('/api/v1/payment/create', {
      method: 'POST',
      token,
      body: JSON.stringify({ userId, productId: 'credits_100' }),
    });
    const cid = create.body.data.orderId;
    const confirm = await jsonFetch<{ wallet: { credits: number } }>('/api/v1/payment/confirm', {
      method: 'POST',
      token,
      body: JSON.stringify({ orderId: cid }),
    });
    if (confirm.body.data.wallet.credits <= creditsBefore) {
      throw new Error(`Credits 未增加：前 ${creditsBefore} 后 ${confirm.body.data.wallet.credits}`);
    }
    ok('购买 credits_100 到账');
  } catch (e) {
    fail('购买 credits_100', e);
  }

  // —— 8. v3.5 算力状态 + 快速充值（非真实支付）——
  try {
    const status = await jsonFetch<{ availableWarpPoints: number }>(
      `/api/v3.5/billing/status/${encodeURIComponent(userId)}`,
      { token },
    );
    if (status.status !== 200) throw new Error(`status ${status.status}`);

    const topup = await jsonFetch<{ remaining: number; granted: number }>('/api/v3.5/billing/topup', {
      method: 'POST',
      token,
      body: JSON.stringify({ userId, amount: 50 }),
    });
    if (topup.status !== 200 || topup.body.data.granted !== 50) throw new Error(JSON.stringify(topup.body));
    ok('v3.5 billing/status + topup（运营赠送通道）');
  } catch (e) {
    fail('v3.5 billing/topup', e);
  }

  // —— 9. ZHI 双核 Token 注入 ——
  try {
    const inj = await jsonFetch<{ coreLogicTokens: number }>('/api/v3.5/zhi/token-inject', {
      method: 'POST',
      token,
      body: JSON.stringify({ userId, pack: 'CORE' }),
    });
    if (inj.status !== 200 || !inj.body.data?.coreLogicTokens) throw new Error(JSON.stringify(inj.body));
    ok('token-inject CORE 包');
  } catch (e) {
    fail('token-inject', e);
  }

  // —— 10. 越权：body userId 与会话不一致 ——
  try {
    const r = await jsonFetch<unknown>('/api/v1/payment/create', {
      method: 'POST',
      token,
      body: JSON.stringify({ userId: 'other-user-xxx', productId: 'warp_10h' }),
    });
    if (r.status !== 403) throw new Error(`expected 403, got ${r.status}`);
    ok('支付 create 越权 userId → 403');
  } catch (e) {
    fail('支付越权校验', e);
  }

  // —— 11. 无 token 不能下单 ——
  try {
    const r = await jsonFetch<unknown>('/api/v1/payment/create', {
      method: 'POST',
      body: JSON.stringify({ userId, productId: 'warp_10h' }),
    });
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
    ok('无 Bearer 不能 create 订单');
  } catch (e) {
    fail('支付需登录', e);
  }

  printAndExit(results);
  stopServer();
}

function printAndExit(results: string[]) {
  console.log('\n═══ WUXIAN 用户旅程 E2E ═══\n');
  for (const line of results) console.log(line);
  const failed = results.filter((r) => r.startsWith('❌'));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});

main().catch((err) => {
  stopServer();
  console.error(err);
  process.exit(1);
});
