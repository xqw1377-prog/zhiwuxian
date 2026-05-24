import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../lib/api-auth';
import { unwrapEnvelope } from '../lib/api-envelope';
import { postZhiIntrusion, zhiIntrusionMentorText, type ZhiIntrusionDto } from '../lib/zhi-intrusion-api';
import { fetchEvolutionLedger } from '../lib/zhi-evolution-api';
import { fetchLearnerDashboard, type LearnerDashboardDto } from '../lib/zhi-analytics-api';
import { fetchAllAchievements, fetchUnlockedAchievements, type AchievementDto } from '../lib/zhi-achievement-api';
import { AnimatePresence, motion } from 'framer-motion';

type Matrix = 'KNOWLEDGE' | 'LANGUAGE' | 'EVOLUTION';

type OrchestratorResp = {
  success: boolean;
  shouldTrigger: boolean;
  stage: 'TARGET' | 'BASELINE' | 'DASHBOARD';
  mentorText: string;
  activeTool: 'NONE' | 'VISION_INTERCEPT' | 'METRICS_INPUT' | 'PATH_RECONFIG';
  remainingWarp: number;
  chargedWarp: number;
};

export function ZhiLifeMatrix(props: { userId: string; compact?: boolean }) {
  const { t } = useTranslation();
  const { userId, compact = false } = props;
  const [warpPoints, setWarpPoints] = useState(0);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [activeMatrix, setActiveMatrix] = useState<Matrix>('KNOWLEDGE');
  const [zhiWhisper, setZhiWhisper] = useState(
    t('lifeMatrix.defaultWhisper'),
  );
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [dashboard, setDashboard] = useState<LearnerDashboardDto | null>(null);
  const [allAchievements, setAllAchievements] = useState<AchievementDto[]>([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState<AchievementDto[]>([]);

  const fetchWarp = () => {
    authFetch(`/api/v1/relay/status/${encodeURIComponent(userId)}`)
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        const d = unwrapEnvelope<{ warpPoints?: number }>(j);
        if (typeof d?.warpPoints === 'number') setWarpPoints(Math.round(d.warpPoints));
      })
      .catch(() => {});
  };

  const fetchChallengeIndex = () => {
    void fetchEvolutionLedger(userId).then((ledger) => {
      if (!ledger) return;
      setWarpPoints(ledger.warpPoints);
      setChallengeIndex(ledger.challengeIndex);
      if (ledger.coachLine.trim()) setZhiWhisper(ledger.coachLine.trim());
    });
    authFetch(`/api/v3.5/mentor/intervene?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        const d = unwrapEnvelope<{ shouldTrigger?: boolean; challengeIndex?: number; mentorOpening?: string }>(j);
        if (typeof d?.challengeIndex === 'number') setChallengeIndex(Math.round(d.challengeIndex));
        if (typeof d?.mentorOpening === 'string' && d.mentorOpening.trim()) setZhiWhisper(d.mentorOpening.trim());
      })
      .catch(() => {});
  };

  const callOrchestrator = async (userText: string, force = true): Promise<OrchestratorResp> => {
    const d = await postZhiIntrusion({ userId, userFeedback: userText, force });
    return zhiIntrusionToOrchestrator(d);
  };

  function zhiIntrusionToOrchestrator(d: ZhiIntrusionDto): OrchestratorResp {
    const tool = String(d.activeTool ?? d.activatedTool ?? 'NONE').toUpperCase();
    const activeTool: OrchestratorResp['activeTool'] =
      tool === 'VISION_INTERCEPT' || tool === 'METRICS_INPUT' || tool === 'PATH_RECONFIG'
        ? tool
        : 'NONE';
    return {
      success: d.success ?? true,
      shouldTrigger: d.shouldTrigger ?? Boolean(zhiIntrusionMentorText(d)),
      stage: (d.stage as OrchestratorResp['stage']) ?? 'DASHBOARD',
      mentorText: zhiIntrusionMentorText(d),
      activeTool,
      remainingWarp: Number(d.remainingWarp ?? d.warpPointsRemaining ?? 0),
      chargedWarp: Number(d.chargedWarp ?? d.warpDeducted ?? 0),
    };
  }

  useEffect(() => {
    fetchWarp();
    fetchChallengeIndex();
    void (async () => {
      try {
        const [dash, allA, unlockedA] = await Promise.all([
          fetchLearnerDashboard(userId),
          fetchAllAchievements(userId),
          fetchUnlockedAchievements(userId),
        ]);
        setDashboard(dash);
        setAllAchievements(allA);
        setUnlockedAchievements(unlockedA);
      } catch { /* silently fail */ }
    })();
    const t = setInterval(() => {
      fetchWarp();
      fetchChallengeIndex();
    }, 15000);
    return () => clearInterval(t);
  }, [userId]);

  const bills = useMemo(() => ([
    { label: t('lifeMatrix.billSpeech'), cost: -8 },
    { label: t('lifeMatrix.billEscape'), cost: -10 },
    { label: t('lifeMatrix.billAp'), cost: -2 },
  ]), []);

  const action = async (text: string) => {
    if (loading) return;
    setLoading(true);
    setStatusMsg('');
    try {
      const d = await callOrchestrator(text, true);
      if (d.mentorText) setZhiWhisper(d.mentorText);
      if (typeof d.remainingWarp === 'number') setWarpPoints(Math.round(d.remainingWarp));
      if (d.activeTool === 'VISION_INTERCEPT') setActiveMatrix('KNOWLEDGE');
      if (d.activeTool === 'METRICS_INPUT') setActiveMatrix('EVOLUTION');
      if (d.activeTool === 'PATH_RECONFIG') setActiveMatrix('EVOLUTION');
      fetchChallengeIndex();
    } catch (err: any) {
      setStatusMsg(String(err?.message ?? t('lifeMatrix.dispatchFail')));
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <div className="space-y-3">
        <p className="text-[10px] leading-relaxed text-gray-400">{zhiWhisper}</p>
        <div className="flex gap-2 text-[9px] text-gray-500">
          <span>{t('lifeMatrix.resistance', { pct: challengeIndex })}</span>
          <span>{warpPoints} Warp</span>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void action(t('lifeMatrix.recomputeAction'))}
          className="w-full rounded-lg border border-[#FF4500]/40 py-2 text-[10px] font-bold text-[#FF4500] hover:bg-[#FF4500]/10 disabled:opacity-50"
        >
          {loading ? t('lifeMatrix.computing') : t('lifeMatrix.recomputeButton')}
        </button>
        {statusMsg && <p className="text-[9px] text-gray-600">{statusMsg}</p>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-4 font-mono select-none text-left">
      <div className="bg-[#050608] border-2 border-[#00FF7F]/40 rounded-2xl p-6 shadow-[0_0_50px_rgba(0,255,127,0.08)] space-y-6 relative overflow-hidden">
        <div className="flex justify-between items-center border-b border-gray-950 pb-3 text-[10px]">
          <div className="flex items-center space-x-2 text-[#00FF7F]">
            <span className="w-2 h-2 rounded-full bg-[#00FF7F] animate-pulse" />
            <span className="font-black tracking-widest">ZHI WUXIAN // AI COGNITIVE LIFE</span>
          </div>

          <div className="bg-[#0B0C10] px-3 py-1 rounded border border-gray-900 text-gray-400 text-[9px] flex items-center space-x-1.5">
            <span>{t('lifeMatrix.warpLabel')}</span>
            <span className="text-[#00FF7F] font-bold">{warpPoints} Warp</span>
          </div>
        </div>

        <div className="bg-[#0B0C10] border border-gray-950 rounded-xl p-4 relative">
          <span className="text-[#FF4500] font-black block text-[8px] mb-1.5 tracking-widest uppercase">{t('lifeMatrix.whisperTitle')}</span>
          <p className="text-xs text-gray-200 font-sans leading-relaxed italic">"{zhiWhisper}"</p>
          {loading && (
            <div className="absolute right-4 bottom-4 text-[10px] text-[#00FF7F] animate-pulse">
              {t('lifeMatrix.computing')}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 bg-black p-1 rounded-xl border border-gray-950">
          <button
            type="button"
            onClick={() => setActiveMatrix('KNOWLEDGE')}
            className={`py-2 text-[11px] font-bold rounded-lg transition-all ${
              activeMatrix === 'KNOWLEDGE'
                ? 'bg-[#11131A] text-[#00FF7F] border border-gray-900'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {t('lifeMatrix.tabKnowledge')}
          </button>
          <button
            type="button"
            onClick={() => setActiveMatrix('LANGUAGE')}
            className={`py-2 text-[11px] font-bold rounded-lg transition-all ${
              activeMatrix === 'LANGUAGE'
                ? 'bg-[#11131A] text-[#00FF7F] border border-gray-900'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {t('lifeMatrix.tabLanguage')}
          </button>
          <button
            type="button"
            onClick={() => setActiveMatrix('EVOLUTION')}
            className={`py-2 text-[11px] font-bold rounded-lg transition-all ${
              activeMatrix === 'EVOLUTION'
                ? 'bg-[#11131A] text-[#FF4500] border border-gray-900'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {t('lifeMatrix.tabEvolution')}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeMatrix === 'KNOWLEDGE' && (
            <motion.div key="k" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {dashboard ? (
                <div className="space-y-2">
                  <div className="bg-gray-950 border border-gray-900 rounded-xl p-3">
                    <span className="text-[9px] text-gray-500 block uppercase mb-2">今日概览</span>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-black/50 rounded p-2">
                        <span className="text-[#00FF7F]">{dashboard.today.studyMinutes}</span>
                        <span className="text-gray-500 ml-1">学习分钟</span>
                      </div>
                      <div className="bg-black/50 rounded p-2">
                        <span className="text-amber-400">{dashboard.today.slotsDone}/{dashboard.today.slotsTotal}</span>
                        <span className="text-gray-500 ml-1">时段</span>
                      </div>
                      <div className="bg-black/50 rounded p-2">
                        <span className="text-cyan-300">{dashboard.today.assessmentsDone}</span>
                        <span className="text-gray-500 ml-1">评估</span>
                      </div>
                      <div className="bg-black/50 rounded p-2">
                        <span className="text-rose-300">{dashboard.today.mistakesReviewed}</span>
                        <span className="text-gray-500 ml-1">错题复习</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-950 border border-gray-900 rounded-xl p-3">
                    <span className="text-[9px] text-gray-500 block uppercase mb-2">本周趋势</span>
                    <p className="text-[9px] text-gray-400 mb-1">总 {dashboard.week.studyMinutes} 分钟 · 日均 {dashboard.week.avgDailyMinutes} 分钟 · 连续 {dashboard.week.streakDays} 天</p>
                    <p className="text-[9px] text-gray-500">主要科目：{dashboard.week.topSubject} · 完成率 {Math.round(dashboard.week.completionRate * 100)}%</p>
                    <div className="mt-1.5 flex items-end gap-1 h-12">
                      {dashboard.week.trend.map((d) => {
                        const max = Math.max(...dashboard.week.trend.map((t) => t.minutes), 1);
                        const h = Math.round((d.minutes / max) * 40);
                        return (
                          <div key={d.date} className="flex flex-col items-center flex-1">
                            <div className="w-full bg-[#00FF7F]/20 rounded-t" style={{ height: `${Math.max(h, 2)}px` }} />
                            <span className="text-[6px] text-gray-600 mt-0.5">{d.date.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="bg-gray-950 border border-gray-900 rounded-xl p-3">
                    <span className="text-[9px] text-gray-500 block uppercase mb-2">能力雷达</span>
                    <div className="flex flex-wrap gap-1.5">
                      {dashboard.abilityRadar.map((a) => (
                        <span key={a.subject} className="rounded bg-black/50 px-2 py-1 text-[9px] text-gray-300">
                          {a.subject} {a.score}%
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-[9px] text-gray-500 italic">{dashboard.coachLine}</p>
                </div>
              ) : (
                <div className="bg-gray-950 border border-gray-900 rounded-xl p-3 text-[10px] text-gray-500">
                  正在加载学习数据…
                </div>
              )}
            </motion.div>
          )}

          {activeMatrix === 'LANGUAGE' && (
            <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {dashboard ? (
                <div className="space-y-2">
                  <div className="bg-gray-950 border border-gray-900 rounded-xl p-3">
                    <span className="text-[9px] text-gray-500 block uppercase mb-2">错题分析</span>
                    <div className="flex flex-wrap gap-2 text-[9px] text-gray-400 mb-2">
                      <span>共 {dashboard.mistakes.total} 题</span>
                      <span className="text-rose-300">待复习 {dashboard.mistakes.needsReview}</span>
                      <span className="text-[#00FF7F]">已掌握 {dashboard.mistakes.mastered}</span>
                    </div>
                    {dashboard.mistakes.bySubject.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {dashboard.mistakes.bySubject.map((s) => (
                          <span key={s.subject} className="rounded bg-black/50 px-1.5 py-0.5 text-[8px] text-gray-500">
                            {s.subject} {s.count}
                          </span>
                        ))}
                      </div>
                    )}
                    {dashboard.mistakes.byType.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {dashboard.mistakes.byType.map((t) => (
                          <span key={t.type} className="rounded bg-black/50 px-1.5 py-0.5 text-[8px] text-gray-600">
                            {t.type} {t.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-950 border border-gray-900 rounded-xl p-3 text-[10px] text-gray-500">
                  加载中…
                </div>
              )}
            </motion.div>
          )}

          {activeMatrix === 'EVOLUTION' && (
            <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <span className="text-[9px] text-gray-500 block uppercase">成就 ({unlockedAchievements.length}/{allAchievements.length})</span>
              {allAchievements.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {allAchievements.map((a) => {
                    const unlocked = a.status === 'unlocked';
                    return (
                      <div
                        key={a.id}
                        className={`rounded-xl border p-2 text-[9px] ${
                          unlocked
                            ? 'border-[#00FF7F]/30 bg-[#00FF7F]/8'
                            : 'border-gray-900 bg-black/30 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[14px]">{a.icon || '🏆'}</span>
                          <span className={`font-bold ${unlocked ? 'text-[#00FF7F]' : 'text-gray-500'}`}>{a.title}</span>
                        </div>
                        <p className="mt-0.5 text-gray-600">{a.description}</p>
                        <div className="mt-1 flex items-center gap-1">
                          <div className="flex-1 h-1 bg-gray-900 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${unlocked ? 'bg-[#00FF7F]' : 'bg-amber-500/50'}`}
                              style={{ width: `${Math.min(100, (a.progressCurrent / a.progressTarget) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[7px] text-gray-600">{a.progressCurrent}/{a.progressTarget}</span>
                        </div>
                        {unlocked && a.unlockedAt && (
                          <p className="text-[7px] text-gray-600 mt-0.5">解锁于 {a.unlockedAt.slice(0, 10)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-black border border-gray-950 rounded-xl p-3 text-[11px] space-y-2 font-sans">
                  {bills.map((b) => (
                    <div key={b.label} className="flex justify-between text-gray-400">
                      <span>{b.label}</span>
                      <span className="text-[#FF4500] font-mono font-bold">
                        {b.cost} Warp
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => action(t('lifeMatrix.evolutionAction'))}
                className="bg-gray-900 border border-gray-800 text-[#FF4500] text-[10px] px-3 py-2 rounded hover:bg-[#FF4500]/5 transition-all"
              >
                {t('lifeMatrix.evolutionButton')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {statusMsg && (
          <div className="text-[10px] text-gray-600 text-center font-sans">
            {statusMsg}
          </div>
        )}

        <div className="flex justify-between items-center text-[10px] text-gray-600 pt-3 border-t border-gray-950 mt-4">
          <span>
            {t('lifeMatrix.footer')}
          </span>
          <div className="flex items-center space-x-3">
            <span>
              {t('lifeMatrix.footerGoal')}
            </span>
            <span>
              {t('lifeMatrix.footerResistance', { pct: challengeIndex })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

