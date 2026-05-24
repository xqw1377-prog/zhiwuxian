import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchLearningTrend, type LearningTrend } from '../lib/zhi-trend-api';

function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const colors = {
    low: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40',
    medium: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/40',
    high: 'bg-red-900/30 text-red-400 border-red-700/40',
  };
  const labels = { low: '低风险', medium: '中等风险', high: '高风险' };
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${colors[level]}`}>
      {labels[level]}
    </span>
  );
}

function GaugeBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono text-gray-300">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

export function ZhiTrendPanel({ userId }: { userId: string }) {
  const [trend, setTrend] = useState<LearningTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchLearningTrend(userId).then((data) => {
      setTrend(data);
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return (
      <div className="animate-pulse rounded-lg bg-gray-900/50 p-4">
        <div className="mb-3 h-4 w-24 rounded bg-gray-800" />
        <div className="space-y-2">
          <div className="h-2 rounded bg-gray-800" />
          <div className="h-2 rounded bg-gray-800" />
        </div>
      </div>
    );
  }

  if (!trend) return null;

  return (
    <div className="rounded-lg border border-gray-800/60 bg-gray-900/30 p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-300">学习趋势</span>
          <RiskBadge level={trend.riskLevel} />
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          className="text-xs text-gray-500"
        >
          ▼
        </motion.span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 space-y-4 overflow-hidden"
          >
            <div className="space-y-2">
              <GaugeBar value={trend.momentum} label="学习动量" color="bg-emerald-500" />
              <GaugeBar value={trend.consistency * 100} label="学习连续性" color="bg-blue-500" />
              <GaugeBar value={trend.predictedCompletionRate * 100} label="预计完成率" color="bg-violet-500" />
            </div>

            {trend.insights.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">洞察</p>
                {trend.insights.map((insight, i) => (
                  <p key={i} className="text-[11px] leading-relaxed text-gray-400">
                    • {insight}
                  </p>
                ))}
              </div>
            )}

            {trend.recommendedActions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">建议</p>
                {trend.recommendedActions.map((action, i) => (
                  <p key={i} className="text-[11px] leading-relaxed text-emerald-400/80">
                    → {action}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
