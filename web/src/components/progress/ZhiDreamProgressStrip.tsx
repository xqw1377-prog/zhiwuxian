import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLearningProgress } from '../../context/LearningProgressContext';
import { ZhiProgressBar } from './ZhiProgressBar';
import { ZhiDreamMomentumCurves } from './ZhiDreamMomentumCurves';

export function ZhiDreamProgressStrip() {
  const { dashboard, loading } = useLearningProgress();
  const dream = dashboard?.dream;
  const momentum = dashboard?.momentum;

  const countdownPct = useMemo(() => {
    if (!dream) return 0;
    const total = Math.max(dream.daysRemaining, 365);
    return Math.max(2, Math.min(98, Math.round((1 - dream.daysRemaining / total) * 100)));
  }, [dream]);

  if (loading && !dream) {
    return (
      <motion.div className="mb-3 rounded-xl border border-gray-950 bg-black/40 px-3 py-2 text-[9px] text-gray-600">
        梦想进度同步中…
      </motion.div>
    );
  }

  if (!dream) return null;

  return (
    <motion.div className="mb-3 space-y-2.5 rounded-xl border border-[#00FF7F]/20 bg-[#00FF7F]/5 px-3 py-2.5">
      <motion.div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold tracking-widest text-[#00FF7F]">梦想进度</span>
        <span className="font-mono text-[9px] text-gray-500">
          {dream.targetSchool} · 距入学 <span className="text-white">{dream.daysRemaining}</span> 天
        </span>
      </motion.div>

      <motion.div className="space-y-1">
        <motion.div className="flex justify-between text-[8px] text-gray-600">
          <span>梦校倒计时</span>
          <span>{dream.targetApplyAt}</span>
        </motion.div>
        <motion.div className="relative h-1.5 overflow-hidden rounded-full bg-gray-950">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#00FF7F]/40 to-[#00FF7F]"
            style={{ width: `${countdownPct}%` }}
          />
        </motion.div>
      </motion.div>

      <ZhiProgressBar
        label="梦校确定性"
        currentPct={dream.certaintyPct}
        targetPct={100}
        displayCurrent={`${dream.certaintyPct}`}
        displayTarget="100"
        unit="%"
        deltaPct={dream.delta7d}
        trend={dream.delta7d > 0 ? 'up' : dream.delta7d < 0 ? 'down' : 'flat'}
        accent="#00FF7F"
      />
      <ZhiProgressBar
        label="里程碑合流"
        currentPct={dream.milestonePct}
        targetPct={100}
        displayCurrent={`${dream.milestonePct}`}
        displayTarget="100"
        unit="%"
        compact
        accent="#39FF14"
      />

      {momentum && (
        <motion.div className="border-t border-gray-950/80 pt-2">
          <ZhiDreamMomentumCurves momentum={momentum} compact />
        </motion.div>
      )}

      {momentum && <p className="text-[8px] leading-relaxed text-gray-500">{momentum.momentumHint}</p>}
      <p className="text-[8px] text-gray-600">
        命运阻力 {dream.challengeIndex}%
        {dream.activePhase ? ` · 当前节点：${dream.activePhase}` : ''}
      </p>
    </motion.div>
  );
}
