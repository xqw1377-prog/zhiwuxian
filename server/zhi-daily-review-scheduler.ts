/**
 * ZHI · 每日复盘定时生成（有梦校航标的用户，按自然日自动跑批）
 */

import { runDailyReviewBatch } from '../src/services/zhi-daily-review-engine';

const INTERVAL_MS = 6 * 60 * 60 * 1000;

export function scheduleZhiDailyReview(): void {
  const run = () => {
    try {
      const n = runDailyReviewBatch(80);
      if (n > 0) {
        console.log(`[ZHI DailyReview] 已自动生成 ${n} 份今日复盘与计划修正`);
      }
    } catch (err) {
      console.error('[ZHI DailyReview] 批处理失败', err);
    }
  };

  setTimeout(run, 15_000);
  setInterval(run, INTERVAL_MS).unref?.();
}
