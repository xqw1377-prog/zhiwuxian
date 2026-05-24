async function main() {
  const BASE = 'http://localhost:3401';
  const boot = await (await fetch(BASE + '/api/v1/auth/bootstrap', { method: 'POST', body: JSON.stringify({ deviceId: 'exam-eval', displayName: 'exam' }), headers: { 'Content-Type': 'application/json' } })).json();
  const userId = boot.data.userId;
  const token = boot.data.token;
  const auth = (init?: RequestInit) => ({ ...init, headers: { ...init?.headers as any, 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } });
  const r = async (path: string, init?: RequestInit) => { const res = await fetch(BASE + path, auth(init)); return { ok: res.ok, status: res.status, body: await res.json() }; };

  // Generate exam
  const g = await r('/api/v3.5/zhi/exam/generate', { method: 'POST', body: JSON.stringify({ userId, subject: '数学', questionCount: 3, knowledgePoints: ['函数', '导数', '积分'] }) });
  const examId = g.body.data?.examId;
  console.log('exam/generate:', g.ok, 'examId:', examId);

  if (!examId) { console.log('No examId, exiting'); return; }

  // Start exam
  const s = await r('/api/v3.5/zhi/exam/' + examId + '/start', { method: 'POST', body: JSON.stringify({ userId }) });
  console.log('exam/start:', s.ok, JSON.stringify(s.body).slice(0, 200));

  // Get questions
  const q = await r('/api/v3.5/zhi/exam/' + examId + '/questions');
  console.log('exam/questions:', q.ok, 'count:', q.body.data?.questions?.length ?? q.body.data?.items?.length ?? '?');

  // Get paginated (page 1)
  const qp = await r('/api/v3.5/zhi/exam/' + examId + '/questions?page=1&pageSize=2');
  console.log('exam/questions paginated:', qp.ok, 'page:', qp.body.data?.page, 'items:', qp.body.data?.items?.length);

  // Get progress
  const pr = await r('/api/v3.5/zhi/exam/' + examId + '/progress');
  console.log('exam/progress:', pr.ok, JSON.stringify(pr.body.data).slice(0, 150));

  // Submit batch answers
  const ans = await r('/api/v3.5/zhi/exam/' + examId + '/answers', { method: 'POST', body: JSON.stringify({ userId, answers: [{ questionIndex: 0, answer: 'A' }, { questionIndex: 1, answer: 'B' }, { questionIndex: 2, answer: 'C' }] }) });
  console.log('exam/batch-answers:', ans.ok, JSON.stringify(ans.body.data).slice(0, 150));

  // Grade
  const gr = await r('/api/v3.5/zhi/exam/' + examId + '/grade', { method: 'POST', body: JSON.stringify({ userId }) });
  console.log('exam/grade:', gr.ok, 'score:', gr.body.data?.score, 'total:', gr.body.data?.total);

  // Large exam
  const lg = await r('/api/v3.5/zhi/exam/generate-large', { method: 'POST', body: JSON.stringify({ userId, subject: '数学', totalQuestions: 10, knowledgePoints: ['函数', '导数'] }) });
  const largeId = lg.body.data?.examId;
  console.log('exam/generate-large:', lg.ok, 'largeId:', largeId, 'count:', lg.body.data?.totalQuestions);

  if (largeId) {
    const lq1 = await r('/api/v3.5/zhi/exam/' + largeId + '/questions?page=1&pageSize=5');
    console.log('large questions page 1:', lq1.ok, 'count:', lq1.body.data?.items?.length, 'total:', lq1.body.data?.total);
    const lq2 = await r('/api/v3.5/zhi/exam/' + largeId + '/questions?page=2&pageSize=5');
    console.log('large questions page 2:', lq2.ok, 'count:', lq2.body.data?.items?.length);
  }

  // Check achievement
  const ac = await r('/api/v3.5/zhi/achievement/check', { method: 'POST', body: JSON.stringify({ userId, category: 'mistake', progressValue: 3 }) });
  console.log('achievement/check:', ac.ok, JSON.stringify(ac.body.data).slice(0, 150));

  // Tutor checkpoint
  const tt = await r('/api/v3.5/zhi/tutor/teach', { method: 'POST', body: JSON.stringify({ userId, knowledgePoint: '一元二次方程', subject: '数学', sourceType: 'eval', sourceId: 'eval-002' }) });
  const lessonId = tt.body.data?.id;
  console.log('tutor/teach (for checkpoint):', tt.ok, 'lessonId:', lessonId);

  if (lessonId) {
    const cp = await r('/api/v3.5/zhi/tutor/lesson/' + userId + '/' + lessonId + '/checkpoint', { method: 'POST', body: JSON.stringify({ userId, answer: tt.body.data.checkpointOptions?.[0] || 'A' }) });
    console.log('tutor/checkpoint submit:', cp.ok, 'passed:', cp.body.data?.passed, 'correct:', cp.body.data?.correctAnswer);
  }

  console.log('\n=== ALL EXAM/TUTOR TESTS COMPLETE ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
