/**
 * WUXIAN · HTTP 层真实 URL 联调（quantum assimilate 全链路）
 */

const BASE = process.env.WUXIAN_E2E_BASE ?? 'http://localhost:3401';
const VIDEO_URL = process.env.WUXIAN_E2E_VIDEO_URL ?? 'https://www.bilibili.com/video/BV1GJ411x7h7';

async function main() {
  const userId = 'http-real-url-e2e';

  console.log('\n═══ HTTP 真实 URL 全链路 ═══\n');

  const statusRes = await fetch(`${BASE}/api/v1/video/pipeline/status`);
  const statusJson = await statusRes.json();
  console.log('[pipeline/status]', JSON.stringify(statusJson.data, null, 2));

  const assimilateRes = await fetch(`${BASE}/api/v1/quantum/assimilate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      rawInput: `30天学会深度学习，先看这个视频 ${VIDEO_URL}`,
    }),
  });
  const assimilateJson = await assimilateRes.json();
  const d = assimilateJson.data;

  if (!d?.success) {
    console.error('❌ assimilate failed:', JSON.stringify(assimilateJson, null, 2));
    process.exit(1);
  }

  console.log('\n[quantum/assimilate]');
  console.log('  sessionId:', d.sessionId);
  console.log('  folded:', d.folded);
  console.log('  nodes:', d.roadmapNodes?.length ?? 0);
  (d.roadmapNodes ?? []).forEach((n: { phase: string; title: string }) => {
    console.log(`    · ${n.phase}: ${n.title}`);
  });

  const courseId = d.sessionId?.startsWith('course-') ? d.sessionId : `course-yt-BV1GJ411x7h7`;
  const graphRes = await fetch(`${BASE}/api/v1/course/${encodeURIComponent(courseId)}/graph`);
  const graphJson = await graphRes.json();
  const nodes = graphJson.data?.nodes ?? graphJson.data?.knowledgeNodes ?? [];

  console.log('\n[course/graph]');
  console.log('  courseId:', courseId);
  console.log('  nodeCount:', Array.isArray(nodes) ? nodes.length : 0);

  if (!Array.isArray(nodes) || nodes.length < 3) {
    console.error('❌ knowledge_nodes < 3');
    process.exit(1);
  }

  const walletRes = await fetch(`${BASE}/api/v1/wallet/${userId}`);
  const walletJson = await walletRes.json();
  console.log('\n[wallet] warp minutes:', walletJson.data?.availableWarpMinutes);

  console.log('\n✅ HTTP 真实 URL 全链路通过\n');
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
