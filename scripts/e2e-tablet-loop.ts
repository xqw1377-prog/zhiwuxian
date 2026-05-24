/**
 * 平板主路径 E2E：设备登录 → 战报熔炼 → 家长视图 → 家长充能 → Warp 购买(simulate)
 */
import { loadEnvFiles } from '../server/load-env';

loadEnvFiles();

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3401';

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json as T;
}

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string, e: unknown) {
  console.error(`  ✗ ${msg}`, e);
  process.exitCode = 1;
}

async function main() {
  console.log('--- e2e:tablet-loop ---');
  let userId = '';
  let token = '';
  let goalId = '';

  try {
    const boot = await jsonFetch<{ data: { userId: string; token: string } }>('/api/v1/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: `e2e-tablet-${Date.now()}` }),
    });
    userId = boot.data.userId;
    token = boot.data.token;
    ok(`bootstrap ${userId}`);
  } catch (e) {
    fail('bootstrap', e);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  try {
    await jsonFetch(`/api/v1/companion/synthesize/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers,
    });
    ok('companion synthesize');
  } catch (e) {
    fail('synthesize', e);
  }

  try {
    const view = await jsonFetch<{ data: { dashboard: { goalId?: string } | null } }>(
      `/api/v1/companion/parent-view/${encodeURIComponent(userId)}`,
    );
    if (!view.data.dashboard) throw new Error('no dashboard card');
    goalId = view.data.dashboard.goalId || `goal-${userId}`;
    ok('parent-view card');
  } catch (e) {
    fail('parent-view', e);
  }

  try {
    await jsonFetch('/api/v1/companion/parent-cheer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goalId,
        studentId: userId,
        message: '❤️ 今晚加鸡腿',
        fuelBonus: 5,
        cheerStyle: 'HEART',
      }),
    });
    ok('parent-cheer');
  } catch (e) {
    fail('parent-cheer', e);
  }

  try {
    const create = await jsonFetch<{ data: { orderId: string } }>('/api/v1/payment/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, productId: 'warp_10h' }),
    });
    await jsonFetch('/api/v1/payment/confirm', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId: create.data.orderId, paymentRef: `e2e-${Date.now()}` }),
    });
    ok('payment create+confirm');
  } catch (e) {
    fail('payment', e);
  }

  console.log(process.exitCode === 1 ? '\n部分失败' : '\n全部通过');
}

void main();
