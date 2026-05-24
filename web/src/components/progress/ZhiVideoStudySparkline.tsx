import { motion } from 'framer-motion';

type Point = { date: string; checkpoints: number };

export function ZhiVideoStudySparkline({
  points,
  compact = false,
}: {
  points: Point[];
  compact?: boolean;
}) {
  const total = points.reduce((a, p) => a + p.checkpoints, 0);
  if (total === 0) {
    return (
      <p className={`text-gray-600 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
        近 7 日暂无视频卡点，完成陪看后显示柱图。
      </p>
    );
  }

  const max = Math.max(1, ...points.map((p) => p.checkpoints));

  return (
    <motion.div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <motion.div className={`flex items-end gap-0.5 ${compact ? 'h-7' : 'h-10'}`}>
        {points.map((d) => (
          <motion.div
            key={d.date}
            title={`${d.date.slice(5)}: ${d.checkpoints} 次`}
            className="flex-1 rounded-t bg-violet-500/50"
            style={{ height: `${Math.max(12, (d.checkpoints / max) * 100)}%` }}
          />
        ))}
      </motion.div>
      <p className={`flex justify-between text-gray-500 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
        <span>
          {points[0]?.date.slice(5)} → {points[points.length - 1]?.date.slice(5)}
        </span>
        <span className="text-violet-300">7 日 {total} 卡点</span>
      </p>
    </motion.div>
  );
}
