import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '../lib/api-auth';

type WalletSummary = {
  availableWarpMinutes: number;
  unlimitedUntil: string | null;
  credits: number;
  tier: string;
  wormholeEnabled: boolean;
  isLifetimeCertified?: boolean;
  hasPrivateApiKey?: boolean;
};

function warpLabel(wallet: WalletSummary | null): string {
  if (!wallet) return '…';
  if (wallet.isLifetimeCertified) return '∞ 终身';
  if (wallet.unlimitedUntil && new Date(wallet.unlimitedUntil) > new Date()) return '∞ 全时空';
  return `${Math.round(wallet.availableWarpMinutes ?? 0)} min`;
}

export function WalletShield(props: {
  userId: string;
  refreshKey?: number;
  onClick?: () => void;
}) {
  const { userId, refreshKey, onClick } = props;
  const [wallet, setWallet] = useState<WalletSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch(`/api/v1/wallet/${encodeURIComponent(userId)}`)
      .then(r => r.json().catch(() => null))
      .then((j) => {
        if (cancelled) return;
        const d = (j?.data ?? j) as WalletSummary | null;
        if (d) setWallet(d);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, refreshKey]);

  const tierLabel = useMemo(() => {
    const t = (wallet?.tier ?? 'free').toString().toUpperCase();
    return t === 'PRO' ? 'PRO' : t === 'GROWTH' ? 'GROWTH' : 'FREE';
  }, [wallet?.tier]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed top-6 right-6 z-50 flex items-center gap-3 px-3 py-2 rounded-xl border border-emerald-500/25 bg-zinc-950/40 backdrop-blur-md hover:border-emerald-400/40 transition-colors"
      title="钱包与账本状态"
    >
      <div className="flex flex-col items-end leading-tight">
        <div className="text-[10px] tracking-[0.28em] uppercase text-emerald-400/70">WALLET SHIELD</div>
        <div className="text-xs font-mono text-emerald-300">Warp {warpLabel(wallet)}</div>
        <div className="text-[10px] font-mono text-zinc-500">
          {tierLabel} · {Math.round(wallet?.credits ?? 0)} cr
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="w-9 h-9 rounded-full border border-emerald-500/25 bg-[#0D0E12] flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
        </div>
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${wallet?.wormholeEnabled ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
          <span className={`w-1.5 h-1.5 rounded-full ${wallet?.isLifetimeCertified ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
          <span className={`w-1.5 h-1.5 rounded-full ${wallet?.hasPrivateApiKey ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
        </div>
      </div>
    </button>
  );
}

