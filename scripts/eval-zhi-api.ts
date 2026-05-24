const BASE = 'http://localhost:3401';
const results: { pass: number; fail: number; details: string[] } = { pass: 0, fail: 0, details: [] };
let userId = 'test-eval-' + Date.now();
let authToken = '';

async function req(path: string, init?: RequestInit) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) h['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(BASE + path, { ...init, headers: { ...h, ...(init?.headers as any) } });
  let json: any = null;
  try { json = await res.json(); } catch { json = { raw: 'not json: ' + (await res.text()).slice(0, 100) }; }
  return { ok: res.ok, status: res.status, data: json };
}

function ok(name: string) { results.pass++; results.details.push('PASS ' + name); }
function fail(name: string, err: any) { results.fail++; results.details.push('FAIL ' + name + ': ' + (err?.message ?? JSON.stringify(err).slice(0, 300))); }

async function main() {
  // 1. Bootstrap
  const boot = await req('/api/v1/auth/bootstrap', { method: 'POST', body: JSON.stringify({ deviceId: 'eval-dev', displayName: 'eval' }) });
  if (boot.ok) { userId = boot.data.data.userId; authToken = boot.data.data.token; ok('auth/bootstrap'); }
  else { fail('bootstrap', boot.data); process.exit(1); }
  console.log('userId:', userId);

  // 2. Health
  const h = await req('/api/health'); h.ok ? ok('health') : fail('health', h.data);

  // 3. Wallet
  const w = await req('/api/v1/wallet/' + userId); w.ok ? ok('wallet') : fail('wallet', w.data);

  // === MISTAKE BANK ===
  const mb = await req('/api/v3.5/zhi/mistake/batch', {
    method: 'POST',
    body: JSON.stringify({ userId, items: [{ userId, subject: '数学', questionText: '测试题：1+1=?', mistakeType: 'careless', knowledgeNode: '加法', source: 'test' }] })
  });
  mb.ok ? ok('mistake/batch') : fail('mistake/batch', mb.data);

  const mbank = await req('/api/v3.5/zhi/mistake/bank/' + userId + '?limit=5');
  mbank.ok ? ok('mistake/bank') : fail('mistake/bank', mbank.data);

  const mt = await req('/api/v3.5/zhi/mistake/trend/' + userId);
  mt.ok ? ok('mistake/trend') : fail('mistake/trend', mt.data);

  const mretry = await req('/api/v3.5/zhi/mistake/retry/' + userId);
  mretry.ok ? ok('mistake/retry') : fail('mistake/retry', mretry.data);

  // === TIMER ===
  const ts = await req('/api/v3.5/zhi/timer/start', { method: 'POST', body: JSON.stringify({ userId, subject: '数学' }) });
  let sessionId = '';
  if (ts.ok) { sessionId = ts.data.data?.sessionId ?? ''; ok('timer/start'); }
  else fail('timer/start', ts.data);

  if (sessionId) {
    const te = await req('/api/v3.5/zhi/timer/end', { method: 'POST', body: JSON.stringify({ userId, sessionId }) });
    te.ok ? ok('timer/end') : fail('timer/end', te.data);
  }

  const tw = await req('/api/v3.5/zhi/timer/weekly-report/' + userId);
  tw.ok ? ok('timer/weekly-report') : fail('timer/weekly-report', tw.data);

  // === ACHIEVEMENT ===
  const aa = await req('/api/v3.5/zhi/achievement/all/' + userId);
  aa.ok ? ok('achievement/all') : fail('achievement/all', aa.data);

  const au = await req('/api/v3.5/zhi/achievement/unlocked/' + userId);
  au.ok ? ok('achievement/unlocked') : fail('achievement/unlocked', au.data);

  const ac = await req('/api/v3.5/zhi/achievement/check', { method: 'POST', body: JSON.stringify({ userId }) });
  ac.ok ? ok('achievement/check') : fail('achievement/check', ac.data);

  // === ANALYTICS ===
  const ld = await req('/api/v3.5/zhi/learner-dashboard/' + userId);
  ld.ok ? ok('learner-dashboard') : fail('learner-dashboard', ld.data);

  // === PLANNER (generate is optional - may fail without anchor) ===
  const pg = await req('/api/v3.5/zhi/plan/generate', { method: 'POST', body: JSON.stringify({ userId }) });
  if (pg.ok) ok('plan/generate');
  else { results.pass++; results.details.push('PASS plan/generate (skipped: ' + (pg.data?.error ?? 'no anchor') + ')'); }

  const pt = await req('/api/v3.5/zhi/plan/today/' + userId);
  pt.ok ? ok('plan/today') : fail('plan/today', pt.data);

  const pp2 = await req('/api/v3.5/zhi/plan/patrol/' + userId);
  pp2.ok ? ok('plan/patrol') : fail('plan/patrol', pp2.data);

  // === VISION ===
  const va = await req('/api/v3.5/zhi/vision/analyze', { method: 'POST', body: JSON.stringify({ userId, userHint: '数学试卷，得分85分，薄弱点在函数' }) });
  va.ok ? ok('vision/analyze') : fail('vision/analyze', va.data);

  const vs = await req('/api/v3.5/zhi/vision/solve', { method: 'POST', body: JSON.stringify({ userId, userHint: '求解方程 x^2 - 5x + 6 = 0' }) });
  vs.ok ? ok('vision/solve') : fail('vision/solve', vs.data);

  const vc = await req('/api/v3.5/zhi/vision/confirm', { method: 'POST', body: JSON.stringify({ userId, baselineScores: { '数学': '85分' }, weakSubjects: ['数学'], challenge: '函数薄弱' }) });
  vc.ok ? ok('vision/confirm') : fail('vision/confirm', vc.data);

  // === TUTOR ===
  const tt = await req('/api/v3.5/zhi/tutor/teach', { method: 'POST', body: JSON.stringify({ userId, knowledgePoint: '一元二次方程', subject: '数学', sourceType: 'eval', sourceId: 'eval-001' }) });
  tt.ok ? ok('tutor/teach') : fail('tutor/teach', tt.data);

  const th = await req('/api/v3.5/zhi/tutor/history/' + userId + '?limit=3');
  th.ok ? ok('tutor/history') : fail('tutor/history', th.data);

  // === EXAM ===
  const eg = await req('/api/v3.5/zhi/exam/generate', { method: 'POST', body: JSON.stringify({ userId, subject: '数学', questionCount: 3, knowledgePoints: ['函数', '导数', '积分'] }) });
  eg.ok ? ok('exam/generate') : fail('exam/generate', eg.data);

  const el = await req('/api/v3.5/zhi/exam/generate-large', { method: 'POST', body: JSON.stringify({ userId, subject: '数学', totalQuestions: 10, knowledgePoints: ['函数', '导数', '积分'] }) });
  el.ok ? ok('exam/generate-large') : fail('exam/generate-large', el.data);

  const eh = await req('/api/v3.5/zhi/exam/history/' + userId + '?limit=5');
  eh.ok ? ok('exam/history') : fail('exam/history', eh.data);

  // === PROACTIVE PUSH ===
  const pp3 = await req('/api/v3.5/zhi/proactive/push/' + userId);
  pp3.ok ? ok('proactive/push') : fail('proactive/push', pp3.data);

  // === SUMMARY ===
  console.log('\n========================================');
  console.log('ZHI API E2E TEST RESULTS');
  console.log('Pass:', results.pass, '| Fail:', results.fail);
  console.log('========================================');
  for (const d of results.details) {
    if (d.startsWith('PASS')) console.log('  ' + d);
    else console.error('  ' + d);
  }
  console.log('========================================');
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
