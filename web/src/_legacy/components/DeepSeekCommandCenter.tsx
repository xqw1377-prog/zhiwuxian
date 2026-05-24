import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {jsonAuthHeaders, authFetch } from '../lib/api-auth';
import { DestinyProgressBar } from './DestinyProgressBar';
import { useAntiEscapeMonitor } from '../hooks/useAntiEscapeMonitor';

type ActiveTool = 'NONE' | 'METRICS_INPUT' | 'VISION_INTERCEPT' | 'PATH_RECONFIG';

type Intervention = {
  shouldTrigger: boolean;
  mentorOpening?: string;
  requiredTool?: ActiveTool;
  coachTip?: string;
  challengeIndex?: number;
  targetSchool?: string;
  warpPointsRemaining?: number;
  warpDeducted?: number;
};

function unwrap<T>(json: unknown): T {
  const j = json as { data?: T };
  return (j?.data ?? json) as T;
}

export function DeepSeekCommandCenter({ userId }: { userId: string }) {
  const [warpPoints, setWarpPoints] = useState(0);
  const [mentorText, setMentorText] = useState('🤖 DeepSeek 导师正在暗中遥测你的认知因果链…');
  const [coachTip, setCoachTip] = useState('');
  const [activeTool, setActiveTool] = useState<ActiveTool>('NONE');
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [targetSchool, setTargetSchool] = useState('卡内基梅隆 (CMU) 计算机系');
  const [destinyWhisper, setDestinyWhisper] = useState('');
  const [certaintyProgress, setCertaintyProgress] = useState(0);

  const [feedback, setFeedback] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({ GPA: '3.1', TOEFL: '82', SAT: '1350' });
  const [hoursPerDay, setHoursPerDay] = useState('2.5');
  const [weakSubjects, setWeakSubjects] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [missionCode, setMissionCode] = useState('OPERATION-01 // 微积分卡点雷达');

  const weakPool = useMemo(
    () => [
      '极坐标求导',
      '高阶级数收敛',
      '微积分基本定理',
      '立体几何',
      '定积分应用',
    ],
    [],
  );

  const refreshBilling = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v3.5/billing/status/${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (res.ok) {
        const d = unwrap<{
          availableWarpPoints: number;
          challengeIndex: number | null;
          targetSchool: string | null;
          certaintyProgress: number | null;
        }>(json);
        setWarpPoints(d.availableWarpPoints ?? 0);
        if (d.challengeIndex != null) setChallengeIndex(d.challengeIndex);
        if (d.targetSchool) setTargetSchool(d.targetSchool);
        if (d.certaintyProgress != null) setCertaintyProgress(d.certaintyProgress);
      }
    } catch {
      /* offline */
    }
  }, [userId]);

  const { notifyValidHit } = useAntiEscapeMonitor({
    userId,
    active: activeTool !== 'NONE',
    missionCode,
    targetSchool,
    onValidHit: () => void refreshBilling(),
  });

  const pollIntervention = useCallback(
    async (force = false) => {
      try {
        const url = new URL('/api/v3.5/mentor/intervene', window.location.origin);
        url.searchParams.set('userId', userId);
        if (force) url.searchParams.set('force', '1');
        const res = await authFetch(url.toString());
        const json = await res.json();
        if (!res.ok) return;
        const d = unwrap<Intervention>(json);
        if (!d.shouldTrigger) return;
        if (d.mentorOpening) setMentorText(d.mentorOpening);
        if (d.coachTip) setCoachTip(d.coachTip);
        if (d.challengeIndex != null) setChallengeIndex(d.challengeIndex);
        if (d.targetSchool) setTargetSchool(d.targetSchool);
        if (d.requiredTool) {
          setActiveTool(d.requiredTool);
          if (d.requiredTool === 'VISION_INTERCEPT') {
            setMissionCode('OPERATION-01 // 微积分卡点雷达');
          } else if (d.requiredTool === 'METRICS_INPUT') {
            setMissionCode('OPERATION-00 // 航标精算');
          }
        }
        if (d.warpPointsRemaining != null) setWarpPoints(d.warpPointsRemaining);
      } catch {
        setStatusMsg('无法连接 DeepSeek 导师信号');
      }
    },
    [userId],
  );

  useEffect(() => {
    void refreshBilling();
    const t = window.setTimeout(() => void pollIntervention(true), 1200);
    const iv = window.setInterval(() => void pollIntervention(false), 20000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(iv);
    };
  }, [pollIntervention, refreshBilling]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'wuxian_destiny_ping') void refreshBilling();
    };
    window.addEventListener('wuxian:destiny-collapse', refreshBilling);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('wuxian:destiny-collapse', refreshBilling);
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshBilling]);

  const handleTopUp = async () => {
    setBusy(true);
    try {
      const res = await authFetch('/api/v3.5/billing/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: 100 }),
      });
      const json = await res.json();
      if (res.ok) {
        const d = unwrap<{ remaining: number }>(json);
        setWarpPoints(d.remaining);
        setMentorText('燃料已注入。DeepSeek 导师重新上线，别浪费这次机会。');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleMentorConsult = async () => {
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await authFetch('/api/v3/mentor/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          targetSchool,
          currentBaseline: scores,
          daysToDeadline: 365,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = json as { error?: string };
        throw new Error(err.error ?? '精算失败');
      }
      const plan = unwrap<{
        mentorWakeUpCall: string;
        challengeIndex: number;
        certaintyProgress?: number;
        lastDestinyWhisper?: string;
      }>(json);
      setMentorText(plan.mentorWakeUpCall);
      setChallengeIndex(plan.challengeIndex);
      setCertaintyProgress(plan.certaintyProgress ?? 100 - plan.challengeIndex);
      if (plan.lastDestinyWhisper) setDestinyWhisper(plan.lastDestinyWhisper);
      setActiveTool('NONE');
      notifyValidHit();
      void refreshBilling();
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : '精算失败');
    } finally {
      setBusy(false);
    }
  };

  const submitVisionFeed = async (nodeResolved = false) => {
    if (!feedback.trim()) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await authFetch('/api/v1/topology/vision-intercept', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          userId,
          intentText: feedback.trim(),
          nodeResolved,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = json as { error?: string };
        throw new Error(err.error ?? '投喂失败');
      }
      const d = unwrap<{
        weaverWhisper?: string;
        destiny?: { challengeIndex: number; mentorWhisper: string };
      }>(json);
      if (d.destiny) {
        setChallengeIndex(d.destiny.challengeIndex);
        setDestinyWhisper(d.destiny.mentorWhisper);
        setCertaintyProgress(100 - d.destiny.challengeIndex);
        setMentorText(d.destiny.mentorWhisper);
        localStorage.setItem('wuxian_destiny_ping', String(Date.now()));
        window.dispatchEvent(new CustomEvent('wuxian:destiny-collapse'));
      } else {
        setMentorText(d.weaverWhisper ?? '雷达已标记。继续攻坚。');
      }
      setFeedback('');
      setActiveTool('NONE');
      notifyValidHit();
      void refreshBilling();
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : '投喂失败');
    } finally {
      setBusy(false);
    }
  };

  const toggleWeak = (tag: string) => {
    setWeakSubjects((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl space-y-4 font-mono text-left"
    >
      <motion.div className="relative space-y-4 rounded-2xl border-2 border-[#00FF7F]/30 bg-[#0D0E12] p-6 shadow-[0_0_40px_rgba(0,255,127,0.05)]">
        <motion.div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-900 pb-3 text-[10px]">
          <motion.div className="flex items-center gap-2 text-[#00FF7F]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#00FF7F]" />
            <span className="font-bold">DEEPSEEK ACTIVE MENTOR // 平台托管算力</span>
          </motion.div>
          <motion.div className="flex items-center gap-2">
            <span className="rounded-md border border-gray-800 bg-gray-950 px-3 py-1 text-gray-400">
              算力余额: <span className="font-bold text-[#00FF7F]">{warpPoints} Warp</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleTopUp()}
              className="rounded border border-[#00FF7F]/40 px-2 py-1 text-[9px] text-[#00FF7F] hover:bg-[#00FF7F]/10 disabled:opacity-50"
            >
              +100 燃料
            </button>
          </motion.div>
        </motion.div>

        <motion.div className="space-y-1 rounded-xl border border-gray-950 bg-[#14161D] p-4">
          <span className="block text-[9px] font-bold tracking-widest text-[#FF4500]">// DEEPSEEK ⚡ 主动干预</span>
          <p className="font-sans text-xs italic leading-relaxed text-gray-200">&ldquo;{mentorText}&rdquo;</p>
          {coachTip ? <p className="mt-2 text-[10px] text-gray-500">{coachTip}</p> : null}
        </motion.div>

        <AnimatePresence mode="wait">
          {activeTool === 'VISION_INTERCEPT' && (
            <motion.div
              key="vision"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-3 rounded-xl border border-gray-900 bg-gray-950 p-4"
            >
              <motion.div className="flex justify-between text-[9px] text-gray-500">
                <span>🔧 导师工具: 多模态卡点雷达（已挂载）</span>
                <span className="text-[#00FF7F]">算力由平台代缴</span>
              </motion.div>
              <motion.div className="flex gap-2">
                <input
                  type="text"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="描述卡点，或 Option+Space 桌面截屏投喂…"
                  className="flex-1 rounded-lg border border-gray-800 bg-[#14161D] px-3 py-2 text-xs text-white outline-none focus:border-[#00FF7F]"
                />
                <button
                  type="button"
                  disabled={busy || !feedback.trim()}
                  onClick={() => void submitVisionFeed(false)}
                  className="rounded-lg bg-[#00FF7F] px-4 py-2 text-xs font-black text-black hover:bg-[#00E06F] disabled:opacity-50"
                >
                  投喂
                </button>
                <button
                  type="button"
                  disabled={busy || !feedback.trim()}
                  onClick={() => void submitVisionFeed(true)}
                  className="rounded-lg border border-[#00FF7F]/50 px-3 py-2 text-[10px] font-bold text-[#00FF7F] disabled:opacity-50"
                >
                  歼灭
                </button>
              </motion.div>
            </motion.div>
          )}

          {activeTool === 'METRICS_INPUT' && (
            <motion.div
              key="metrics"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-3 rounded-xl border border-gray-900 bg-[#14161D] p-4"
            >
              <span className="text-[9px] text-gray-500">🔧 导师工具: 航标精算输入</span>
              <motion.div className="grid grid-cols-3 gap-2">
                {(['GPA', 'TOEFL', 'SAT'] as const).map((k) => (
                  <label key={k} className="text-[9px] text-gray-500">
                    {k}
                    <input
                      value={scores[k] ?? ''}
                      onChange={(e) => setScores({ ...scores, [k]: e.target.value })}
                      className="mt-1 w-full rounded border border-gray-800 bg-gray-950 px-2 py-1 text-xs text-white"
                    />
                  </label>
                ))}
              </motion.div>
              <motion.div className="flex flex-wrap gap-2">
                {weakPool.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleWeak(tag)}
                    className={`rounded border px-2 py-1 text-[10px] ${
                      weakSubjects.includes(tag)
                        ? 'border-[#FF4500] bg-[#FF4500]/10 text-[#FF4500]'
                        : 'border-gray-800 text-gray-400'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </motion.div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleMentorConsult()}
                className="w-full rounded bg-[#FF4500] py-2 text-[10px] font-bold text-white disabled:opacity-50"
              >
                {busy ? 'DeepSeek 精算中…' : '召唤导师精算师'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div className="flex flex-wrap justify-between gap-2 border-t border-gray-900 pt-2 text-[10px] text-gray-500">
          <span>
            航标: <span className="font-bold text-white">{targetSchool}</span>
          </span>
          <span>
            命运阻力: <span className="font-bold text-[#FF4500]">{challengeIndex}%</span>
          </span>
          <span className="text-gray-600">日均 {hoursPerDay}h（路径 B 自动记账）</span>
        </motion.div>

        {statusMsg ? <p className="text-center text-[10px] text-[#FF4500]">{statusMsg}</p> : null}
      </motion.div>

      {challengeIndex > 0 ? (
        <DestinyProgressBar
          challengeIndex={challengeIndex}
          mentorWhisper={destinyWhisper || coachTip || '有效努力将在此坍缩为确定性进度。'}
          certaintyProgress={certaintyProgress}
        />
      ) : null}
    </motion.div>
  );
}
