/**
 * 按梦校航标重算 PINNED 认知目录（删除与当前 pathway 冲突的托福/AP 等）
 *
 * 用法：
 *   npx tsx scripts/migrate-pathway.ts --userId=xxx
 *   npx tsx scripts/migrate-pathway.ts --all
 *   npm run migrate:pathway -- --all
 */

import '../server/load-env';
import { bootstrapDatabase } from '../server/bootstrap-database';
import {
  listAnchorUserIds,
  migrateAllAnchoredUsers,
  migrateUserPathway,
} from '../src/services/pathway-migrate';

function parseArgs(argv: string[]): { userId?: string; all: boolean } {
  let userId: string | undefined;
  let all = false;
  for (const a of argv) {
    if (a === '--all') all = true;
    else if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim();
    else if (a.startsWith('--user=')) userId = a.slice('--user='.length).trim();
  }
  return { userId, all };
}

async function main() {
  bootstrapDatabase();
  const { userId, all } = parseArgs(process.argv.slice(2));

  if (!all && !userId) {
    console.error('请指定 --userId=<id> 或 --all');
    process.exit(1);
  }

  const results = all
    ? migrateAllAnchoredUsers()
    : (() => {
        const r = migrateUserPathway(userId!);
        return r ? [r] : [];
      })();

  if (results.length === 0) {
    console.log('未找到可迁移用户（需已完成梦校航标）。');
    process.exit(1);
  }

  console.log('\n═══ WUXIAN pathway migrate ═══\n');
  for (const r of results) {
    console.log(`用户 ${r.userId}`);
    console.log(`  梦校 ${r.school} · ${r.major}`);
    console.log(`  路径 ${r.pathwayLabel} (${r.pathway})`);
    console.log(`  已移除 PINNED 后缀: ${r.droppedSuffixes.join(', ') || '(无)'}`);
    console.log('');
  }
  console.log(`完成：${results.length} 个用户。请刷新驾驶舱或重新打开目录侧栏。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
