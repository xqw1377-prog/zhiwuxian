/**
 * WUXIAN 3.5 · 托福 90 天闭环 E2E
 * 解构 → 作战区 → 任务 DONE/FAILED → 评估出卷 → 目录计数
 *
 * 运行：npm run e2e:toefl-loop
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

function toeflDirectoryId(userId: string): string {
  return `${userId}::DIR_TOEFL`;
}

async function main() {
  const results: string[] = [];
  const ok = (name: string) => { results.push(`✅ ${name}`); };
  const fail = (name: string, err: unknown) => {
    results.push(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  };

  let userId = 'e2e-toefl-loop';

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
    const health = await req<{ version?: string; api?: { zhi?: string } }>('/api/health');
    if (health.version !== '3.5.0' || health.api?.zhi !== 'v3.5') {
      throw new Error(`unexpected health: ${JSON.stringify(health)}`);
    }
    ok('health 3.5.0');
  } catch (e) {
    fail('health 3.5.0', e);
  }

  const dirId = toeflDirectoryId(userId);
  let goalId = '';

  try {
    const created = await req<{
      data: { goalId?: string; sessionId?: string; todayTasks?: { id: string }[] };
    }>('/api/v3.5/zhi/directory-workspace/goal', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        directoryId: dirId,
        title: 'E2E 托福 90 天闭环',
        days: 90,
        templateId: 'TOEFL_90_PRO',
      }),
    });
    goalId = created.data.goalId ?? created.data.sessionId ?? '';
    if (!goalId) throw new Error('no goalId');
    ok('directory-workspace goal (TOEFL_90_PRO)');
  } catch (e) {
    fail('directory-workspace goal', e);
  }

  let taskId = '';
  try {
    const ws = await req<{
      data: { linkedToDirectory: boolean; goals: Array<{ id: string; todayTasks: { id: string; status: string }[] }> };
    }>(`/api/v3.5/zhi/directory-workspace/${encodeURIComponent(userId)}/${encodeURIComponent(dirId)}`);
    const goal = ws.data.goals.find((g) => g.id === goalId) ?? ws.data.goals[0];
    if (!goal) throw new Error('no goals in workspace');
    taskId = goal.todayTasks.find((t) => t.status === 'TODO')?.id ?? '';
    if (!taskId) throw new Error('no TODO task');
    if (!ws.data.linkedToDirectory && ws.data.goals.length === 0) throw new Error('workspace empty');
    ok('directory-workspace GET');
  } catch (e) {
    fail('directory-workspace GET', e);
  }

  if (goalId && taskId) {
    try {
      const done = await req<{ data: { actionTaken?: string } }>('/api/v1/task/update', {
        method: 'POST',
        body: JSON.stringify({ goalId, taskId, status: 'DONE' }),
      });
      if (!done.data.actionTaken) throw new Error('no actionTaken');
      ok('task DONE');
    } catch (e) {
      fail('task DONE', e);
    }

    try {
      const dash = await req<{ data: { todayTasks: { id: string; status: string }[] } }>(
        `/api/v1/goal/${goalId}/dashboard`,
      );
      const todo = dash.data.todayTasks.filter((t) => t.status === 'TODO');
      const failTask = todo[0]?.id ?? taskId;
      const failed = await req<{ data: { companionSpeech?: string; actionTaken?: string } }>(
        '/api/v1/task/update',
        {
          method: 'POST',
          body: JSON.stringify({ goalId, taskId: failTask, status: 'FAILED', reason: 'e2e reroute' }),
        },
      );
      if (!failed.data.actionTaken) throw new Error('reroute missing actionTaken');
      ok('task FAILED → reroute');
    } catch (e) {
      fail('task FAILED reroute', e);
    }
  }

  try {
    const paper = await req<{ data: { id: string; questions: unknown[] } }>(
      '/api/v3.5/zhi/assessment/paper/generate',
      {
        method: 'POST',
        body: JSON.stringify({ userId, subjectId: 'toefl' }),
      },
    );
    if (!paper.data.id || !Array.isArray(paper.data.questions)) throw new Error('invalid paper');
    ok('assessment paper generate (toefl)');

    const answers: Record<string, string> = {};
    for (const q of paper.data.questions as { id: string }[]) {
      answers[q.id] = 'E2E placeholder answer';
    }
    const evalRes = await req<{ data: { scorePct: number } }>('/api/v3.5/zhi/assessment/submit', {
      method: 'POST',
      body: JSON.stringify({ userId, paperId: paper.data.id, answers }),
    });
    if (typeof evalRes.data.scorePct !== 'number') throw new Error('no scorePct');
    ok('assessment submit');
  } catch (e) {
    fail('assessment flow', e);
  }

  try {
    const dirs = await req<{
      data: { pinned: Array<{ id: string; goalCount?: number; todayTaskCount?: number }> };
    }>(`/api/v3.5/zhi/directories/${encodeURIComponent(userId)}`);
    const toefl = dirs.data.pinned.find((d) => d.id === dirId || d.id.includes('TOEFL'));
    if (!toefl) throw new Error('TOEFL directory not in pinned');
    if ((toefl.goalCount ?? 0) < 1) throw new Error('goalCount still 0 after loop');
    ok('directories counts after loop');
  } catch (e) {
    fail('directories counts', e);
  }

  printAndExit(results);
}

function printAndExit(results: string[]) {
  console.log('\n═══ WUXIAN TOEFL 90-day loop E2E ═══\n');
  results.forEach((r) => console.log(r));
  const failed = results.filter((r) => r.startsWith('❌'));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
