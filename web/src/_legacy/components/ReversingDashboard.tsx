import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '../lib/api-auth';
import { motion } from 'framer-motion';

export type ReversingMetrics = {
  targetDestination: string;
  daysLeft: number;
  progressPercentage: number;
  completedUnits: number;
  totalUnits: number;
};

function unwrap<T>(json: any): T {
  return (json?.data ?? json) as T;
}

export default function ReversingDashboard(props: {
  userId: string;
  onMatrixActivated?: (metrics: ReversingMetrics, dest: string, days: number) => void;
  externalMetrics?: ReversingMetrics | null;
  externalTarget?: string;
  externalDays?: number;
  externalWhisper?: string;
  splitShaking?: boolean;
}) {
  const {
    userId,
    onMatrixActivated,
    externalMetrics,
    externalTarget,
    externalDays,
    externalWhisper,
    splitShaking = false,
  } = props;
  const [target, setTarget] = useState('');
  const [status, setStatus] = useState('');
  const [days, setDays] = useState('180');
  const [metrics, setMetrics] = useState<ReversingMetrics | null>(null);
  const [whisper, setWhisper] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof externalTarget === 'string') setTarget(externalTarget);
  }, [externalTarget]);

  useEffect(() => {
    if (typeof externalDays === 'number' && Number.isFinite(externalDays) && externalDays > 0) {
      setDays(String(Math.round(externalDays)));
    }
  }, [externalDays]);

  const daysInt = useMemo(() => {
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) return 180;
    return Math.round(n);
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    authFetch(`/api/v1/quantum/reversing-metrics?userId=${encodeURIComponent(userId)}`)
      .then(r => r.json().catch(() => null))
      .then((j) => {
        if (cancelled) return;
        const d = unwrap<{ success?: boolean; metrics?: ReversingMetrics | null }>(j);
        if (d?.metrics) {
          setMetrics(d.metrics);
          setTarget(d.metrics.targetDestination);
          onMatrixActivated?.(d.metrics, d.metrics.targetDestination, d.metrics.daysLeft);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [onMatrixActivated, userId]);

  const triggerReverseEngine = async () => {
    if (!target.trim() || !status.trim()) return;
    setBusy(true);
    try {
      const res = await authFetch('/api/v1/quantum/reverse-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          targetDestination: target,
          currentStatus: status,
          daysToDeadline: daysInt,
        }),
      });
      const json = await res.json().catch(() => null);
      const d = unwrap<{ success?: boolean; whisper?: string; metrics?: ReversingMetrics }>(json);
      if (d?.success && d.metrics) {
        setMetrics(d.metrics);
        setWhisper(d.whisper ?? '');
        onMatrixActivated?.(d.metrics, target, daysInt);
      }
    } finally {
      setBusy(false);
    }
  };

  const viewMetrics = (externalMetrics ?? metrics) as ReversingMetrics | null;

  return (
    <div className="w-full max-w-2xl bg-[#161820] border border-gray-800 rounded-2xl p-6 font-mono space-y-6">
      {!viewMetrics ? (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#00FF7F] tracking-widest">// 路径 A：以终为始逆向跃迁</h3>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="终极目的地（如：目标学校 / AP 5分）"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="bg-[#0D0E12] text-white border border-gray-800 focus:border-[#00FF7F] px-4 py-2 rounded-xl text-xs outline-none"
            />
            <input
              type="text"
              placeholder="当前真实评估（如：基础薄弱 / 极度焦虑）"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-[#0D0E12] text-white border border-gray-800 focus:border-[#00FF7F] px-4 py-2 rounded-xl text-xs outline-none"
            />
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-xs text-gray-500">距离生死线(天):</span>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-24 bg-[#0D0E12] text-[#FF4500] border border-gray-800 text-center py-1 rounded-lg text-xs font-bold"
            />
            <button
              onClick={triggerReverseEngine}
              disabled={busy || !target.trim() || !status.trim()}
              className="flex-1 bg-[#00FF7F] text-[#0D0E12] py-2 rounded-xl font-bold text-xs hover:bg-[#00E672] transition-colors disabled:opacity-60"
            >
              {busy ? '计算中…' : '反向折叠时间线'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <span className="text-[10px] text-gray-500 block">DESTINATION // 航标</span>
              <span className="text-white text-sm font-bold">{viewMetrics.targetDestination}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-gray-500 block">DEADLINE COUNTDOWN</span>
              <span className="text-[#FF4500] text-lg font-bold animate-pulse">{viewMetrics.daysLeft} 天后生死交割</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>空间重叠进度: {viewMetrics.progressPercentage}%</span>
              <span>{viewMetrics.completedUnits} / {viewMetrics.totalUnits} 认知包</span>
            </div>
            <div
              className={`w-full h-3 bg-[#0D0E12] rounded-full overflow-hidden border p-[2px] transition-colors duration-300 ${
                splitShaking ? 'border-[#FF4500] shadow-[0_0_12px_rgba(255,69,0,0.45)]' : 'border-gray-800'
              }`}
            >
              <motion.div
                key={`${viewMetrics.progressPercentage}-${viewMetrics.totalUnits}-${splitShaking}`}
                initial={{ width: `${viewMetrics.progressPercentage}%` }}
                animate={{
                  width: `${viewMetrics.progressPercentage}%`,
                  x: splitShaking ? [-6, 6, -4, 4, 0] : 0,
                }}
                transition={{
                  width: { duration: splitShaking ? 0.35 : 1.2, ease: splitShaking ? 'easeIn' : 'easeOut' },
                  x: { duration: 0.5 },
                }}
                className={`h-full rounded-full ${
                  splitShaking
                    ? 'bg-gradient-to-r from-[#FF4500] to-[#FF4500]'
                    : 'bg-gradient-to-r from-[#00FF7F] to-[#FF4500]'
                }`}
              />
            </div>
          </div>

          <p className="text-xs text-gray-400 italic text-center border-t border-gray-800 pt-3">
            “ {externalWhisper || whisper || '矩阵已锁死。把今天的最小动作交给我。'} ”
          </p>
        </div>
      )}
    </div>
  );
}
