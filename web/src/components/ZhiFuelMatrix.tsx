import { authFetch } from '../lib/api-auth';
import { unwrapEnvelope } from '../lib/api-envelope';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LegalLinks } from './LegalLinks';

type BillingPayload = {
  availableWarpPoints: number;
  challengeIndex: number | null;
  certaintyProgress: number | null;
};

type FuelCatalogItem = {
  taskType: string;
  title: string;
  costWarp: number;
  maxTokens: number;
  channel: 'text' | 'vision';
};

export function ZhiFuelMatrix({
  userId,
  refreshKey = 0,
}: {
  userId: string;
  refreshKey?: number;
}) {
  const { t } = useTranslation();
  const [warpBalance, setWarpBalance] = useState(0);
  const [challengeIndex, setChallengeIndex] = useState(92);
  const [topping, setTopping] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [payMsg, setPayMsg] = useState('');
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalog, setCatalog] = useState<FuelCatalogItem[] | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');

  const gpa = 3.85;
  const expectedAp = Math.min(5, Math.max(1, Math.round(5 - challengeIndex / 25)));
  const collapseRate = Math.max(0, Math.min(99, 100 - challengeIndex));

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v3.5/billing/status/${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (!res.ok) return;
      const d = unwrapEnvelope<BillingPayload>(json);
      setWarpBalance(d.availableWarpPoints ?? 0);
      if (d.challengeIndex != null) setChallengeIndex(d.challengeIndex);
    } catch {
      /* offline */
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (!showCatalog || catalog) return;
    void (async () => {
      try {
        const res = await authFetch('/api/v1/fuel/catalog');
        const json = await res.json().catch(() => null);
        if (!res.ok) return;
        const d = unwrapEnvelope<{ items: FuelCatalogItem[] }>(json);
        const items = Array.isArray(d.items) ? d.items : [];
        setCatalog(items.slice(0, 12));
      } catch {
        setCatalog([]);
      }
    })();
  }, [showCatalog, catalog]);

  const handleTopUp = async () => {
    setTopping(true);
    setPayMsg('');
    try {
      const res = await authFetch('/api/v3.5/billing/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: 100 }),
      });
      const json = await res.json();
      if (res.ok) {
        const d = unwrapEnvelope<{ remaining: number }>(json);
        setWarpBalance(d.remaining);
        setPayMsg(t('fuelMatrix.topupOk'));
      }
    } finally {
      setTopping(false);
    }
  };

  const handleRedeem = async () => {
    const code = activationCode.trim();
    if (!code) return;
    setRedeeming(true);
    setRedeemMsg('');
    try {
      const res = await authFetch('/api/v1/fuel/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setRedeemMsg('兑换失败');
        return;
      }
      const d = unwrapEnvelope<{ granted: number; balance: number }>(json);
      setActivationCode('');
      if (typeof d.balance === 'number') setWarpBalance(d.balance);
      setRedeemMsg(`已到账 +${d.granted} Warp`);
      void refresh();
    } catch {
      setRedeemMsg('兑换失败');
    } finally {
      setRedeeming(false);
    }
  };

  /** 走 v1 收银台：simulate 下 create → confirm；live 需接第三方 checkout */
  const handlePurchaseWarp10h = async () => {
    setPurchasing(true);
    setPayMsg('');
    try {
      const createRes = await authFetch('/api/v1/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, productId: 'warp_10h' }),
      });
      const createJson = await createRes.json().catch(() => null);
      if (!createRes.ok) {
        setPayMsg(t('fuelMatrix.orderFail'));
        return;
      }
      const order = unwrapEnvelope<{ orderId: string; checkoutUrl?: string | null }>(createJson);
      if (!order.orderId) {
        setPayMsg(t('fuelMatrix.orderNotCreated'));
        return;
      }
      const confirmRes = await authFetch('/api/v1/payment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.orderId }),
      });
      const confirmJson = await confirmRes.json().catch(() => null);
      if (!confirmRes.ok) {
        setPayMsg(t('fuelMatrix.confirmFail'));
        return;
      }
      const confirmed = unwrapEnvelope<{ wallet: { availableWarpMinutes: number } }>(confirmJson);
      setWarpBalance(confirmed.wallet?.availableWarpMinutes ?? warpBalance);
      setPayMsg(t('fuelMatrix.purchaseOk'));
    } catch {
      setPayMsg(t('fuelMatrix.paymentError'));
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl font-mono">
      <div className="space-y-4 rounded-xl border border-gray-900 bg-[#090A0D] p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between text-[10px]"
        >
          <span className="text-gray-500">{t('fuelMatrix.header')}</span>
          <motion.div className="flex space-x-2 text-gray-400">
            <span>
              {t('fuelMatrix.gpa')} <strong className="text-white">{gpa}</strong>
            </span>
            <span>|</span>
            <span>
              {t('fuelMatrix.apForecast', { score: expectedAp, rate: collapseRate })}
            </span>
          </motion.div>
        </motion.div>

        <div className="grid grid-cols-3 gap-2 rounded-lg border border-gray-950 bg-black p-3">
          <motion.div className="col-span-2 space-y-1">
            <span className="block text-[9px] uppercase text-[#00FF7F]">{t('fuelMatrix.warpReserve')}</span>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-900 p-[1px]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#00FF7F] to-[#00E06F]"
                style={{ width: `${Math.min(100, (warpBalance / 500) * 100)}%` }}
              />
            </div>
          </motion.div>
          <motion.div className="col-span-1 text-right">
            <span className="block text-[12px] font-black text-white">
              {warpBalance} <span className="text-[8px] font-normal text-gray-500">Warp</span>
            </span>
            <div className="mt-1 flex flex-col gap-1 items-end">
              <button
                type="button"
                disabled={purchasing}
                onClick={() => void handlePurchaseWarp10h()}
                className="rounded border border-[#00FF7F]/40 bg-[#00FF7F]/10 px-1.5 py-0.5 text-[8px] text-[#00FF7F] transition-all hover:border-[#00FF7F] disabled:opacity-50"
              >
                {purchasing ? t('fuelMatrix.verifying') : t('fuelMatrix.buyWarp')}
              </button>
              <button
                type="button"
                disabled={topping}
                onClick={() => void handleTopUp()}
                className="rounded border border-[#FF4500]/30 bg-[#FF4500]/5 px-1.5 py-0.5 text-[8px] text-[#FF4500] transition-all hover:border-[#FF4500]"
              >
                {t('fuelMatrix.topup')}
              </button>
            </div>
          </motion.div>
        </div>

        {payMsg && <p className="text-[9px] text-center text-gray-500">{payMsg}</p>}
        {redeemMsg && <p className="text-[9px] text-center text-gray-500">{redeemMsg}</p>}

        <p className="text-[9px] italic text-gray-600">
          &ldquo;{t('fuelMatrix.hint')}&rdquo;
        </p>

        <div className="rounded-lg border border-gray-950 bg-black/40 p-3">
          <button
            type="button"
            onClick={() => setShowCatalog(v => !v)}
            className="text-[9px] text-gray-400 hover:text-white transition-colors"
          >
            {showCatalog ? '收起消耗表' : '查看消耗表'}
          </button>
          {showCatalog && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
              {(catalog ?? []).map((it) => (
                <div
                  key={it.taskType}
                  className="rounded-md border border-gray-950 bg-[#0D0E12] px-2 py-1"
                  title={`${it.taskType} · maxTokens ${it.maxTokens}`}
                >
                  <div className="text-gray-200">{it.title}</div>
                  <div className="text-gray-600">
                    {it.costWarp} Warp · {it.channel}
                  </div>
                </div>
              ))}
              {catalog && catalog.length === 0 ? (
                <div className="col-span-2 text-gray-600">消耗表暂不可用</div>
              ) : null}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-950 bg-black/40 p-3">
          <div className="text-[9px] text-gray-400">兑换燃料码</div>
          <div className="mt-2 flex gap-2">
            <input
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value)}
              placeholder="WUX-..."
              className="w-full rounded border border-gray-900 bg-black px-2 py-1 text-[9px] text-gray-200 placeholder:text-gray-700 outline-none focus:border-gray-700"
            />
            <button
              type="button"
              disabled={redeeming || !activationCode.trim()}
              onClick={() => void handleRedeem()}
              className="rounded border border-gray-950 bg-white/5 px-2 py-1 text-[9px] text-gray-200 hover:bg-white/10 disabled:opacity-50"
            >
              兑换
            </button>
          </div>
          <div className="mt-1 text-[8px] text-gray-700">
            学校/渠道发放的激活码可直接到账 Warp
          </div>
        </div>

        <LegalLinks className="border-t border-gray-950 pt-3 text-[8px] text-gray-600" />
      </div>
    </div>
  );
}
