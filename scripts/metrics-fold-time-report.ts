/**
 * CLI：折叠时间 / QAL 报告（复用 admin-fold-time-metrics 服务）
 *
 * npm run metrics:fold-time
 * npm run metrics:fold-time -- --userId=xxx
 */

import {
  getAdminFoldTimeUserMetrics,
  queryAdminFoldTimePlatform,
} from '../src/services/admin-fold-time-metrics';
import { getLearningDbPath, getDataDir } from '../server/data-path';
import path from 'path';

function main() {
  const arg = process.argv.find((a) => a.startsWith('--userId='));
  const userId = arg?.split('=')[1]?.trim();

  console.log(`[metrics] DB: ${path.resolve(getLearningDbPath())} (dataDir=${getDataDir()})`);
  console.log('\n=== WUXIAN · 折叠时间指标报告 ===\n');

  if (userId) {
    console.log(JSON.stringify(getAdminFoldTimeUserMetrics(userId), null, 2));
    return;
  }

  const summary = queryAdminFoldTimePlatform(80);
  console.log('【平台摘要】');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\n【队列说明】L0=无航标 L1=无交卷 L2=有交卷 L3=高完备+≥2交卷');
  console.log('【核心 OKR · QAL】');
  console.log(JSON.stringify(summary.okr, null, 2));
  console.log('\n详细定义见 docs/metrics-fold-time.md §10\n');
  console.log('【L2/L3 折叠效率 Top 10】');
  console.table(
    summary.topUsers.slice(0, 10).map((r) => ({
      userId: r.userId,
      cohort: r.cohort,
      fold: r.foldEfficiencyIndex,
      qal: r.qualifiedActiveLearner,
    })),
  );
}

main();
