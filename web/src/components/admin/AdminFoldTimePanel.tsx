import { useCallback, useEffect, useState } from 'react';
import { getAuthToken } from '../../lib/api-auth';

type FoldTimeOkr = {
  anchoredUsers: number;
  qualifiedActiveLearners: number;
  qalRatePct: number;
  weaknessImprovementRatePct: number;
  avgFoldIndexQAL: number;
  targets: { qalRatePct: number; weaknessImprovementRatePct: number; foldLiftMedian: number };
};

type UserRow = {
  userId: string;
  cohort: string;
  targetSchool: string;
  pathCompletenessPct: number;
  papersReckoned28d: number;
  foldEfficiencyIndex: number;
  qualifiedActiveLearner: boolean;
  weaknessImproved: boolean;
};

type FoldTimeDto = {
  cohortCounts: Record<string, number>;
  loopCompletionRatePct: number;
  avgFoldIndexL2L3: number;
  okr: FoldTimeOkr;
  topUsers: UserRow[];
  qalUsers: UserRow[];
  pathUsersTotal: number;
  pathUsersActive28d: number;
  assessmentPapers7d: number;
};

function ProgressBar({
  label,
  value,
  target,
  suffix = '%',
}: {
  label: string;
  value: number;
  target: number;
  suffix?: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const hit = value >= target;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className={hit ? 'text-emerald-400' : 'text-gray-300'}>
          {value}
          {suffix} / 目标 {target}
          {suffix}
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${hit ? 'bg-emerald-600' : 'bg-cyan-700'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function UserTable({
  rows,
  onPickUser,
}: {
  rows: UserRow[];
  onPickUser?: (userId: string) => void;
}) {
  if (!rows.length) {
    return <p className="text-gray-500 text-sm py-4 text-center">暂无数据</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="text-left py-2 pr-2">用户</th>
            <th className="text-left py-2">层级</th>
            <th className="text-right py-2">完备度</th>
            <th className="text-right py-2">交卷</th>
            <th className="text-right py-2">折叠率</th>
            <th className="text-center py-2">QAL</th>
            <th className="text-center py-2">弱项↑</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="border-b border-gray-800/50 hover:bg-gray-800/40">
              <td className="py-2 pr-2 font-mono text-gray-300 max-w-[140px] truncate">
                {onPickUser ? (
                  <button
                    type="button"
                    className="text-cyan-400 hover:underline text-left truncate max-w-full"
                    onClick={() => onPickUser(r.userId)}
                  >
                    {r.userId}
                  </button>
                ) : (
                  r.userId
                )}
              </td>
              <td className="py-2 text-gray-400">{r.cohort}</td>
              <td className="py-2 text-right">{r.pathCompletenessPct}%</td>
              <td className="py-2 text-right">{r.papersReckoned28d}</td>
              <td className="py-2 text-right text-purple-300">{r.foldEfficiencyIndex}</td>
              <td className="py-2 text-center">{r.qualifiedActiveLearner ? '✓' : '—'}</td>
              <td className="py-2 text-center">{r.weaknessImproved ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminFoldTimePanel({ onPickUser }: { onPickUser?: (userId: string) => void }) {
  const [data, setData] = useState<FoldTimeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const token = getAuthToken();
    try {
      const res = await fetch('/api/v1/admin/stats/fold-time?limit=80', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || json?.message || '加载失败');
      setData(json?.data ?? json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-gray-400 text-sm animate-pulse">加载折叠时间指标…</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!data) return null;

  const { okr } = data;

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gray-900 border border-emerald-900/40 p-5">
        <h3 className="text-sm font-medium text-emerald-400 mb-1">核心 OKR · QAL 合格主动学习者</h3>
        <p className="text-[10px] text-gray-500 mb-4">
          28 天内：梦校航标 + 路径完备度 ≥70% + ≥3 次交卷 + 路径活跃。详见 docs/metrics-fold-time.md
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: '已锁航标', value: okr.anchoredUsers, color: 'text-cyan-400' },
            { label: 'QAL 用户', value: okr.qualifiedActiveLearners, color: 'text-emerald-400' },
            { label: 'QAL 占比', value: `${okr.qalRatePct}%`, color: 'text-amber-400' },
            { label: '弱项改善率', value: `${okr.weaknessImprovementRatePct}%`, color: 'text-pink-400' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-gray-950 border border-gray-800 p-3">
              <p className="text-[10px] text-gray-500">{item.label}</p>
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
        <ProgressBar label="QAL 占比" value={okr.qalRatePct} target={okr.targets.qalRatePct} />
        <ProgressBar
          label="弱项改善率（QAL 内）"
          value={okr.weaknessImprovementRatePct}
          target={okr.targets.weaknessImprovementRatePct}
        />
        <p className="text-[10px] text-gray-600 mt-2">
          L3 闭环率 {data.loopCompletionRatePct}% · L2/L3 平均折叠率 {data.avgFoldIndexL2L3} · QAL 平均折叠率{' '}
          {okr.avgFoldIndexQAL}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['L0', 'L1', 'L2', 'L3'] as const).map((k) => (
          <div key={k} className="rounded-lg bg-gray-900 border border-gray-800 p-3 text-center">
            <p className="text-[10px] text-gray-500">{k}</p>
            <p className="text-lg font-bold text-white">{data.cohortCounts[k] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">QAL 用户列表</h3>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[10px] text-gray-400 hover:text-white"
          >
            刷新
          </button>
        </div>
        <UserTable rows={data.qalUsers} onPickUser={onPickUser} />
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-white mb-3">L2/L3 折叠效率 Top</h3>
        <UserTable rows={data.topUsers} onPickUser={onPickUser} />
      </div>
    </div>
  );
}
