import { motion } from 'framer-motion';
import { useLearningProgress } from '../../context/LearningProgressContext';
import { ZhiProgressBar } from './ZhiProgressBar';

export function ZhiSidebarSubjectTracks() {
  const { dashboard } = useLearningProgress();
  const subjects = dashboard?.subjects ?? [];

  if (subjects.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-gray-950 bg-black/50 p-2.5">
      <p className="px-0.5 text-[9px] font-bold uppercase tracking-widest text-gray-500">
        // 分科进度（细粒度）
      </p>
      <div className="max-h-48 space-y-2 overflow-y-auto pr-0.5">
        {subjects.map((s) => (
          <ZhiProgressBar
            key={s.id}
            label={s.name}
            currentPct={s.progressPct}
            displayCurrent={s.displayCurrent}
            displayTarget={s.displayTarget}
            unit={s.unit}
            deltaPct={s.deltaPct}
            trend={s.trend}
            compact
          />
        ))}
      </div>
    </div>
  );
}
