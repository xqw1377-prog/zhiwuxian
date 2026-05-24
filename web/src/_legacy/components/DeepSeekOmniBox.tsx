import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {jsonAuthHeaders, authFetch } from '../lib/api-auth';

type Stage = 'TARGET' | 'BASELINE' | 'DASHBOARD';
type Tool = 'NONE' | 'VISION_INTERCEPT' | 'METRICS_INPUT' | 'PATH_RECONFIG';

type OrchestratorResp = {
  success: boolean;
  shouldTrigger: boolean;
  stage: Stage;
  mentorText: string;
  activeTool: Tool;
  remainingWarp: number;
  chargedWarp: number;
};

function unwrap<T>(json: any): T {
  return (json?.data ?? json) as T;
}

export function DeepSeekOmniBox(props: { userId: string }) {
  const { userId } = props;

  const [warpBalance, setWarpBalance] = useState<number>(0);
  const [stage, setStage] = useState<Stage>('TARGET');
  const [mentorText, setMentorText] = useState<string>('曦宝，告诉我你誓死要拿下的目标是什么？我会接管你的因果链。');
  const [activeTool, setActiveTool] = useState<Tool>('NONE');
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const [scores, setScores] = useState<Record<string, string>>({ GPA: '3.1', TOEFL: '82' });
  const [hoursPerDay, setHoursPerDay] = useState('2.5');
  const [weakSubjects, setWeakSubjects] = useState<string[]>([]);
  const [concept, setConcept] = useState('');

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

  const refreshWarp = () => {
    authFetch(`/api/v1/relay/status/${encodeURIComponent(userId)}`)
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        const d = unwrap<{ warpPoints?: number }>(j);
        if (typeof d?.warpPoints === 'number') setWarpBalance(Math.round(d.warpPoints));
      })
      .catch(() => {});
  };

  const applyOrchestrator = (d: OrchestratorResp) => {
    if (!d.shouldTrigger) return;
    setStage(d.stage);
    if (d.mentorText) setMentorText(d.mentorText);
    setActiveTool(d.activeTool);
    if (typeof d.remainingWarp === 'number') setWarpBalance(Math.round(d.remainingWarp));
  };

  const callOrchestrator = async (userText?: string, force?: boolean) => {
    const res = await authFetch('/api/v2/omni/intrusion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, userText, force: Boolean(force) }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (json ?? {}) as { error?: string; message?: string; status?: string };
      throw new Error(e.error || e.message || e.status || `HTTP ${res.status}`);
    }
    const d = unwrap<OrchestratorResp>(json);
    return d;
  };

  useEffect(() => {
    refreshWarp();
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      callOrchestrator(undefined, false)
        .then((d) => applyOrchestrator(d))
        .catch(() => {});
    }, 14000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId]);

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || loading) return;
    setLoading(true);
    setStatusMsg('');
    try {
      const d = await callOrchestrator(inputValue.trim(), true);
      applyOrchestrator(d);
      setInputValue('');
    } catch (err: any) {
      setStatusMsg(String(err?.message ?? '调度失败'));
    } finally {
      setLoading(false);
    }
  };

  const toggleWeak = (tag: string) => {
    setWeakSubjects((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const confirmBaseline = async () => {
    if (loading) return;
    setLoading(true);
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
      const d = await callOrchestrator(`提交现状: ${JSON.stringify(scores)} / 弱项: ${weakSubjects.join(',')}`, true);
      applyOrchestrator(d);
    } catch (err: any) {
      setStatusMsg(String(err?.message ?? '现状提交失败'));
    } finally {
      setLoading(false);
    }
  };

  const markConcept = async () => {
    if (!concept.trim() || loading) return;
    setLoading(true);
    setStatusMsg('');
    try {
      const res = await authFetch('/api/v1/topology/telemetry-hit', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ userId, matchedConcept: concept.trim(), captureType: 'VISION' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const e = (json ?? {}) as { error?: string; message?: string; status?: string };
        setStatusMsg(e.error || e.message || e.status || `请求失败：HTTP ${res.status}`);
        return;
      }
      const d = await callOrchestrator(`卡点已标记: ${concept.trim()}`, true);
      applyOrchestrator(d);
      setConcept('');
    } catch (err: any) {
      setStatusMsg(String(err?.message ?? '卡点标记失败'));
    } finally {
      setLoading(false);
    }
  };

  const reconfigPath = async () => {
    if (loading) return;
    setLoading(true);
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
      const d = await callOrchestrator('计划已重组，请给今晚第一刀。', true);
      applyOrchestrator(d);
    } catch (err: any) {
      setStatusMsg(String(err?.message ?? '重组失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-[#0D0E12] border-2 border-[#00FF7F]/20 rounded-2xl p-6 space-y-4 font-mono text-left shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
      <div className="flex justify-between items-center border-b border-gray-900 pb-3 text-[10px]">
        <div className="flex items-center space-x-2 text-[#00FF7F]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00FF7F] animate-pulse" />
          <span className="font-bold tracking-widest">ORCHESTRATION HUB // ACTIVE</span>
        </div>
        <div className="bg-gray-950 border border-gray-800 text-gray-400 px-3 py-1 rounded">
          平台托管算力: <span className="text-[#00FF7F] font-bold">{warpBalance} Warp</span>
        </div>
      </div>

      <div className="bg-[#14161D] border border-gray-950 rounded-xl p-4 relative">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[#FF4500] font-bold text-[9px] tracking-wider">➔ 导师主动介入</span>
          <span className="text-[9px] text-gray-600">STAGE: {stage}</span>
        </div>
        <p className="text-xs text-gray-200 font-sans leading-relaxed italic">"{mentorText}"</p>
        {loading && (
          <div className="absolute right-4 bottom-4 text-[10px] text-[#00FF7F] animate-pulse">清算中…</div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {activeTool === 'METRICS_INPUT' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-gray-950 border border-gray-900 rounded-xl p-4 space-y-3"
          >
            <div className="grid grid-cols-3 gap-3 items-end">
              <div>
                <label className="text-[9px] text-gray-500 block uppercase">GPA</label>
                <input
                  type="text"
                  value={scores.GPA ?? ''}
                  onChange={(e) => setScores({ ...scores, GPA: e.target.value })}
                  className="bg-[#14161D] border border-gray-800 rounded px-2 py-1 text-xs text-white w-full outline-none mt-1 focus:border-[#00FF7F]"
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 block uppercase">TOEFL</label>
                <input
                  type="text"
                  value={scores.TOEFL ?? ''}
                  onChange={(e) => setScores({ ...scores, TOEFL: e.target.value })}
                  className="bg-[#14161D] border border-gray-800 rounded px-2 py-1 text-xs text-white w-full outline-none mt-1 focus:border-[#00FF7F]"
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-500 block uppercase">HOURS/DAY</label>
                <input
                  type="number"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(e.target.value)}
                  className="bg-[#14161D] border border-gray-800 rounded px-2 py-1 text-xs text-white w-full outline-none mt-1 focus:border-[#00FF7F]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {weakPool.map((tag) => {
                const on = weakSubjects.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleWeak(tag)}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                      on ? 'bg-[#00FF7F]/10 border-[#00FF7F] text-[#00FF7F] font-bold' : 'bg-[#14161D] border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={confirmBaseline}
              disabled={loading}
              className="bg-[#FF4500] hover:bg-[#E03D00] text-white text-[10px] font-bold py-2 rounded transition-all w-full disabled:opacity-60"
            >
              锁定现状 ➔
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
            <div className="flex space-x-3">
              <input
                type="text"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="把你此刻卡住的概念丢进雷达…"
                className="bg-[#14161D] border border-gray-800 rounded-lg px-3 py-2 text-xs text-white flex-1 outline-none focus:border-[#00FF7F]"
              />
              <button
                type="button"
                onClick={markConcept}
                disabled={loading || !concept.trim()}
                className="bg-[#00FF7F] hover:bg-[#00E06F] text-black font-black text-xs px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
              >
                破局
              </button>
            </div>
            <div className="text-[10px] text-gray-600">
              端侧拦截：Option + Space（桌面浮窗）→ vision-intercept
            </div>
          </motion.div>
        )}

        {activeTool === 'PATH_RECONFIG' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-gray-950 border border-gray-900 rounded-xl p-4 space-y-3"
          >
            <button
              type="button"
              onClick={reconfigPath}
              disabled={loading}
              className="bg-[#FF4500] hover:bg-[#E03D00] text-white text-[10px] font-bold py-2 rounded transition-all w-full disabled:opacity-60"
            >
              立刻重组因果链
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {activeTool === 'NONE' && (
        <form onSubmit={handleCommandSubmit} className="flex items-center space-x-2 bg-gray-950 border border-gray-900 rounded-xl p-2 pl-4">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="与导师对话，或直接打字更改你的航标…"
            className="bg-transparent text-xs text-white outline-none flex-1 font-sans"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !inputValue.trim()}
            className="bg-[#14161D] border border-gray-800 text-gray-400 hover:text-[#00FF7F] hover:border-[#00FF7F] px-4 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-60"
          >
            执行
          </button>
        </form>
      )}

      {statusMsg && (
        <div className="text-[10px] text-gray-600 text-center">
          {statusMsg}
        </div>
      )}
    </div>
  );
}

