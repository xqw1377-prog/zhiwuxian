import { authFetch } from './lib/api-auth';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { jsonAuthHeaders } from './lib/api-auth';

interface Props {
  data: Record<string, unknown>;
  userId: string;
  onClose: () => void;
  onWalletRefresh?: () => Promise<void>;
}

export default function CyberStarCard({ data, userId, onClose, onWalletRefresh }: Props) {
  const [unlocked, setUnlocked] = useState(Boolean(data.isUnlocked));
  const [shareUrl, setShareUrl] = useState<string | null>(
    typeof data.shareUrl === 'string' ? data.shareUrl : null,
  );
  const [paying, setPaying] = useState(false);

  const il = Number(data.ilPeak ?? 0);
  const ps = Number(data.psPeak ?? 0);
  const rd = Number(data.resilienceDensity ?? 0);
  const reportId = String(data.reportId ?? '');
  const summary = String(data.summaryText ?? '');
  const price = String(data.price ?? '19.90');

  const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

  const unlock = async () => {
    if (!reportId) return;
    setPaying(true);
    try {
      const createRes = await authFetch(`/api/v1/report/cognitive/${reportId}/unlock`, {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ userId }),
      });
      const createJson = await createRes.json();
      const orderId = createJson.data?.order?.orderId;
      if (!orderId) throw new Error('创建解锁订单失败');

      const confirmRes = await authFetch('/api/v1/payment/confirm', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ orderId }),
      });
      const confirmJson = await confirmRes.json();
      const report = confirmJson.data?.report ?? createJson.data?.preview;
      if (report?.shareUrl) {
        setShareUrl(report.shareUrl);
        setUnlocked(true);
        window.open(report.shareUrl, '_blank');
      }
      await onWalletRefresh?.();
    } finally {
      setPaying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md hairline border border-emerald-500/30 rounded-2xl bg-zinc-950 p-6 shadow-[0_0_40px_rgba(52,211,153,0.12)]"
      >
        <div className="text-[10px] text-emerald-400/70 tracking-[0.3em] uppercase mb-2">Cyber Star Card</div>
        <h3 className="text-xl font-bold text-zinc-100 mb-4">认知模态天赋诊断</h3>

        <div className="space-y-3 mb-6">
          {[
            { label: '直觉跳跃 IL', value: il, color: 'bg-emerald-400' },
            { label: '模式敏感 PS', value: ps, color: 'bg-cyan-400' },
            { label: '韧性密度 RD', value: rd, color: 'bg-violet-400' },
          ].map((m) => (
            <div key={m.label}>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>{m.label}</span>
                <span className="text-emerald-300">{pct(m.value)}</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full ${m.color} opacity-80`} style={{ width: pct(m.value) }} />
              </div>
            </div>
          ))}
        </div>

        <p className="text-sm text-zinc-400 leading-relaxed mb-6 border-l border-emerald-500/40 pl-3">
          {il >= 0.9
            ? `你拥有 ${pct(il)} 非线性直觉。在连续卡点中你触发了重路由，但最终无痛折返——你是一个高韧性的自学者。`
            : summary || '你的认知波形稳定，路径重路由韧性良好。'}
        </p>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs text-zinc-500 px-3 py-2">关闭</button>
          {unlocked && shareUrl && (
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-300 px-3 py-2 border border-emerald-500/30 rounded"
            >
              打开霓虹海报
            </a>
          )}
          {!unlocked && (
            <button
              onClick={unlock}
              disabled={paying}
              className="text-xs font-bold bg-emerald-500 text-black px-4 py-2 rounded shadow-[0_0_12px_rgba(52,211,153,0.35)] disabled:opacity-50"
            >
              {paying ? '验单中…' : `解锁霓虹海报 ¥${price}`}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
