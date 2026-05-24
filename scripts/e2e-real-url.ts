/**
 * WUXIAN · 真实 URL 联调脚本
 * npx tsx scripts/e2e-real-url.ts [youtube-url]
 */

import { getLearningDb } from '../server/wuxian-learning-db';
import { ingestVideoFromUrl, getPipelineStatus } from '../server/video-pipeline';
import { syncAssimilationToLearningGraph } from '../server/video-pointer-api';

const TEST_URL = process.argv[2]
  ?? process.env.WUXIAN_E2E_VIDEO_URL
  ?? 'https://www.bilibili.com/video/BV1GJ411x7h7';

async function main() {
  const userId = 'real-url-e2e';
  const goalId = `goal-${Date.now().toString(36)}`;

  console.log('\n═══ WUXIAN 真实 URL 联调 ═══\n');
  console.log('URL:', TEST_URL);

  const status = await getPipelineStatus();
  console.log('\n[管线状态]');
  console.log(`  yt-dlp: ${status.ytDlp.available ? '✅' : '❌'} ${status.ytDlp.version ?? ''} (${status.ytDlp.invoker ?? 'n/a'})`);
  console.log(`  DeepSeek: ${status.deepseek.configured ? '✅' : '⚠️ 未配置，将启发式分块'} model=${status.deepseek.model}`);

  if (!status.ytDlp.available) {
    console.error('\n❌ yt-dlp 不可用，请先: pip install yt-dlp');
    process.exit(1);
  }

  console.log('\n[1/3] 拉取元数据 + 语义分块...');
  const ingested = await ingestVideoFromUrl(TEST_URL, goalId);
  console.log(`  source: ${ingested.source}`);
  console.log(`  title: ${ingested.payload.title}`);
  console.log(`  duration: ${ingested.durationMinutes} min`);
  console.log(`  nodes: ${ingested.knowledgeNodes.length}`);
  ingested.knowledgeNodes.forEach((n, i) => {
    console.log(`    ${i + 1}. [${n.timestampStart}s-${n.timestampEnd}s] ${n.title} (load=${n.cognitiveLoadScore})`);
  });

  if (ingested.source === 'fallback' || ingested.source === 'heuristic') {
    console.error('\n❌ 未走真实 yt-dlp 管线');
    process.exit(1);
  }

  console.log('\n[2/3] 写入 knowledge_nodes...');
  const graph = syncAssimilationToLearningGraph({
    userId,
    videoId: ingested.payload.videoId,
    title: ingested.payload.title,
    sourceUrl: TEST_URL,
    estimatedDurationMin: ingested.durationMinutes,
    cells: ingested.knowledgeNodes.map(n => ({
      id: n.id,
      name: n.title,
      timestampStart: n.timestampStart,
      timestampEnd: n.timestampEnd,
      densityScore: n.cognitiveLoadScore,
    })),
  });
  console.log(`  courseId: ${graph.courseId}`);
  console.log(`  nodeCount: ${graph.nodeCount}`);

  console.log('\n[3/3] SQLite 回查验证...');
  const db = getLearningDb();
  const versionRow = db.prepare(`SELECT active_version_id FROM courses WHERE id = ?`).get(graph.courseId) as {
    active_version_id: string | null;
  } | undefined;
  const activeVersion = versionRow?.active_version_id ?? null;

  const rows = (activeVersion
    ? db.prepare(`
      SELECT node_index, title, video_timestamp_start, video_timestamp_end, cognitive_load
      FROM knowledge_nodes WHERE course_id = ? AND version_id = ? ORDER BY node_index
    `).all(graph.courseId, activeVersion)
    : db.prepare(`
      SELECT node_index, title, video_timestamp_start, video_timestamp_end, cognitive_load
      FROM knowledge_nodes WHERE course_id = ? AND version_id IS NULL ORDER BY node_index
    `).all(graph.courseId)
  ) as Array<{
    node_index: number;
    title: string;
    video_timestamp_start: number;
    video_timestamp_end: number;
    cognitive_load: number;
  }>;

  if (rows.length < 3) {
    console.error(`\n❌ knowledge_nodes 数量不足: ${rows.length}（期望 ≥3）`);
    process.exit(1);
  }

  rows.forEach(r => {
    console.log(`  #${r.node_index} ${r.title} [${r.video_timestamp_start}-${r.video_timestamp_end}s] load=${r.cognitive_load}`);
  });

  const sourceOk = ingested.source === 'yt-dlp+llm' || ingested.source === 'yt-dlp+heuristic';
  console.log(`\n✅ 真实 URL 联调通过 · source=${ingested.source}`);
  if (!status.deepseek.configured && ingested.source === 'yt-dlp+heuristic') {
    console.log('ℹ️  配置 DEEPSEEK_API_KEY 可升级为 yt-dlp+llm 语义分块');
  }
  if (!sourceOk) process.exit(1);
}

main().catch((err) => {
  console.error('\n❌ 联调失败:', err instanceof Error ? err.message : err);
  process.exit(1);
});
