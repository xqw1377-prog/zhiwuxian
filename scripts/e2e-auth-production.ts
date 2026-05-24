/**
 * WUXIAN P4 · 生产模式鉴权 E2E
 * 启动临时服务（NODE_ENV=production，鉴权收紧），验证 401/200
 *
 * 运行：npx tsx scripts/e2e-auth-production.ts
 */

import { spawn, type ChildProcess } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';

const TEST_PORT = Number(process.env.WUXIAN_AUTH_TEST_PORT) || (3500 + Math.floor(Math.random() * 200));
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const ROOT = join(__dirname, '..');
const TEST_DB_KEY = 'wuxian-p4-test-encryption-key-32chars-min!!';
const TEST_DATA_DIR = join(ROOT, '.tmp', 'e2e-auth-prod-data');
mkdirSync(TEST_DATA_DIR, { recursive: true });

let serverProc: ChildProcess | null = null;

async function sleep(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

async function waitForHealth(maxMs = 45_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error('测试服务启动超时');
}

function startTestServer(): ChildProcess {
  const proc = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: ROOT,
    shell: true,
    env: (() => {
      const env = {
        ...process.env,
        PORT: String(TEST_PORT),
        NODE_ENV: 'production',
        DB_ENCRYPTION_KEY: TEST_DB_KEY,
        WUXIAN_DATA_DIR: TEST_DATA_DIR,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '',
      };
      env.WUXIAN_AUTH_RELAXED = '0';
      return env;
    })(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout?.on('data', (d: Buffer) => {
    const t = d.toString();
    if (t.includes('Error') || t.includes('失败')) process.stderr.write(t);
  });
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(d.toString()));
  return proc;
}

function stopServer() {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
    serverProc = null;
  }
}

async function main() {
  const results: string[] = [];
  const ok = (n: string) => { results.push(`✅ ${n}`); };
  const fail = (n: string, e: unknown) => {
    results.push(`❌ ${n}: ${e instanceof Error ? e.message : String(e)}`);
  };

  console.log(`\n[WUXIAN] 启动生产鉴权测试服务 :${TEST_PORT} …\n`);
  serverProc = startTestServer();

  try {
    await waitForHealth();
    ok('test server health');

    const bootRes = await fetch(`${BASE}/api/v1/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'auth-e2e-user' }),
    });
    const bootJson = await bootRes.json() as { data?: { token?: string; userId?: string } };
    const token = bootJson.data?.token;
    const userId = bootJson.data?.userId;
    if (!token || !userId) throw new Error('bootstrap 未返回 token');
    ok('bootstrap without prior token');

    const unauthWallet = await fetch(`${BASE}/api/v1/wallet/${userId}`);
    if (unauthWallet.status === 401) ok('wallet 无 Bearer → 401');
    else fail('wallet 无 Bearer → 401', `got ${unauthWallet.status}`);

    const authWallet = await fetch(`${BASE}/api/v1/wallet/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (authWallet.ok) ok('wallet 带 Bearer → 200');
    else fail('wallet 带 Bearer → 200', `status ${authWallet.status}`);

    const wrongUser = await fetch(`${BASE}/api/v1/wallet/other-user-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (wrongUser.status === 403) ok('wallet 越权 userId → 403');
    else fail('wallet 越权 userId → 403', `got ${wrongUser.status}`);

    const pubCatalog = await fetch(`${BASE}/api/v1/payment/catalog`);
    if (pubCatalog.ok) ok('payment/catalog 公开');
    else fail('payment/catalog 公开', `status ${pubCatalog.status}`);

    const unauthPay = await fetch(`${BASE}/api/v1/payment/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, productId: 'warp_10h' }),
    });
    if (unauthPay.status === 401) ok('payment/create 无 Bearer → 401');
    else fail('payment/create 无 Bearer → 401', `got ${unauthPay.status}`);

    const unauthUnlock = await fetch(`${BASE}/api/v1/report/cognitive/test-report/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (unauthUnlock.status === 401) ok('report/unlock 无 Bearer → 401');
    else fail('report/unlock 无 Bearer → 401', `got ${unauthUnlock.status}`);

    const authBilling = await fetch(`${BASE}/api/v3.5/billing/status/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (authBilling.ok) ok('v3.5 billing/status 带 Bearer → 200');
    else fail('v3.5 billing/status 带 Bearer → 200', `status ${authBilling.status}`);

    const unauthV2 = await fetch(`${BASE}/api/v2/omni/intrusion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (unauthV2.status === 401) ok('v2 omni/intrusion 无 Bearer → 401');
    else fail('v2 omni/intrusion 无 Bearer → 401', `got ${unauthV2.status}`);

    const wrongV3 = await fetch(`${BASE}/api/v3/school-matrix/other-user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (wrongV3.status === 403) ok('v3 school-matrix 越权 → 403');
    else fail('v3 school-matrix 越权 → 403', `got ${wrongV3.status}`);

  } catch (e) {
    fail('suite', e);
  } finally {
    stopServer();
    await sleep(800);
  }

  console.log('\n═══ WUXIAN P4 Auth (production) ═══\n');
  results.forEach(r => console.log(r));
  const failed = results.filter(r => r.startsWith('❌'));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

process.on('SIGINT', () => { stopServer(); process.exit(130); });

main().catch(err => {
  stopServer();
  console.error(err);
  process.exit(1);
});
