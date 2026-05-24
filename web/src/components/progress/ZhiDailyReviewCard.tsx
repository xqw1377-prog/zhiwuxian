import { motion } from 'framer-motion';
import type { DailyReviewDto } from '../../lib/zhi-daily-review-api';

export function ZhiDailyReviewCard({ review }: { review: DailyReviewDto }) {
  return (
    <div
      className="max-w-[92%] rounded-xl border border-[#FF4500]/25 bg-[#FF4500]/5 p-3 text-left text-[10px] text-gray-300"
      role="region"
      aria-label="每日复盘"
    >
      <p className="mb-2 text-[11px] font-bold text-[#FF4500]">
        每日复盘 · {review.reviewDate} · 梦校确定性 {review.dreamPct}%
        {review.dreamDelta !== 0 && (
          <span className={review.dreamDelta > 0 ? ' text-[#00FF7F]' : ' text-red-400'}>
            {' '}
            {review.dreamDelta > 0 ? '+' : ''}
            {review.dreamDelta}%
          </span>
        )}
      </p>

      {review.retrospective.length > 0 && (
        <>
          <p className="mb-1 text-[9px] uppercase tracking-widest text-gray-500">数据复盘</p>
          <ul className="mb-2 space-y-0.5 text-gray-400">
            {review.retrospective.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </>
      )}

      {review.subjectDeltas.length > 0 && (
        <>
          <p className="mb-1 text-[9px] uppercase tracking-widest text-gray-500">分科变化</p>
          <motion.div className="mb-2 flex flex-wrap gap-1">
            {review.subjectDeltas.map((s) => (
              <span
                key={s.id}
                className="rounded border border-gray-900 bg-black/40 px-2 py-0.5 text-[9px]"
              >
                {s.name} {s.progressPct}%
                {s.deltaPct !== 0 && (
                  <span className={s.deltaPct > 0 ? ' text-[#00FF7F]' : ' text-red-400'}>
                    {' '}
                    {s.deltaPct > 0 ? '+' : ''}
                    {s.deltaPct}%
                  </span>
                )}
              </span>
            ))}
          </motion.div>
        </>
      )}

      <p className="mb-1 text-[9px] uppercase tracking-widest text-gray-500">计划修正（P0/P1）</p>
      <ul className="mb-2 space-y-1.5">
        {review.planCorrections.map((c) => (
          <li
            key={`${c.subjectId}-${c.priority}-${c.dueBy}`}
            className="rounded border border-gray-900 bg-black/40 px-2 py-1"
          >
            <span className="text-[#FF4500]">[{c.priority}]</span> {c.subjectName}{' '}
            <span className="text-gray-500">· {c.dueBy}</span>
            <p className="mt-0.5 text-gray-400">{c.action}</p>
          </li>
        ))}
      </ul>

      {review.revisedMission && (
        <p className="mb-2 rounded border border-[#FF4500]/15 bg-black/30 px-2 py-1 text-[9px] text-gray-400">
          <span className="text-gray-500">今日战役 · </span>
          {review.revisedMission}
        </p>
      )}

      <p className="text-[8px] text-gray-600">
        左侧倒计时与分科进度条已同步；上传新试卷后会再次自动修正。
      </p>
    </div>
  );
}
