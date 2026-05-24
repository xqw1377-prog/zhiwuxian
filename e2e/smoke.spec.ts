import { test, expect } from '@playwright/test';

test.describe('WUXIAN 冒烟测试', () => {
  test('健康检查端点返回 200', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.version).toBeDefined();
    expect(body.entry).toBeDefined();
  });

  test('首页加载并渲染', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(2000);
    const title = await page.title();
    expect(title).toBeDefined();
  });

  test('认证引导端点可用', async ({ request }) => {
    const res = await request.post('/api/v1/auth/bootstrap', {
      data: { deviceId: 'e2e-test-device' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data?.token).toBeDefined();
    expect(body.data?.userId).toBeDefined();
  });

  test('商品目录可获取', async ({ request }) => {
    const res = await request.get('/api/v1/payment/catalog');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeDefined();
  });
});

test.describe('ZHI API', () => {
  let token: string;
  let userId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/v1/auth/bootstrap', {
      data: { deviceId: 'e2e-zhi-device' },
    });
    const body = await res.json();
    token = body.data.token;
    userId = body.data.userId;
  });

  test('趋势预测端点可用', async ({ request }) => {
    const res = await request.get(`/api/v3.5/zhi/trend/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('进步大盘端点可用', async ({ request }) => {
    const res = await request.get(`/api/v3.5/zhi/progress-dashboard/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
  });
});
