const BASE = 'http://localhost:3401';
const userId = 'd-b6a773f434';
async function t(path: string, init?: RequestInit) {
  const res = await fetch(BASE + path, { ...init, headers: { 'Content-Type': 'application/json' } });
  const json = await res.json();
  console.log(path, res.status, JSON.stringify(json).slice(0, 500));
}
(async () => {
  await t('/api/v3.5/zhi/mistake/batch', { method: 'POST', body: JSON.stringify({ userId, items: [{ subject: '数学', questionText: '测试', mistakeType: 'careless', knowledgeNode: '加法', source: 'test' }] }) });
  await t('/api/v3.5/zhi/mistake/list/' + userId + '?limit=5');
  await t('/api/v3.5/zhi/timer/weekly/' + userId);
  await t('/api/v3.5/zhi/achievement/list/' + userId);
  await t('/api/v3.5/zhi/plan/assessments/' + userId);
})();
