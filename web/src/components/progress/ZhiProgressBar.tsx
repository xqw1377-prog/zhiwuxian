import { motion } from 'framer-motion';

export function ZhiProgressBar({
  label,
  currentPct,
  targetPct = 100,
  displayCurrent,
  displayTarget,
  unit,
  deltaPct,
  trend,
  compact = false,
  accent = '#00FF7F',
}: {
  label: string;
  currentPct: number;
  targetPct?: number;
  displayCurrent?: string;
  displayTarget?: string;
  unit?: string;
  deltaPct?: number;
  trend?: 'up' | 'down' | 'flat';
  compact?: boolean;
  accent?: string;
}) {
  const pct = Math.max(0, Math.min(100, currentPct));
  const delta =
    deltaPct != null && deltaPct !== 0
      ? `${deltaPct > 0 ? '+' : ''}${deltaPct}%`
      : null;
  const trendColor =
    trend === 'up' ? 'text-[#00FF7F]' : trend === 'down' ? 'text-[#FF4500]' : 'text-gray-600';

  return (
    <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
      <motion.div className="flex items-center justify-between gap-2 text-[9px]">
        <span className="truncate text-gray-400">{label}</span>
        <div className="flex shrink-0 items-center gap-1.5 font-mono">
          {displayCurrent != null && (
            <span className="text-white">
              {displayCurrent}
              {unit && displayCurrent !== '—' && displayCurrent !== '待录入' ? (
                <span className="text-gray-600"> {unit}</span>
              ) : null}
            </span>
          )}
          {displayTarget != null && (
            <span className="text-gray-600">
              / {displayTarget}
              {unit ? unit : ''}
            </span>
          )}
          <span className="font-bold" style={{ color: accent }}>
            {pct}%
          </span>
          {delta && <span className={trendColor}>{delta}</span>}
        </div>
      </motion.div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-gray-950">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: accent, width: `${pct}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
        {targetPct < 100 && (
          <motion.div
            className="absolute top-0 bottom-0 w-px bg-white/30"
            style={{ left: `${Math.min(100, targetPct)}%` }}
            title={`目标线 ${targetPct}%`}
          />
        )}
      </div>
    </div>
  );
}
