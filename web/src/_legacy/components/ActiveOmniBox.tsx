import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {jsonAuthHeaders, authFetch } from '../lib/api-auth';

type ActiveTool = 'NONE' | 'METRICS_INPUT' | 'VISION_INTERCEPT' | 'PATH_RECONFIG';

type Intervention = {
  shouldTrigger: boolean;
  mentorOpening?: string;
  requiredTool?: ActiveTool;
  coachTip?: string;
  challengeIndex?: number;
  deadlineDaysLeft?: number;
  currentMission?: string;
};

function unwrap<T>(json: any): T {
  return (json?.data ?? json) as T;
}

export function ActiveOmniBox(props: { userId: string }) {
  const { userId } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [mentorText, setMentorText] = useState('正在遥测你的时间线流速…');
  const [coachTip, setCoachTip] = useState<string>('');
  const [activeTool, setActiveTool] = useState<ActiveTool>('NONE');
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');

  const [scores, setScores] = useState<Record<string, string>>({ GPA: '3.1', TOEFL: '82' });
  const [hoursPerDay, setHoursPerDay] = useState('2.5');
  const [weakSubjects, setWeakSubjects] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const weakPool = useMemo(() => ([
    '极坐标求导',
    '高阶级数收敛',
    '微积分基本定理',
    '立体几何',
    '定积分应用',
    '阅读长难句',
    '写作逻辑展开',
    '听力细节回溯',
  ]), []);

  const lastMentorTextRef = useRef<string>('');

  const applyIntervention = (x: Intervention) => {
    if (!x.shouldTrigger) return;
    setIsOpen(true);
    const opening = (x.mentorOpening ?? '').trim();
    if (opening && opening !== lastMentorTextRef.current) {
      lastMentorTextRef.current = opening;
      setMentorText(opening);
    }
    setCoachTip((x.coachTip ?? '').trim());
    setChallengeIndex(Math.round(Number(x.challengeIndex ?? 0)));
    setActiveTool((x.requiredTool ?? 'NONE') as ActiveTool);
  };

  useEffect(() => {
    let cancelled = false;
    let timer: any = null;

    const tick = async (force = false) => {
      try {
        const url = new URL('/api/v2/mentor/active-intervention', window.location.origin);
        url.searchParams.set('userId', userId);
        if (force) url.searchParams.set('force', '1');
        const res = await authFetch(url.toString());
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          const e = (json ?? {}) as { error?: string; message?: string; status?: string };
          setStatusMsg(e.error || e.message || e.status || `请求失败：HTTP ${res.status}`);
          return;
        }
        const d = unwrap<Intervention>(json);
        setStatusMsg('');
        applyIntervention(d);
      } catch {
        if (!cancelled) setStatusMsg('网络异常：无法获取主动干预信号');
      }
    };

    void tick(true);
    timer = setInterval(() => void tick(false), 12000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [userId]);

  const toggleWeak = (tag: string) => {
    setWeakSubjects((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const submitBaseline = async () => {
    if (busy) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await authFetch('/api/v2/planner/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          currentScores: scores,
          weakSubjects,
          estimatedHoursPerDay: Number(hoursPerDay),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const e = (json ?? {}) as { error?: string; message?: string; status?: string };
        setStatusMsg(e.error || e.message || e.status || `请求失败：HTTP ${res.status}`);
        return;
      }
      const d = unwrap<{ success?: boolean; plan?: { difficultyIndex: number; timeSlopeSuggestion: string } }>(json);
      if (d?.success && d.plan) {
        setChallengeIndex(Math.round(d.plan.difficultyIndex));
        setMentorText('现状已锁死。因果链已写入。今晚只做一块攻坚。');
        setCoachTip(d.plan.timeSlopeSuggestion || '');
        setActiveTool('NONE');
      } else {
        setStatusMsg('未收到有效规划结果');
      }
    } finally {
      setBusy(false);
    }
  };

  const submitVisionIntercept = async () => {
    if (!feedback.trim()) return;
    if (busy) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await authFetch('/api/v1/topology/telemetry-hit', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          userId,
          matchedConcept: feedback.trim(),
          captureType: 'VISION',
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const e = (json ?? {}) as { error?: string; message?: string; status?: string };
        setStatusMsg(e.error || e.message || e.status || `请求失败：HTTP ${res.status}`);
        return;
      }
      const d = unwrap<{ weaverWhisper?: string; splitTriggered?: boolean }>(json);
      setMentorText(d.weaverWhisper ?? '雷达已标记卡点。今晚先打通最薄的一层。');
      setCoachTip('');
      setFeedback('');
      if (!d.splitTriggered) setActiveTool('NONE');
    } finally {
      setBusy(false);
    }
  };

  const submitReconfig = async () => {
    if (busy) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await authFetch('/api/v2/planner/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const e = (json ?? {}) as { error?: string; message?: string; status?: string };
        setStatusMsg(e.error || e.message || e.status || `请求失败：HTTP ${res.status}`);
        return;
      }
      const d = unwrap<{ success?: boolean; plan?: { difficultyIndex: number; timeSlopeSuggestion: string } }>(json);
      if (d?.success && d.plan) {
        setChallengeIndex(Math.round(d.plan.difficultyIndex));
        setMentorText('因果链已重组。今晚只执行第一块。');
        setCoachTip(d.plan.timeSlopeSuggestion || '');
        setActiveTool('NONE');
      } else {
        setStatusMsg('未收到有效重组结果');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm px-6"
          onClick={() => setIsOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full max-w-2xl mx-auto font-mono text-left space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0D0E12] border-2 border-[#FF4500]/50 rounded-2xl p-6 shadow-[0_0_40px_rgba(255,69,0,0.15)] space-y-4 relative">
        <div className="flex justify-between items-center border-b border-gray-900 pb-3 text-[10px]">
          <div className="flex items-center space-x-2 text-[#FF4500]">
            <span className="w-2 h-2 rounded-full bg-[#FF4500] animate-ping" />
            <span className="font-bold">MENTOR ACTIVE INTRUSION</span>
          </div>
          <div className="text-gray-500">
            命运阻力: <span className="text-[#FF4500] font-bold">{challengeIndex || 0}%</span>
          </div>
        </div>

        <div className="bg-[#14161D] border border-gray-950 rounded-xl p-4">
          <span className="text-[#FF4500] font-bold block text-[10px] mb-2">➔ 导师当头棒喝</span>
          <p className="text-xs text-gray-200 font-sans leading-relaxed italic">"{mentorText}"</p>
          {coachTip && (
            <div className="mt-3 text-[10px] text-zinc-500 leading-relaxed">
              {coachTip}
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {activeTool === 'METRICS_INPUT' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[#14161D] border border-gray-900 rounded-xl p-4 space-y-3"
            >
              <div className="flex justify-between items-center text-[10px] text-gray-500">
                <span>🔧 当前指定工具：现状清算</span>
                <span className="text-[#00FF7F]">就地录入</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-950 border border-gray-800 rounded p-2">
                  <div className="text-[9px] text-gray-500 uppercase">GPA</div>
                  <input
                    value={scores.GPA ?? ''}
                    onChange={(e) => setScores({ ...scores, GPA: e.target.value })}
                    className="mt-1 w-full bg-transparent text-xs text-white outline-none"
                  />
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded p-2">
                  <div className="text-[9px] text-gray-500 uppercase">TOEFL</div>
                  <input
                    value={scores.TOEFL ?? ''}
                    onChange={(e) => setScores({ ...scores, TOEFL: e.target.value })}
                    className="mt-1 w-full bg-transparent text-xs text-white outline-none"
                  />
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded p-2">
                  <div className="text-[9px] text-gray-500 uppercase">HOURS/DAY</div>
                  <input
                    type="number"
                    value={hoursPerDay}
                    onChange={(e) => setHoursPerDay(e.target.value)}
                    className="mt-1 w-full bg-transparent text-xs text-white outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {weakPool.map((tag) => {
                  const on = weakSubjects.includes(tag);
                  return (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => toggleWeak(tag)}
                      className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                        on ? 'bg-[#FF4500]/10 border-[#FF4500] text-[#FF4500] font-bold' : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={submitBaseline}
                disabled={busy}
                className="w-full bg-[#FF4500] hover:bg-[#E03D00] text-white text-[10px] font-bold py-2 rounded transition-all tracking-wider disabled:opacity-60"
              >
                {busy ? '精算中…' : '锁死现状 ➔'}
              </button>
            </motion.div>
          )}

          {activeTool === 'VISION_INTERCEPT' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-gray-950 border border-gray-900 rounded-xl p-4 space-y-3"
            >
              <div className="flex justify-between items-center text-[10px] text-gray-500">
                <span>🔧 当前指定工具：卡点雷达</span>
                <span className="text-[#00FF7F]">记录撞击</span>
              </div>
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="把你此刻卡住的概念丢进来（或 Option+Space 桌面拦截）"
                  className="bg-[#14161D] border border-gray-800 rounded-lg px-3 py-2 text-xs text-white flex-1 outline-none focus:border-[#00FF7F]"
                />
                <button
                  type="button"
                  disabled={busy || !feedback.trim()}
                  onClick={submitVisionIntercept}
                  className="bg-[#00FF7F] hover:bg-[#00E06F] text-black font-black text-xs px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                >
                  强制破局
                </button>
              </div>
            </motion.div>
          )}

          {activeTool === 'PATH_RECONFIG' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[#14161D] border border-gray-900 rounded-xl p-4 space-y-3"
            >
              <div className="flex justify-between items-center text-[10px] text-gray-500">
                <span>🔧 当前指定工具：因果计划重组</span>
                <span className="text-[#00FF7F]">重算路径</span>
              </div>
              <button
                type="button"
                onClick={submitReconfig}
                disabled={busy}
                className="w-full bg-[#FF4500] hover:bg-[#E03D00] text-white text-[10px] font-bold py-2 rounded transition-all tracking-wider disabled:opacity-60"
              >
                {busy ? '重组中…' : '立刻重组因果链'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {statusMsg && (
          <div className="text-[10px] text-zinc-500 text-center">
            {statusMsg}
          </div>
        )}

        <div className="text-[10px] text-gray-600 text-center font-sans">
          WUXIAN 3.0 不接受借口。达成当前节点任务后，导师将主动为你解锁下一赛道。
        </div>
      </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
