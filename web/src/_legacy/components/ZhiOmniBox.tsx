import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {jsonAuthHeaders, authFetch } from '../lib/api-auth';
import { useAntiEscapeMonitor } from '../hooks/useAntiEscapeMonitor';

type BoxState = 'NORMAL' | 'INTERCEPT' | 'LOCKED' | 'SHADOW';
type ZhiTool = 'METRICS_INPUT' | 'VISION_INTERCEPT' | 'NONE';

type ZhiIntrusion = {
  zhiOpening: string;
  activatedTool: ZhiTool;
  zhiTip: string;
  zhiCoachNote?: string;
  challengeIndex?: number;
  targetSchool?: string;
  warpPointsRemaining?: number;
};

function unwrap<T>(json: unknown): T {
  const j = json as { data?: T };
  return (j?.data ?? json) as T;
}

function toolToBoxState(tool: ZhiTool, locked: boolean): BoxState {
  if (locked) return 'LOCKED';
  if (tool === 'VISION_INTERCEPT' || tool === 'METRICS_INPUT') return 'INTERCEPT';
  return 'NORMAL';
}

export function ZhiOmniBox({ userId }: { userId: string }) {
  const [warpPoints, setWarpPoints] = useState(0);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [targetSchool, setTargetSchool] = useState('卡内基梅隆 (CMU) 计算机系');
  const [boxState, setBoxState] = useState<BoxState>('NORMAL');
  const [zhiText, setZhiText] = useState('曦宝，我是 ZHI。正在接入你的命运因果链…');
  const [zhiTip, setZhiTip] = useState('');
  const [coachNote, setCoachNote] = useState('');
  const [reportInput, setReportInput] = useState('');
  const [breakthroughInput, setBreakthroughInput] = useState('');
  const [shadowProblem, setShadowProblem] = useState('');
  const [shadowHint, setShadowHint] = useState('');
  const [syllabusDirect, setSyllabusDirect] = useState('');
  const [causalityGap, setCausalityGap] = useState('');
  const [busy, setBusy] = useState(false);
  const missionCode = 'ZHI-T1 // 微积分因果断层';

  const refreshStatus = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v3.5/billing/status/${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (res.ok) {
        const d = unwrap<{
          availableWarpPoints: number;
          challengeIndex: number | null;
          targetSchool: string | null;
        }>(json);
        setWarpPoints(d.availableWarpPoints ?? 0);
        if (d.challengeIndex != null) setChallengeIndex(d.challengeIndex);
        if (d.targetSchool) setTargetSchool(d.targetSchool);
      }
    } catch {
      /* offline */
    }
  }, [userId]);

  const applyZhi = useCallback((d: ZhiIntrusion) => {
    if (d.zhiOpening) setZhiText(d.zhiOpening);
    if (d.zhiTip) setZhiTip(d.zhiTip);
    if (d.zhiCoachNote) setCoachNote(d.zhiCoachNote);
    if (d.challengeIndex != null) setChallengeIndex(d.challengeIndex);
    if (d.targetSchool) setTargetSchool(d.targetSchool);
    if (d.warpPointsRemaining != null) setWarpPoints(d.warpPointsRemaining);
    setBoxState(toolToBoxState(d.activatedTool ?? 'NONE', false));
  }, []);

  const callZhiIntrusion = useCallback(
    async (feedback?: string) => {
      const res = await authFetch('/api/v3.5/zhi/intrusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userFeedback: feedback }),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = json as { error?: string };
        throw new Error(err.error ?? 'ZHI 信号中断');
      }
      applyZhi(unwrap<ZhiIntrusion>(json));
    },
    [applyZhi, userId],
  );

  useEffect(() => {
    const onGhost = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        zhiVoiceLine?: string;
        syllabusDirect?: string;
        causalityGap?: string;
        coachNote?: string;
        challengeIndex?: number;
        warpPointsRemaining?: number;
      };
      if (d?.zhiVoiceLine) setZhiText(d.zhiVoiceLine);
      if (d?.syllabusDirect) setSyllabusDirect(d.syllabusDirect);
      if (d?.causalityGap) setCausalityGap(d.causalityGap);
      if (d?.coachNote) setCoachNote(d.coachNote);
      if (d?.challengeIndex != null) setChallengeIndex(d.challengeIndex);
      if (d?.warpPointsRemaining != null) setWarpPoints(d.warpPointsRemaining);
      setBoxState('INTERCEPT');
    };
    window.addEventListener('wuxian:ghost-topology', onGhost);
    return () => window.removeEventListener('wuxian:ghost-topology', onGhost);
  }, []);

  const { notifyValidHit } = useAntiEscapeMonitor({
    userId,
    active: boxState === 'INTERCEPT' || boxState === 'SHADOW',
    missionCode,
    targetSchool,
    onValidHit: () => void refreshStatus(),
  });

  useEffect(() => {
    void refreshStatus();
    const t = window.setTimeout(() => {
      void callZhiIntrusion().catch(() => {
        setZhiText('曦宝，ZHI 暂时离线。先设定航标，我才能接管你的因果链。');
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [callZhiIntrusion, refreshStatus]);

  useEffect(() => {
    const onLock = (e: Event) => {
      const detail = (e as CustomEvent<{ mentorWords?: string; remainingWarp?: number }>).detail;
      if (detail?.mentorWords) setZhiText(detail.mentorWords);
      if (detail?.remainingWarp != null) setWarpPoints(detail.remainingWarp);
      setBoxState('LOCKED');
    };
    window.addEventListener('wuxian:mentor-lock', onLock);
    return () => window.removeEventListener('wuxian:mentor-lock', onLock);
  }, []);

  const handleEscapePenalty = async () => {
    setBusy(true);
    try {
      const res = await authFetch('/api/v3.5/billing/escape-penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, missionCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error('惩罚清算失败');
      const d = unwrap<{ mentorWords: string; remainingWarp: number }>(json);
      setZhiText(d.mentorWords);
      setWarpPoints(d.remainingWarp);
      setBoxState('LOCKED');
    } finally {
      setBusy(false);
    }
  };

  const handleClaimBreakthrough = async () => {
    setBusy(true);
    try {
      const res = await authFetch('/api/v3.5/zhi/shadow-spar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          context: coachNote || breakthroughInput || reportInput || missionCode,
          coachNote,
          syllabusDirect,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error('影子变异失败');
      const d = unwrap<{
        zhiWhisper: string;
        shadowProblem: string;
        shadowHint: string;
        syllabusDirect: string;
        warpPointsRemaining: number;
      }>(json);
      setZhiText(d.zhiWhisper);
      setShadowProblem(d.shadowProblem);
      setShadowHint(d.shadowHint);
      if (d.syllabusDirect) setSyllabusDirect(d.syllabusDirect);
      setWarpPoints(d.warpPointsRemaining);
      setBoxState('SHADOW');
      setBreakthroughInput('');
    } catch (err) {
      setZhiText(err instanceof Error ? err.message : '影子肉搏战启动失败');
    } finally {
      setBusy(false);
    }
  };

  const handleShadowVerify = async () => {
    const attempt = breakthroughInput.trim();
    if (!attempt || !shadowProblem) return;
    setBusy(true);
    try {
      const res = await authFetch('/api/v3.5/zhi/shadow-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          shadowProblem,
          attempt,
          syllabusDirect,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error('验证失败');
      const d = unwrap<{
        passed: boolean;
        zhiWhisper: string;
        challengeIndex: number;
        warpPointsRemaining: number;
        topology?: {
          syllabusDirect: string;
          causalityGap: string;
          resistanceReduction: number;
        };
      }>(json);
      setZhiText(d.zhiWhisper);
      setWarpPoints(d.warpPointsRemaining);
      setChallengeIndex(d.challengeIndex);
      if (d.topology) {
        setSyllabusDirect(d.topology.syllabusDirect);
        setCausalityGap(d.topology.causalityGap);
      }
      if (d.passed) {
        setBoxState('NORMAL');
        setShadowProblem('');
        setBreakthroughInput('');
        notifyValidHit();
        window.dispatchEvent(new CustomEvent('wuxian:destiny-collapse'));
      }
      void refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleBreakthrough = async (resolved: boolean) => {
    const text = breakthroughInput.trim() || reportInput.trim();
    if (!text) return;
    if (resolved) {
      await handleClaimBreakthrough();
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch('/api/v1/topology/vision-intercept', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ userId, intentText: text, nodeResolved: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error('撞击失败');
      setZhiText('雷达已标记。别停，ZHI 还在看着你。');
      void refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportInput.trim() || busy) return;
    setBusy(true);
    try {
      await callZhiIntrusion(reportInput.trim());
      setReportInput('');
    } catch (err) {
      setZhiText(err instanceof Error ? err.message : '汇报失败');
    } finally {
      setBusy(false);
    }
  };

  const borderClass =
    boxState === 'LOCKED'
      ? 'border-[#FF4500] shadow-[0_0_60px_rgba(255,69,0,0.25)]'
      : 'border-[#00FF7F]/40 shadow-[0_0_40px_rgba(0,255,127,0.06)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-2xl p-4 font-mono select-none"
    >
      <motion.div className={`relative rounded-2xl border-2 bg-[#0A0B0E] p-6 transition-all duration-500 ${borderClass}`}>
        <motion.div className="flex items-center justify-between border-b border-gray-950 pb-3 text-[10px]">
          <motion.div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${boxState === 'LOCKED' ? 'animate-ping bg-[#FF4500]' : 'animate-pulse bg-[#00FF7F]'}`}
            />
            <span className={`font-black tracking-widest ${boxState === 'LOCKED' ? 'text-[#FF4500]' : 'text-white'}`}>
              {boxState === 'LOCKED' ? '⚠️ ZHI // 铁血认知拦截锁定' : '🧭 ZHI // 命运因果链护航中'}
            </span>
          </motion.div>
          <motion.div className="flex items-center gap-2 rounded border border-gray-900 bg-[#11131A] px-3 py-1 text-[9px] text-gray-400">
            <span>托管算力余额:</span>
            <span className="font-bold text-[#00FF7F]">{warpPoints} Warp</span>
          </motion.div>
        </motion.div>

        <motion.div className="relative my-4 rounded-xl border border-gray-950 bg-[#11131A] p-4">
          <span className="mb-2 block text-[8px] font-black uppercase tracking-widest text-[#FF4500]">// ZHI 的镜子</span>
          <p className="font-sans text-xs italic leading-relaxed text-gray-200">&ldquo;{zhiText}&rdquo;</p>
          {zhiTip ? <p className="mt-2 text-[10px] text-gray-500">{zhiTip}</p> : null}
        </motion.div>

        <AnimatePresence mode="wait">
          {boxState === 'INTERCEPT' && (
            <motion.div
              key="intercept"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4 rounded-xl border border-gray-900 bg-gray-950 p-4"
            >
              <motion.div className="flex items-center justify-between border-b border-gray-900 pb-2 text-[9px] text-gray-500">
                <span>🔧 ZHI_VISION_INTERCEPT // 屏幕物理残影挂载</span>
                <span className="text-[#00FF7F]">DeepSeek 算力解构已就绪</span>
              </motion.div>
              <motion.div className="grid grid-cols-4 items-center gap-4">
                <motion.div className="col-span-1 flex h-14 items-center justify-center rounded border border-gray-900 bg-[#11161D] text-[9px] font-bold text-[#00FF7F]">
                  [ 拦截快照 ]
                </motion.div>
                <motion.div className="col-span-3 space-y-1">
                  <span className="block text-[10px] font-bold text-gray-400">ZHI 帮扶小抄：</span>
                  <p className="font-sans text-[11px] leading-relaxed text-gray-500">
                    {coachNote ||
                      '别看书了。卡住时先写出泰勒展开首项，用 Ratio Test 拆阶乘，核对是否漏掉高阶无穷小。'}
                  </p>
                  {syllabusDirect ? (
                    <p className="mt-2 text-[10px] text-[#00FF7F]">【考纲直击】{syllabusDirect}</p>
                  ) : null}
                  {causalityGap ? (
                    <p className="text-[10px] text-[#FF4500]">【因果断层】{causalityGap}</p>
                  ) : null}
                </motion.div>
              </motion.div>
              <motion.div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleEscapePenalty()}
                  className="rounded-xl border border-gray-900 bg-gray-950 px-3 text-[10px] text-gray-600 transition-all hover:border-red-900/50 hover:text-red-500"
                >
                  试图切窗逃避 ➔
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleClaimBreakthrough()}
                  className="flex-1 rounded-xl bg-[#00FF7F] py-2.5 text-center text-xs font-black tracking-widest text-black shadow-[0_0_20px_rgba(0,255,127,0.1)] transition-all hover:bg-[#00E06F]"
                >
                  我学懂了，粉碎这个卡点 ➔
                </button>
              </motion.div>
            </motion.div>
          )}

          {boxState === 'SHADOW' && (
            <motion.div
              key="shadow"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 rounded-xl border border-[#00FF7F]/30 bg-[#00FF7F]/5 p-4"
            >
              <span className="block text-[9px] font-bold uppercase text-[#00FF7F]">
                // ZHI 影子肉搏战 · 真懂须撞穿变式
              </span>
              <p className="font-sans text-[11px] leading-relaxed text-gray-300">{shadowProblem}</p>
              <p className="text-[10px] text-gray-500">提示：{shadowHint}</p>
              <motion.div className="flex gap-2">
                <input
                  type="text"
                  value={breakthroughInput}
                  onChange={(e) => setBreakthroughInput(e.target.value)}
                  placeholder="敲入影子题第一步因果推导…"
                  className="flex-1 rounded-lg border border-gray-900 bg-gray-950 px-3 py-2 text-xs text-white outline-none focus:border-[#00FF7F]"
                />
                <button
                  type="button"
                  disabled={busy || !breakthroughInput.trim()}
                  onClick={() => void handleShadowVerify()}
                  className="rounded-lg bg-[#00FF7F] px-4 py-2 text-xs font-black text-black hover:bg-[#00E06F] disabled:opacity-50"
                >
                  肉搏验证
                </button>
              </motion.div>
            </motion.div>
          )}

          {boxState === 'LOCKED' && (
            <motion.div
              key="locked"
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="space-y-3 rounded-xl border border-[#FF4500]/20 bg-[#FF4500]/5 p-4"
            >
              <span className="block text-[9px] font-bold uppercase text-[#FF4500]">
                // ZHI 唯一解锁钥匙：拒绝任何借口，提交你的第一步推导尝试
              </span>
              <motion.div className="flex gap-2">
                <input
                  type="text"
                  value={breakthroughInput}
                  onChange={(e) => setBreakthroughInput(e.target.value)}
                  placeholder="在这里输入你尝试推导的级数首项以解除锁定…"
                  className="flex-1 rounded-lg border border-gray-900 bg-gray-950 px-3 py-2 text-xs text-white outline-none focus:border-[#FF4500]"
                />
                <button
                  type="button"
                  disabled={busy || !breakthroughInput.trim()}
                  onClick={() => void handleShadowVerify()}
                  className="rounded-lg bg-[#FF4500] px-5 py-2 text-xs font-black text-white shadow-[0_0_15px_rgba(255,69,0,0.3)] transition-all hover:bg-[#E03D00] disabled:opacity-50"
                >
                  正面突围
                </button>
              </motion.div>
            </motion.div>
          )}

          {boxState === 'NORMAL' && (
            <motion.form
              key="normal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onSubmit={handleReport}
              className="flex items-center gap-2 rounded-xl border border-gray-900 bg-gray-950 p-2 pl-4"
            >
              <input
                type="text"
                value={reportInput}
                onChange={(e) => setReportInput(e.target.value)}
                placeholder="输入你想跟 ZHI 汇报的任何新卡点或成绩…"
                className="flex-1 bg-transparent font-sans text-xs text-white outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg border border-gray-900 bg-[#11131A] px-4 py-1.5 text-xs text-gray-400 transition-colors hover:text-[#00FF7F]"
              >
                向 ZHI 汇报
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <motion.div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-950 pt-3 text-[10px] text-gray-500">
          <span>
            航标学校: <span className="font-bold text-white">{targetSchool}</span>
          </span>
          <motion.div className="flex items-center gap-3">
            <span>
              当前战役: <span className="font-bold text-[#00FF7F]">{missionCode}</span>
            </span>
            <span>
              命运阻力: <span className="font-bold text-[#FF4500]">{challengeIndex}%</span>
            </span>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
