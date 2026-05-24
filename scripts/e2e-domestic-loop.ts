/**
 * WUXIAN 3.5 · 国内路径（清华）闭环 E2E
 * 梦校唤醒 → 目录 PINNED → 航标指标 → 主动简报 pathway
 *
 * 运行：npm run e2e:domestic-loop
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
  console.log('\n--- WUXIAN domestic E2E ---\n');
  for (const line of results) console.log(line);
  const failed = results.some((r) => r.startsWith('❌'));
  process.exit(failed ? 1 : 0);
}

async function main() {
  const results: string[] = [];
  const ok = (name: string) => {
    results.push(`✅ ${name}`);
  };
  const fail = (name: string, err: unknown) => {
    results.push(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  };

  let userId = 'e2e-domestic-loop';

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
    const wake = await req<{
      data: {
        anchorBrief?: {
          pathway?: string;
          requiredMetrics?: Record<string, string>;
        };
        directories?: Array<{ id: string; title: string }>;
      };
    }>('/api/v3.5/cloud/directories/generate', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        school: '清华大学',
        major: '计算机科学与技术',
        currentGrade: '高二',
        targetApplyAt: '2027-09',
        currentSchool: '人大附中',
        currentRegion: '北京',
        targetSchoolRegion: '北京',
      }),
    });

    if (wake.data.anchorBrief?.pathway !== 'domestic_cn') {
      throw new Error(`expected domestic_cn, got ${wake.data.anchorBrief?.pathway}`);
    }
    ok('梦校唤醒 pathway=domestic_cn');

    const metrics = wake.data.anchorBrief?.requiredMetrics ?? {};
    const keys = Object.keys(metrics).join(',');
    if (/托福|TOEFL/i.test(keys) || /SAT/i.test(keys)) {
      throw new Error(`domestic metrics should not include TOEFL/SAT: ${keys}`);
    }
    if (!/数学|高考|物理|信息/.test(keys)) {
      throw new Error(`expected domestic metric keys, got: ${keys || '(empty)'}`);
    }
    ok('航标硬指标无美本标化');

    const dirs = wake.data.directories ?? [];
    const titles = dirs.map((d) => d.title).join('|');
    if (/托福|TOEFL|AP Calculus|CMU/i.test(titles)) {
      throw new Error(`pinned should not dominate US track: ${titles}`);
    }
    if (!/数学|高考|物理|信息/.test(titles)) {
      throw new Error(`expected domestic pinned dirs: ${titles}`);
    }
    ok('认知目录 PINNED 为国内科目轨');
  } catch (e) {
    fail('梦校唤醒 + 目录', e);
  }

  try {
    const brief = await req<{
      data: {
        ready: boolean;
        pathway?: string;
        requiredMetrics?: Record<string, string>;
      };
    }>(`/api/v3.5/zhi/anchor-brief/${encodeURIComponent(userId)}`);
    if (!brief.data.ready || brief.data.pathway !== 'domestic_cn') {
      throw new Error(`anchor-brief: ${JSON.stringify(brief.data)}`);
    }
    ok('GET anchor-brief pathway');
  } catch (e) {
    fail('GET anchor-brief', e);
  }

  try {
    const dash = await req<{
      data: { pathway?: string; subjects?: Array<{ name: string }> };
    }>(`/api/v3.5/zhi/progress-dashboard/${encodeURIComponent(userId)}`);
    if (dash.data.pathway !== 'domestic_cn') {
      throw new Error(`dashboard pathway ${dash.data.pathway}`);
    }
    const names = (dash.data.subjects ?? []).map((s) => s.name).join(',');
    if (/托福|SAT/i.test(names)) {
      throw new Error(`subject tracks: ${names}`);
    }
    ok('progress-dashboard 国内分科');
  } catch (e) {
    fail('progress-dashboard', e);
  }

  try {
    const proactive = await req<{ data: { pathway?: string; chatText?: string } }>(
      '/api/v3.5/zhi/proactive',
      {
        method: 'POST',
        body: JSON.stringify({ userId, scene: 'session_open' }),
      },
    );
    if (proactive.data.pathway !== 'domestic_cn') {
      throw new Error(`proactive pathway ${proactive.data.pathway}`);
    }
    if (!proactive.data.chatText?.includes('学习向快照')) {
      throw new Error('proactive missing 学习向快照 section');
    }
    ok('主动简报含 pathway + 学习快照');
  } catch (e) {
    fail('proactive brief', e);
  }

  printAndExit(results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
