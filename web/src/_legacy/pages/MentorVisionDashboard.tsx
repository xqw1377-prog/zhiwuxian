import { authFetch } from '../lib/api-auth';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DestinyProgressBar } from '../components/DestinyProgressBar';

interface CausalityGap {
  weakness: string;
  causalityEffect: string;
}

type MilestoneStatus = 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED';

interface DynamicMilestone {
  codeName: string;
  deadline: string;
  mission: string;
  mentorWhisper: string;
  status?: MilestoneStatus;
}

interface MentorPlan {
  targetSchool: string;
  mentorWakeUpCall: string;
  challengeIndex: number;
  causalityGaps: CausalityGap[];
  dynamicMilestones: DynamicMilestone[];
  activePhase: string | null;
  lastDestinyWhisper?: string;
  certaintyProgress?: number;
}

function unwrap<T>(json: unknown): T {
  const j = json as { data?: T };
  return (j?.data ?? json) as T;
}

const DEFAULT_BASELINE = { TOEFL: 90, SAT: 1350, AP_Count: 2, GPA: 3.6 };

export function MentorVisionDashboard({ userId }: { userId: string }) {
  const [targetSchool, setTargetSchool] = useState('卡内基梅隆 (CMU) 计算机系');
  const [baselineJson, setBaselineJson] = useState(JSON.stringify(DEFAULT_BASELINE, null, 2));
  const [daysToDeadline, setDaysToDeadline] = useState('365');
  const [plan, setPlan] = useState<MentorPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [consulting, setConsulting] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v3/mentor/${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (res.ok) {
        const data = unwrap<MentorPlan | null>(json);
        if (data?.targetSchool && data.mentorWakeUpCall) {
          setPlan(data);
          setTargetSchool(data.targetSchool);
        }
      }
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onDestiny = () => void refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'wuxian_destiny_ping') void refresh();
    };
    window.addEventListener('wuxian:destiny-collapse', onDestiny);
    window.addEventListener('focus', onDestiny);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('wuxian:destiny-collapse', onDestiny);
      window.removeEventListener('focus', onDestiny);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  const handleConsult = async () => {
    setError('');
    let currentBaseline: Record<string, unknown>;
    try {
      currentBaseline = JSON.parse(baselineJson) as Record<string, unknown>;
    } catch {
      setError('现状 JSON 格式无效');
      return;
    }
    setConsulting(true);
    try {
      const res = await authFetch('/api/v3/mentor/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          targetSchool: targetSchool.trim(),
          currentBaseline,
          daysToDeadline: Number(daysToDeadline) || 365,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = json as { error?: string };
        throw new Error(err.error ?? '导师精算失败');
      }
      setPlan(unwrap<MentorPlan>(json));
    } catch (e) {
      setError(e instanceof Error ? e.message : '导师精算失败');
    } finally {
      setConsulting(false);
    }
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-5xl rounded-3xl border border-gray-900 bg-[#0D0E12] p-8 font-mono text-[10px] text-gray-600"
      >
        // 导师视界同步中...
      </motion.div>
    );
  }

  const wakeUpCall =
    plan?.mentorWakeUpCall ??
    '设定目标院校与现状基线，召唤导师以接收当头棒喝。';
  const challengeIndex = plan?.challengeIndex ?? 0;
  const certaintyProgress = plan?.certaintyProgress ?? (challengeIndex > 0 ? 100 - challengeIndex : 0);
  const destinyWhisper =
    plan?.lastDestinyWhisper ??
    (challengeIndex > 0
      ? '每一次有效撞击，都会在这里坍缩为看得见的进度。'
      : '召唤导师精算后，破晓引力盘将锁定你的命运阻力。');
  const causalityGaps = plan?.causalityGaps ?? [];
  const milestones = plan?.dynamicMilestones ?? [];
  const activePhase = plan?.activePhase ?? milestones.find((m) => m.status === 'IN_PROGRESS')?.codeName ?? milestones[0]?.codeName;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-5xl space-y-8 rounded-3xl border border-gray-900 bg-[#0D0E12] p-8 font-mono select-none"
    >
      <motion.div className="grid grid-cols-1 gap-3 border-b border-gray-900 pb-6 lg:grid-cols-3">
        <label className="block space-y-1 lg:col-span-2">
          <span className="text-[10px] text-gray-500">目标航标</span>
          <input
            value={targetSchool}
            onChange={(e) => setTargetSchool(e.target.value)}
            className="w-full rounded-lg border border-gray-800 bg-[#14161D] px-3 py-2 text-xs text-white outline-none focus:border-[#00FF7F]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] text-gray-500">倒计时（天）</span>
          <input
            value={daysToDeadline}
            onChange={(e) => setDaysToDeadline(e.target.value)}
            className="w-full rounded-lg border border-gray-800 bg-[#14161D] px-3 py-2 text-xs text-white outline-none focus:border-[#00FF7F]"
          />
        </label>
        <label className="block space-y-1 lg:col-span-3">
          <span className="text-[10px] text-gray-500">现状基线 JSON</span>
          <textarea
            value={baselineJson}
            onChange={(e) => setBaselineJson(e.target.value)}
            rows={2}
            className="w-full resize-y rounded-lg border border-gray-800 bg-[#14161D] px-3 py-2 font-mono text-[11px] text-gray-300 outline-none focus:border-[#00FF7F]"
          />
        </label>
        <motion.div className="flex flex-wrap items-center gap-3 lg:col-span-3">
          <button
            type="button"
            disabled={consulting || !targetSchool.trim()}
            onClick={() => void handleConsult()}
            className="rounded-lg border border-[#00FF7F]/40 bg-[#00FF7F]/10 px-4 py-2 text-xs font-bold text-[#00FF7F] hover:bg-[#00FF7F]/20 disabled:opacity-50"
          >
            {consulting ? '导师降临中...' : '召唤导师精算师'}
          </button>
          {error ? <span className="text-[11px] text-[#FF4500]">{error}</span> : null}
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden rounded-2xl border border-[#FF4500]/30 bg-[#FF4500]/5 p-6"
      >
        <motion.div className="pointer-events-none absolute right-4 top-2 text-5xl font-black text-[#FF4500]/10">
          MENTOR
        </motion.div>
        <span className="mb-2 block text-xs font-bold tracking-widest text-[#FF4500]">
          // 导师的镜子 (THE WAKE-UP CALL)
        </span>
        <p className="font-sans text-sm italic leading-relaxed text-gray-200">&ldquo;{wakeUpCall}&rdquo;</p>
        {plan?.targetSchool ? (
          <p className="mt-3 text-[10px] text-gray-500">航标: {plan.targetSchool}</p>
        ) : null}
      </motion.div>

      {plan ? (
        <DestinyProgressBar
          challengeIndex={challengeIndex}
          mentorWhisper={destinyWhisper}
          certaintyProgress={certaintyProgress}
        />
      ) : null}

      <motion.div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <motion.div className="space-y-4 rounded-2xl border border-gray-950 bg-[#14161D] p-6 lg:col-span-3">
          <h3 className="text-xs font-bold tracking-wider text-[#00FF7F]">// 因果黑洞连线 (CAUSALITY MATRIX)</h3>
          <p className="text-[11px] text-gray-500">导师注：错题不是孤立的，看清它是怎么在未来拖死你的：</p>
          <motion.div className="space-y-4 pt-2">
            {(causalityGaps.length
              ? causalityGaps
              : [{ weakness: '待精算', causalityEffect: '召唤导师后，因果链将在此展开。' }]
            ).map((gap, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="space-y-1 border-l-2 border-[#FF4500] pl-4"
              >
                <span className="block w-max rounded bg-[#FF4500]/10 px-2 py-0.5 text-xs font-bold text-white">
                  弱项：{gap.weakness}
                </span>
                <p className="font-sans text-xs leading-relaxed text-gray-400">{gap.causalityEffect}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div className="space-y-4 rounded-2xl border border-gray-950 bg-[#14161D] p-6 lg:col-span-2">
          <motion.div className="flex items-center justify-between">
            <h3 className="text-xs font-bold tracking-wider text-white">// 逆向战役死线 (DEADLINES)</h3>
            <span className="text-[10px] text-gray-500">详见破晓引力盘</span>
          </motion.div>
          <motion.div className="relative ml-2 space-y-6 border-l border-gray-800 pl-4">
            {(milestones.length
              ? milestones
              : [
                  {
                    codeName: '待部署',
                    deadline: '—',
                    mission: '完成导师精算以解锁战役节点。',
                    mentorWhisper: '先坐下来，把真相摊开。',
                  },
                ]
            ).map((ms, idx) => (
              <motion.div key={idx} className="relative space-y-1">
                <motion.div
                  className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full shadow-[0_0_8px_#00FF7F] ${
                    ms.status === 'COMPLETED'
                      ? 'bg-gray-600 shadow-none'
                      : ms.status === 'IN_PROGRESS'
                        ? 'bg-[#00FF7F]'
                        : 'bg-gray-700'
                  }`}
                />
                <motion.div className="flex justify-between text-[10px]">
                  <span className="font-bold tracking-widest text-gray-400">
                    {ms.codeName}
                    {ms.status === 'LOCKED' ? (
                      <span className="ml-1 text-[8px] text-gray-600">LOCKED</span>
                    ) : ms.status === 'IN_PROGRESS' ? (
                      <span className="ml-1 text-[8px] text-[#00FF7F]">进行中</span>
                    ) : ms.status === 'COMPLETED' ? (
                      <span className="ml-1 text-[8px] text-gray-500">已坍缩</span>
                    ) : null}
                  </span>
                  <span className="font-bold text-[#FF4500]">{ms.deadline}</span>
                </motion.div>
                <p className="font-sans text-xs text-white">{ms.mission}</p>
                <p className="font-sans text-[10px] italic text-gray-500">导师叮嘱: {ms.mentorWhisper}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>

      <footer className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-900 bg-gray-950/80 p-4 text-[11px] text-gray-500">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 animate-ping rounded-full bg-[#00FF7F]" />
          OS 拦截外挂已将【导师监控眼】挂载至当前系统活动窗口
          {activePhase ? ` · 战役: ${activePhase}` : ''}。
        </span>
        <span className="text-gray-600">[Option + Space] 随时接受导师清算</span>
      </footer>
    </motion.div>
  );
}
