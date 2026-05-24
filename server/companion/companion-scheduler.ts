/**
 * 亲密陪伴 · 深夜战报批处理（与 ZHI 每日复盘并行）
 */

import { runCompanionDailyBatch } from './companion-daily-synth';

const INTERVAL_MS = 6 * 60 * 60 * 1000;

export function scheduleCompanionDailyReports(): void {
  const run = () => {
    try {
      const n = runCompanionDailyBatch(80);
      if (n > 0) {
        console.log(`[陪伴中台] 深夜战报已生成 ${n} 份（待推微信 Gateway）`);
      }
    } catch (err) {
      console.error('[陪伴中台] 批处理失败', err);
    }
  };

  setTimeout(run, 25_000);
  setInterval(run, INTERVAL_MS).unref?.();
}
