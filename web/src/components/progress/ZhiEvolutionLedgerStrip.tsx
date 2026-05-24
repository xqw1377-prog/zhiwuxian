import { motion } from 'framer-motion';
import type { EvolutionLedgerDto } from '../../lib/zhi-evolution-api';

function formatFlowTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatAmount(kind: EvolutionLedgerDto['flows'][0]['kind'], amount: number): string {
  if (kind === 'warp') return `${amount > 0 ? '+' : ''}${amount} Warp`;
  if (amount === 0) return '里程碑';
  return `${amount > 0 ? '+' : ''}${amount}`;
}

type Props = {
  ledger: EvolutionLedgerDto | null;
  loading?: boolean;
};

export function ZhiEvolutionLedgerStrip({ ledger, loading }: Props) {
  if (loading && !ledger) {
    return <p className="text-[9px] text-gray-600">同步进化账本…</p>;
  }
  if (!ledger) return null;

  return (
    <motion.div className="space-y-3 rounded-xl border border-[#FF4500]/20 bg-[#0B0C10]/80 p-3">
      <motion.div className="flex items-start justify-between gap-2">
        <motion.div>
          <p className="text-[10px] font-black tracking-widest text-[#FF4500]">进化账本</p>
          <p className="mt-1 text-[9px] leading-relaxed text-gray-400">{ledger.coachLine}</p>
        </motion.div>
        <motion.div className="shrink-0 text-right text-[9px] text-gray-500">
          <p>
            梦校 <span className="font-bold text-[#00FF7F]">{ledger.dreamPct}%</span>
            {ledger.dreamDelta7d !== 0 && (
              <span className={ledger.dreamDelta7d > 0 ? ' text-emerald-400' : ' text-rose-400'}>
                {' '}
                {ledger.dreamDelta7d > 0 ? '+' : ''}
                {ledger.dreamDelta7d}%
              </span>
            )}
          </p>
          <p className="mt-0.5">阻力 {ledger.challengeIndex}%</p>
        </motion.div>
      </motion.div>

      <motion.div className="grid grid-cols-3 gap-2 text-center text-[8px]">
        <motion.div className="rounded-lg border border-gray-950 bg-black/40 px-1 py-1.5">
          <p className="text-gray-600">Warp</p>
          <p className="font-bold text-[#00FF7F]">{ledger.warpPoints}</p>
        </motion.div>
        <motion.div className="rounded-lg border border-gray-950 bg-black/40 px-1 py-1.5">
          <p className="text-gray-600">口语 7日</p>
          <p className="font-bold text-amber-400">{ledger.weekStats.languageSessions}</p>
        </motion.div>
        <motion.div className="rounded-lg border border-gray-950 bg-black/40 px-1 py-1.5">
          <p className="text-gray-600">视频卡点</p>
          <p className="font-bold text-violet-400">{ledger.weekStats.videoCheckpoints}</p>
        </motion.div>
      </motion.div>

      <motion.div className="space-y-1">
        <motion.div className="flex items-center gap-2 text-[8px] text-gray-600">
          <span className="w-10">逻辑核</span>
          <motion.div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-950">
            <motion.div
              className="h-full rounded-full bg-[#00FF7F]/70"
              style={{ width: `${ledger.corePercent}%` }}
            />
          </motion.div>
          <span className="w-8 text-right">{ledger.corePercent}%</span>
        </motion.div>
        <motion.div className="flex items-center gap-2 text-[8px] text-gray-600">
          <span className="w-10">深度核</span>
          <motion.div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-950">
            <motion.div
              className="h-full rounded-full bg-violet-500/60"
              style={{ width: `${ledger.deepPercent}%` }}
            />
          </motion.div>
          <span className="w-8 text-right">{ledger.deepPercent}%</span>
        </motion.div>
        {ledger.frozenTokens > 0 && (
          <p className="text-[8px] text-rose-400">冻结惩罚 {ledger.frozenTokens} 逻辑单元</p>
        )}
      </motion.div>

      {ledger.flows.length > 0 && (
        <motion.ul className="max-h-28 space-y-1 overflow-y-auto border-t border-gray-950 pt-2">
          {ledger.flows.slice(0, 8).map((f) => (
            <motion.li
              key={f.id}
              className="flex items-center justify-between gap-2 text-[8px] text-gray-500"
            >
              <span className="min-w-0 truncate">
                <span className="mr-1 text-gray-600">[{f.battle}]</span>
                {f.label}
              </span>
              <span className="shrink-0 tabular-nums text-gray-600">
                {formatAmount(f.kind, f.amount)} · {formatFlowTime(f.at)}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </motion.div>
  );
}
