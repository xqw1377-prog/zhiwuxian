import { authFetch } from '../lib/api-auth';
import { unwrapEnvelope } from '../lib/api-envelope';
import { onWalletBump } from '../lib/wuxian-events';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

type FlowRow = {
  flow_id: string;
  target_battle: string;
  token_type_used: string;
  amount_changed: number;
  action_description: string;
  timestamp: number;
};

type LedgerView = {
  coreLogicTokens: number;
  deepReasoningTokens: number;
  frozenPunishTokens: number;
  corePercent: number;
  deepPercent: number;
  recentFlows: FlowRow[];
};

function battleLabel(b: string): string {
  return b === 'TOEFL_LANGUAGE_MATRIX' ? 'TOEFL_LANGUAGE_MATRIX' : 'AP_KNOWLEDGE_FORGE';
}

function formatFlowAmount(row: FlowRow): string {
  const n = Math.abs(row.amount_changed);
  const label = row.token_type_used === 'DEEP_REASONING' ? 'Deep Token' : 'Core Token';
  return `-${n.toLocaleString()} ${label}`;
}

export function ZhiTokenDashboard({
  userId,
  refreshKey = 0,
}: {
  userId: string;
  refreshKey?: number;
}) {
  const [ledger, setLedger] = useState<LedgerView | null>(null);
  const [injecting, setInjecting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v3.5/zhi/token-ledger/${encodeURIComponent(userId)}?limit=12`);
      const json = await res.json();
      if (res.ok) setLedger(unwrapEnvelope<LedgerView>(json));
    } catch {
      /* offline */
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => onWalletBump(() => void refresh()), [refresh]);

  const handleInject = async (pack: 'CORE' | 'DEEP' | 'BALANCED') => {
    setInjecting(true);
    try {
      const res = await authFetch('/api/v3.5/zhi/token-inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pack }),
      });
      const json = await res.json();
      if (res.ok) setLedger(unwrapEnvelope<LedgerView>(json));
    } finally {
      setInjecting(false);
    }
  };

  const coreLogic = ledger?.coreLogicTokens ?? 100_000;
  const deepReasoning = ledger?.deepReasoningTokens ?? 5_000;
  const frozenPunish = ledger?.frozenPunishTokens ?? 0;
  const corePct = ledger?.corePercent ?? 84;
  const deepPct = ledger?.deepPercent ?? 41.2;
  const flows = ledger?.recentFlows ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl select-none p-4 font-mono text-left">
      <div className="space-y-6 rounded-2xl border-2 border-[#00FF7F]/30 bg-[#050608] p-6 shadow-[0_0_50px_rgba(0,255,127,0.06)]">
        <div className="flex items-baseline justify-between border-b border-gray-950 pb-3">
          <div>
            <h2 className="text-xs font-black tracking-widest text-white">
              ZHI // TOKEN COMPUTE SPLITTER
            </h2>
            <p className="mt-0.5 text-[9px] text-gray-500">
              单体生命体 Token 计算分离终端 · 唯一使用者：智宝
            </p>
          </div>
          <span className="rounded border border-[#00FF7F]/20 bg-[#00FF7F]/5 px-2 py-0.5 text-[9px] font-bold text-[#00FF7F]">
            双核独立计算闭环
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="relative space-y-3 overflow-hidden rounded-xl border border-gray-900 bg-[#0B0C10] p-4">
            <motion.div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-wider text-[#00FF7F]">
                ⚛️ 基础逻辑细胞核
              </span>
              <span className="text-[8px] text-gray-600">CORE_LOGIC</span>
            </motion.div>
            <div>
              <span className="font-mono text-xl font-black text-white">
                {coreLogic.toLocaleString()}
              </span>
              <span className="mt-0.5 block text-[9px] text-gray-500">
                负责：Option+Space 拉框、日常真题文本判定、AP 因果焊接
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-gray-950">
              <div className="h-full bg-[#00FF7F]" style={{ width: `${corePct}%` }} />
            </div>
            <button
              type="button"
              disabled={injecting}
              onClick={() => void handleInject('CORE')}
              className="text-[8px] text-gray-500 transition-colors hover:text-[#00FF7F]"
            >
              注入逻辑补充包 ➔
            </button>
          </div>

          <div className="relative space-y-3 overflow-hidden rounded-xl border border-gray-900 bg-[#0B0C10] p-4">
            <motion.div className="flex items-center justify-between">
              <span className="text-[10px] font-black tracking-wider text-[#FF4500]">
                🧠 重型深度推理核
              </span>
              <span className="text-[8px] text-gray-600">DEEP_REASONING</span>
            </motion.div>
            <div>
              <span className="font-mono text-xl font-black text-white">{deepReasoning}</span>
              <span className="mt-0.5 block text-[9px] text-gray-500">
                负责：托福口语切片、全真模考清算、影子题跨模态变异
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-gray-950">
              <div className="h-full bg-[#FF4500]" style={{ width: `${deepPct}%` }} />
            </div>
            <button
              type="button"
              disabled={injecting}
              onClick={() => void handleInject('DEEP')}
              className="text-[8px] text-gray-500 transition-colors hover:text-[#FF4500]"
            >
              注入深度推理包 ➔
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="block text-[9px] uppercase text-gray-500">
              // 智无限生命体高频流动热图
            </span>
            {frozenPunish > 0 && (
              <span className="animate-pulse text-[9px] font-bold text-red-500">
                🚨 警告：有 {frozenPunish.toLocaleString()} 个逻辑单元处于逃避冻结惩罚状态
              </span>
            )}
          </div>

          <div className="space-y-2.5 rounded-xl border border-gray-950 bg-black p-3 font-sans text-[11px]">
            {flows.length === 0 ? (
              <p className="text-center text-gray-600">尚无能量分流记录。发起一次 ZHI 动作即可入账。</p>
            ) : (
              flows.map((row, idx) => (
                <div
                  key={row.flow_id}
                  className={`flex justify-between text-gray-400 ${idx > 0 ? 'border-t border-gray-950 pt-2' : ''}`}
                >
                  <div className="flex flex-col pr-2">
                    <span>{row.action_description}</span>
                    <span className="text-[8px] text-gray-600">战线: {battleLabel(row.target_battle)}</span>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-xs font-bold ${
                      row.token_type_used === 'DEEP_REASONING' ? 'text-[#FF4500]' : 'text-[#00FF7F]'
                    }`}
                  >
                    {formatFlowAmount(row)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <p className="text-center text-[9px] italic text-gray-600">
          &ldquo;ZHI 提示：智无限生命体正在稳定呼吸。双核独立计算已就绪，拒绝任何账目污染。&rdquo;
        </p>
      </div>
    </div>
  );
}
