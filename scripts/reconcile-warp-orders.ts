/**
 * 支付订单 vs Warp 账本对账（商用巡检）
 * 用法：npx tsx scripts/reconcile-warp-orders.ts [--fix]
 */

import { getLearningDb } from '../server/wuxian-learning-db';
import { getBillingStatus } from '../src/services/billing-hub';

const fix = process.argv.includes('--fix');

function main(): void {
  getLearningDb();
  const db = getLearningDb();

  const paid = db.prepare(`
    SELECT id, user_id, product_id, amount_cny, paid_at
    FROM payment_orders WHERE status = 'PAID'
    ORDER BY paid_at DESC LIMIT 500
  `).all() as Array<{
    id: string;
    user_id: string;
    product_id: string;
    amount_cny: number;
    paid_at: string | null;
  }>;

  const issues: string[] = [];
  let ok = 0;

  for (const o of paid) {
    const bill = getBillingStatus(o.user_id);
    const warp = bill.availableWarpPoints;
    if (warp < 0) {
      issues.push(`订单 ${o.id} 用户 ${o.user_id} Warp 余额异常: ${warp}`);
      continue;
    }
    ok += 1;
  }

  const pendingStale = db.prepare(`
    SELECT COUNT(*) as c FROM payment_orders
    WHERE status = 'PENDING' AND created_at < datetime('now', '-2 days')
  `).get() as { c: number };

  console.log('--- WUXIAN 支付对账 ---');
  console.log(`已支付订单: ${paid.length}，抽检通过: ${ok}`);
  console.log(`超时未付 PENDING (>2天): ${pendingStale.c}`);

  if (issues.length) {
    console.log('\n异常:');
    for (const i of issues) console.log(' ', i);
  } else {
    console.log('\n未发现 Warp 余额异常（抽检）');
  }

  if (fix && pendingStale.c > 0) {
    const r = db.prepare(`
      UPDATE payment_orders SET status = 'FAILED'
      WHERE status = 'PENDING' AND created_at < datetime('now', '-7 days')
    `).run();
    console.log(`已标记过期 PENDING 为 FAILED: ${r.changes}`);
  }

  process.exit(issues.length ? 1 : 0);
}

main();
