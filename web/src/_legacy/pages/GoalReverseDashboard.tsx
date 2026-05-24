import { authFetch } from '../lib/api-auth';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface TimelineMilestone {
  phase: string;
  deadline: string;
  action: string;
}

interface SchoolMatrixData {
  targetSchool: string;
  requiredMetrics: Record<string, unknown>;
  gapDetails: string[];
  challengeIndex: number;
  timelineMilestones: TimelineMilestone[];
  activePhase: string | null;
}

function unwrap<T>(json: unknown): T {
  const j = json as { data?: T };
  return (j?.data ?? json) as T;
}

const DEFAULT_BASELINE = { TOEFL: 90, SAT: 1300, AP_Count: 1, GPA: 3.5 };

export function GoalReverseDashboard({ userId }: { userId: string }) {
  const [targetSchool, setTargetSchool] = useState('CMU (Computer Science)');
  const [baselineJson, setBaselineJson] = useState(JSON.stringify(DEFAULT_BASELINE, null, 2));
  const [daysToDeadline, setDaysToDeadline] = useState('180');
  const [matrix, setMatrix] = useState<SchoolMatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v3/school-matrix/${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (res.ok) {
        const data = unwrap<SchoolMatrixData | null>(json);
        if (data?.targetSchool) {
          setMatrix(data);
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

  const handleCompile = async () => {
    setError('');
    let currentBaseline: Record<string, unknown>;
    try {
      currentBaseline = JSON.parse(baselineJson) as Record<string, unknown>;
    } catch {
      setError('Invalid baseline JSON');
      return;
    }
    setCompiling(true);
    try {
      const res = await authFetch('/api/v3/school-matrix/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          targetSchool: targetSchool.trim(),
          currentBaseline,
          daysToDeadline: Number(daysToDeadline) || 180,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = json as { error?: string; message?: string };
        throw new Error(err.error ?? err.message ?? 'Compile failed');
      }
      setMatrix(unwrap<SchoolMatrixData>(json));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compile failed');
    } finally {
      setCompiling(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl rounded-3xl border border-gray-900 bg-[#0D0E12] p-8 font-mono text-[10px] text-gray-600">
        Loading WUXIAN 3.0 dashboard...
      </div>
    );
  }

  const challengeIndex = matrix?.challengeIndex ?? 0;
  const gaps = matrix?.gapDetails ?? [];
  const milestones = matrix?.timelineMilestones ?? [];
  const activePhase = matrix?.activePhase ?? milestones[0]?.phase ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl space-y-8 rounded-3xl border border-gray-900 bg-[#0D0E12] p-8 font-mono text-left"
    >
      <div className="grid grid-cols-1 gap-4 border-b border-gray-900 pb-4 lg:grid-cols-3">
        <label className="block space-y-1 lg:col-span-2">
          <span className="text-[10px] text-gray-500">TARGET SCHOOL</span>
          <input
            value={targetSchool}
            onChange={(e) => setTargetSchool(e.target.value)}
            className="w-full rounded-lg border border-gray-800 bg-[#14161D] px-3 py-2 text-xs text-white outline-none focus:border-[#00FF7F]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] text-gray-500">DAYS</span>
          <input
            value={daysToDeadline}
            onChange={(e) => setDaysToDeadline(e.target.value)}
            className="w-full rounded-lg border border-gray-800 bg-[#14161D] px-3 py-2 text-xs text-white outline-none focus:border-[#00FF7F]"
          />
        </label>
        <label className="block space-y-1 lg:col-span-3">
          <span className="text-[10px] text-gray-500">BASELINE JSON</span>
          <textarea
            value={baselineJson}
            onChange={(e) => setBaselineJson(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-lg border border-gray-800 bg-[#14161D] px-3 py-2 font-mono text-[11px] text-gray-300 outline-none focus:border-[#00FF7F]"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 lg:col-span-3">
          <button
            type="button"
            disabled={compiling || !targetSchool.trim()}
            onClick={() => void handleCompile()}
            className="rounded-lg bg-[#00FF7F] px-4 py-2 text-xs font-bold text-[#0D0E12] hover:bg-[#00E672] disabled:opacity-50"
          >
            {compiling ? 'Compiling...' : 'Run 3.0 Metrics Compiler'}
          </button>
          {error ? <span className="text-[11px] text-[#FF4500]">{error}</span> : null}
        </div>
      </div>

      {matrix ? (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-900 pb-6">
            <div>
              <p className="text-xs font-bold tracking-widest text-[#00FF7F]">TARGET DESTINATION</p>
              <h2 className="text-2xl font-extrabold text-white sm:text-3xl">{matrix.targetSchool}</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-[10px] text-gray-500">
                <p>CHALLENGE INDEX</p>
                <p className="text-[#FF4500]">1-100</p>
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#FF4500] bg-[#FF4500]/5">
                <span className="text-xl font-black text-[#FF4500]">{challengeIndex}</span>
              </div>
            </div>
          </header>

          <div className="flex flex-wrap gap-2 rounded-xl border border-gray-900 bg-[#14161D] p-4 text-[10px]">
            <span className="w-full font-bold text-[#00FF7F]">REQUIRED METRICS</span>
            {Object.entries(matrix.requiredMetrics).map(([k, v]) => (
              <span key={k} className="text-gray-300">
                {k}: {String(v)}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-900 bg-[#14161D] p-6">
              <h4 className="mb-4 text-xs font-bold text-gray-400">GAP DETECTOR</h4>
              <ul className="space-y-3">
                {gaps.map((gap, idx) => (
                  <li key={idx} className="flex gap-2 text-xs text-gray-300">
                    <span className="text-[#FF4500]">!</span>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gray-900 bg-[#14161D] p-6">
              <h4 className="mb-4 text-xs font-bold text-[#00FF7F]">TIMELINE MATRIX</h4>
              <div className="ml-2 space-y-6 border-l border-gray-800 pl-4">
                {milestones.map((ms, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex flex-wrap justify-between gap-2 text-[10px]">
                      <span className="font-bold text-[#00FF7F]">{ms.phase}</span>
                      <span className="rounded border border-gray-800 px-2 text-gray-500">{ms.deadline}</span>
                    </div>
                    <p className="text-xs text-gray-400">{ms.action}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <footer className="flex flex-wrap justify-between gap-2 rounded-xl border border-gray-900 p-4 text-[11px] text-gray-500">
            <span>WUXIAN 3.0 radar phase: {activePhase ?? 'pending'}</span>
            <span className="animate-pulse font-bold text-[#00FF7F]">READY</span>
          </footer>
        </>
      ) : (
        <p className="py-4 text-center text-[11px] text-gray-600">Run compiler to build challenge index and timeline.</p>
      )}
    </motion.div>
  );
}
