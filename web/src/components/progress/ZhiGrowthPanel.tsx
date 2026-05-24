import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useLearningProgress } from '../../context/LearningProgressContext';
import { useZhiChat } from '../../context/ZhiChatContext';
import { fetchLanguageMission, type LanguageTutorProgressDto } from '../../lib/zhi-language-api';
import { fetchVideoLearnContext, type VideoLearnContextDto } from '../../lib/video-learn-api';
import { ZhiProgressBar } from './ZhiProgressBar';
import { ZhiLanguageSparkline } from './ZhiLanguageSparkline';
import { ZhiEvolutionLedgerStrip } from './ZhiEvolutionLedgerStrip';
import { fetchEvolutionLedger, type EvolutionLedgerDto } from '../../lib/zhi-evolution-api';
import { onWuxianEventUntyped, WUXIAN_EVENTS } from '../../lib/wuxian-events';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ZhiGrowthPanel() {
  const { dashboard, loading } = useLearningProgress();
  const { userId } = useZhiChat();
  const [langProgress, setLangProgress] = useState<LanguageTutorProgressDto | null>(null);
  const [videoProgress, setVideoProgress] = useState<VideoLearnContextDto | null>(null);
  const [evolution, setEvolution] = useState<EvolutionLedgerDto | null>(null);
  const [evolutionLoading, setEvolutionLoading] = useState(false);
  const abilities = dashboard?.abilities ?? [];
  const outcomes = dashboard?.outcomes ?? [];

  useEffect(() => {
    if (!userId) return;
    const loadEvolution = () => {
      setEvolutionLoading(true);
      void fetchEvolutionLedger(userId)
        .then((e) => setEvolution(e))
        .finally(() => setEvolutionLoading(false));
    };
    loadEvolution();
    void fetchLanguageMission(userId).then((p) => {
      if (p?.progress) setLangProgress(p.progress);
    });
    void fetchVideoLearnContext(userId).then((v) => {
      if (v) setVideoProgress(v);
    });
    const onRefresh = () => {
      loadEvolution();
      void fetchLanguageMission(userId).then((pack) => {
        if (pack?.progress) setLangProgress(pack.progress);
      });
      void fetchVideoLearnContext(userId).then((v) => {
        if (v) setVideoProgress(v);
      });
    };
    const off = onWuxianEventUntyped(WUXIAN_EVENTS.directoriesRefresh, onRefresh);
    return off;
  }, [userId]);

  return (
    <motion.div className="space-y-4">
      <ZhiEvolutionLedgerStrip ledger={evolution} loading={evolutionLoading} />

      <div>
        <p className="mb-2 text-[10px] font-black tracking-widest text-[#00FF7F]">能力增长</p>
        {loading && abilities.length === 0 ? (
          <p className="text-[9px] text-gray-600">同步中…</p>
        ) : (
          <div className="space-y-2.5">
            {abilities.map((a) => (
              <ZhiProgressBar
                key={a.id}
                label={a.label}
                currentPct={a.value}
                displayCurrent={String(a.value)}
                displayTarget="99"
                unit=""
                deltaPct={a.delta}
                trend={a.delta > 0 ? 'up' : 'flat'}
                accent="#7CFFCB"
              />
            ))}
          </div>
        )}
      </div>

      {langProgress && (
        <div className="border-t border-gray-950 pt-3">
          <p className="mb-2 text-[10px] font-black tracking-widest text-amber-400">口语 7 日曲线</p>
          <ZhiLanguageSparkline points={langProgress.curve7d} compact />
          <p className="mt-1 text-[8px] text-gray-600">
            {langProgress.levelBand} · 估分 {langProgress.speakingEst}/30
            {langProgress.streakDays > 0 ? ` · 连续 ${langProgress.streakDays} 天` : ''}
          </p>
        </div>
      )}

      {videoProgress && videoProgress.totalCheckpoints > 0 && (
        <div className="border-t border-gray-950 pt-3">
          <p className="mb-2 text-[10px] font-black tracking-widest text-violet-400">视频学习</p>
          <p className="text-[9px] text-gray-500">
            累计卡点 {videoProgress.totalCheckpoints} · 侧重 {videoProgress.focusSubject}
          </p>
          <div className="mt-2 flex h-8 items-end gap-0.5">
            {videoProgress.studyCurve7d.map((d: { date: string; checkpoints: number }) => (
              <motion.div
                key={d.date}
                title={`${d.date.slice(5)}: ${d.checkpoints} 次`}
                className="flex-1 rounded-t bg-violet-500/40"
                style={{ height: `${Math.max(8, (d.checkpoints / 3) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      )}

      <motion.div className="border-t border-gray-950 pt-3">
        <p className="mb-2 text-[10px] font-black tracking-widest text-[#FF4500]">知识成果汇总</p>
        {outcomes.length === 0 ? (
          <p className="text-[9px] leading-relaxed text-gray-600">
            拍照拦截、视频卡点、文书片段写入云目录后，会在此汇总你的可验证成果。
          </p>
        ) : (
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {outcomes.map((o) => (
              <li
                key={o.id}
                className="rounded-lg border border-gray-950 bg-[#0B0C10] px-2 py-1.5 text-[9px]"
              >
                <p className="truncate font-medium text-gray-200">{o.title}</p>
                <p className="mt-0.5 flex justify-between gap-2 text-gray-600">
                  <span>{o.source}</span>
                  <span className="shrink-0">{formatTime(o.at)}</span>
                </p>
                {o.tag && (
                  <span className="mt-0.5 inline-block rounded border border-gray-800 px-1 text-[8px] text-gray-500">
                    {o.tag}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </motion.div>
  );
}
