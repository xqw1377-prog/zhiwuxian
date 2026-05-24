/**
 * WUXIAN 3.5 · 校内成长（小学/初中）闭环 E2E
 * 先唤醒清华（制造混轨）→ 再唤醒校内成长 → 断言侧栏无托福/清华残留
 *
 * 运行：npm run e2e:k12-loop
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

function printAndExit(results: string[]) {
  console.log('\n--- WUXIAN k12 E2E ---\n');
  for (const line of results) console.log(line);
  process.exit(results.some((r) => r.startsWith('❌')) ? 1 : 0);
}

async function main() {
  const results: string[] = [];
  const ok = (name: string) => results.push(`✅ ${name}`);
  const fail = (name: string, err: unknown) => {
    results.push(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  };

  let userId = 'e2e-k12-loop';

  try {
    const boot = await req<{ data: { userId: string; token: string } }>(
      '/api/v1/auth/bootstrap',
      { method: 'POST', body: JSON.stringify({ userId }) },
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
    await req('/api/v3.5/cloud/directories/generate', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        school: '清华大学',
        major: '计算机',
        currentGrade: '高二',
        targetApplyAt: '2027-09',
        currentSchool: '人大附中',
        currentRegion: '北京',
        targetSchoolRegion: '北京',
      }),
    });
    ok('seed 清华航标（模拟历史混轨）');
  } catch (e) {
    fail('seed 清华', e);
  }

  try {
    const wake = await req<{
      data: {
        anchorBrief?: { pathway?: string; requiredMetrics?: Record<string, string> };
        directories?: Array<{ nodeName?: string; title?: string }>;
      };
    }>('/api/v3.5/cloud/directories/generate', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        school: '校内成长目标',
        major: '单科提升·数学',
        currentGrade: '小学五年级',
        targetApplyAt: '2026-07',
        currentSchool: '实验小学',
        currentRegion: '广东深圳',
        targetSchoolRegion: '',
      }),
    });

    if (wake.data.anchorBrief?.pathway !== 'k12_stage') {
      throw new Error(`expected k12_stage, got ${wake.data.anchorBrief?.pathway}`);
    }
    ok('梦校唤醒 pathway=k12_stage');

    const metrics = Object.keys(wake.data.anchorBrief?.requiredMetrics ?? {}).join(',');
    if (/托福|SAT|高考总分/i.test(metrics)) {
      throw new Error(`k12 metrics should not include 标化/高考: ${metrics}`);
    }
    ok('航标硬指标为校内目标');

    const dirs = wake.data.directories ?? [];
    const titles = dirs.map((d) => d.nodeName ?? d.title ?? '').join('|');
    if (/托福|TOEFL|SAT|Common App|清华大学|高考\/竞赛|CMU/i.test(titles)) {
      throw new Error(`dirs polluted: ${titles}`);
    }
    if (!/数学|校内|错题|周测/.test(titles)) {
      throw new Error(`expected k12 dirs: ${titles}`);
    }
    ok('云目录无清华/托福残留');
  } catch (e) {
    fail('校内成长唤醒 + 云目录', e);
  }

  try {
    const list = await req<{
      data: { pinned: Array<{ title: string; id: string }> };
    }>(`/api/v3.5/zhi/directories/${encodeURIComponent(userId)}`);
    const titles = (list.data.pinned ?? []).map((d) => d.title).join('|');
    const ids = (list.data.pinned ?? []).map((d) => d.id).join('|');
    if (/托福|TOEFL|SAT|清华|高考\/竞赛/i.test(titles)) {
      throw new Error(`pinned polluted: ${titles}`);
    }
    if (/DIR_TOEFL|DIR_GAOKAO|清华大学/.test(ids + titles)) {
      throw new Error(`pinned ids/titles: ${ids} | ${titles}`);
    }
    if (!/校内|数学|错题|周测|排名/.test(titles)) {
      throw new Error(`expected k12 pinned: ${titles}`);
    }
    ok('认知目录 PINNED 仅校内成长轨');
  } catch (e) {
    fail('GET zhi/directories', e);
  }

  try {
    const dash = await req<{ data: { pathway?: string; subjects?: Array<{ name: string }> } }>(
      `/api/v3.5/zhi/progress-dashboard/${encodeURIComponent(userId)}`,
    );
    if (dash.data.pathway !== 'k12_stage') {
      throw new Error(`dashboard pathway ${dash.data.pathway}`);
    }
    const names = (dash.data.subjects ?? []).map((s) => s.name).join(',');
    if (/托福|SAT/i.test(names)) {
      throw new Error(`subject tracks: ${names}`);
    }
    ok('progress-dashboard 校内分科');
  } catch (e) {
    fail('progress-dashboard', e);
  }

  printAndExit(results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
