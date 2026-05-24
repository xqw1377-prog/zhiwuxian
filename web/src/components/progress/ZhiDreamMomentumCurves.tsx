import { motion } from 'framer-motion';
import type { DreamMomentumDto } from '../../lib/learning-progress-api';
import { ZhiLanguageSparkline } from './ZhiLanguageSparkline';
import { ZhiVideoStudySparkline } from './ZhiVideoStudySparkline';

export function ZhiDreamMomentumCurves({
  momentum,
  compact = true,
}: {
  momentum: DreamMomentumDto;
  compact?: boolean;
}) {
  return (
    <motion.div className={`grid grid-cols-2 gap-2 ${compact ? '' : 'border-t border-gray-950/80 pt-2'}`}>
      <motion.div>
        <p className={`mb-1 font-bold text-amber-400 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
          口语 7 日
          {momentum.speakingWeekDelta != null && (
            <span className="ml-1 text-gray-500">
              {momentum.speakingWeekDelta >= 0 ? '+' : ''}
              {momentum.speakingWeekDelta}
            </span>
          )}
        </p>
        <ZhiLanguageSparkline points={momentum.languageCurve7d} compact={compact} />
      </motion.div>
      <motion.div>
        <p className={`mb-1 font-bold text-violet-400 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
          视频 7 日
          <span className="ml-1 text-gray-500">{momentum.weekVideoCheckpoints} 卡点</span>
        </p>
        <ZhiVideoStudySparkline points={momentum.videoCurve7d} compact={compact} />
      </motion.div>
    </motion.div>
  );
}
