import { useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import type { ReversingMetrics } from './ReversingDashboard';
import {jsonAuthHeaders, authFetch } from '../lib/api-auth';

interface TopologyTelemetryProps {
  userId: string;
  onMetricsUpdate: (metrics: ReversingMetrics, whisper: string, splitTriggered: boolean) => void;
}

function unwrap<T>(json: unknown): T {
  const j = json as { data?: T };
  return (j?.data ?? json) as T;
}

export function TopologyTelemetry({ userId, onMetricsUpdate }: TopologyTelemetryProps) {
  const [concept, setConcept] = useState('泰勒级数收敛性');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const controls = useAnimation();

  const simulateHit = async () => {
    setLoading(true);
    setStatusMsg('');
    try {
      const res = await authFetch('/api/v1/topology/telemetry-hit', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ userId, matchedConcept: concept, captureType: 'VOICE' }),
      });
      const raw = await res.text();
      const json = (() => {
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return null;
        }
      })();

      if (!res.ok) {
        const err = (json ?? {}) as { error?: string; message?: string; status?: string; code?: unknown };
        const hint = err?.error || err?.message || (typeof err?.status === 'string' ? err.status : '') || raw;
        setStatusMsg(hint ? `请求失败：${String(hint).slice(0, 160)}` : `请求失败：HTTP ${res.status}`);
        return;
      }

      const data = unwrap<{
        success?: boolean;
        splitTriggered?: boolean;
        weaverWhisper?: string;
        metrics?: ReversingMetrics;
      }>(json);

      if (data?.success && data.metrics) {
        onMetricsUpdate(
          data.metrics,
          data.weaverWhisper ?? '',
          Boolean(data.splitTriggered),
        );
        setStatusMsg(data.weaverWhisper ? `已记录：${data.weaverWhisper.slice(0, 160)}` : '已记录遥测撞击');

        if (data.splitTriggered) {
          await controls.start({
            x: [-10, 10, -10, 10, 0],
            borderColor: ['#FF4500', '#FF4500', '#808080', '#FF4500', '#808080'],
            transition: { duration: 0.55 },
          });
        }
      } else {
        setStatusMsg('未收到有效遥测回包（请检查 userId / 后端日志）');
      }
    } catch (e) {
      setStatusMsg(`请求异常：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-[#161820] border border-gray-800 rounded-2xl p-5 font-mono space-y-4">
      <motion.div
        animate={controls}
        className="rounded-2xl border border-gray-800 p-1"
      >
        <motion.div className="space-y-4 p-4">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-[#00FF7F]">// 模拟 2.0 暗中遥测拦截：</span>
            <span className="text-[10px] text-gray-500">（连续点击 3 次模拟严重卡点）</span>
          </div>

          <div className="flex space-x-3">
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className="flex-1 bg-[#0D0E12] border border-gray-800 text-xs rounded-xl px-4 py-2 text-white outline-none focus:border-[#00FF7F]"
            />
            <button
              type="button"
              onClick={simulateHit}
              disabled={loading}
              className="bg-transparent border border-[#FF4500] text-[#FF4500] px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#FF4500] hover:text-white transition-colors disabled:opacity-50"
            >
              {loading ? '遥测中…' : '连续撞击卡点'}
            </button>
          </div>

          {statusMsg && (
            <div className="text-[11px] text-zinc-500 leading-relaxed">
              {statusMsg}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
