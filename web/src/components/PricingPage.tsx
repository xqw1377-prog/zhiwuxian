import { useState } from 'react';
import { isPlatformNative, purchaseProduct, restorePurchases } from '../lib/iap-service';

const PLANS = [
  {
    id: 'wuxian_free',
    name: '免费',
    price: '0',
    period: '永久',
    desc: '体验核心功能',
    features: [
      '每日 20 次 ZHI 对话',
      '基础学习评估',
      '科目目录管理',
      '学习进度追踪',
    ],
    cta: '当前使用',
    disabled: true,
    highlight: false,
  },
  {
    id: 'wuxian_pro_monthly',
    name: 'Pro',
    price: '39',
    period: '月',
    desc: '适合日常学习者',
    features: [
      '无限 ZHI 对话',
      '试卷拍照建档',
      'AI 视频学习陪练',
      '语言陪练（托福/雅思）',
      '深度推理模式',
      '学习趋势预测',
    ],
    cta: '升级 Pro',
    highlight: true,
    stripePriceId: 'price_pro',
  },
  {
    id: 'wuxian_lifetime',
    name: '终身',
    price: '999',
    period: '一次性',
    desc: '一次付费，永久使用',
    features: [
      'Pro 全部功能',
      '无限 Warp 算力',
      '优先新功能体验',
      '专属技术支持',
    ],
    cta: '获取终身',
    highlight: false,
    cert: true,
  },
];

export function PricingPage({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isNative = isPlatformNative();

  const handleUpgrade = async (plan: typeof PLANS[number]) => {
    if (plan.disabled) return;
    if ('cert' in plan && plan.cert) {
      onClose();
      return;
    }

    setBusy(plan.id);
    setError('');

    try {
      if (isNative) {
        // 原生 IAP
        const result = await purchaseProduct(plan.id);
        if (result.success) {
          onClose();
        } else if (!result.cancelled) {
          setError(result.error || '购买失败，请稍后重试');
        }
      } else {
        // Web: Stripe
        if (!plan.stripePriceId) { setError('支付未配置'); return; }
        const token = localStorage.getItem('wuxian_auth_token');
        const userId = localStorage.getItem('wuxian_user_id');
        const res = await fetch('/api/v1/payment/stripe/create-checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ productId: plan.stripePriceId, userId }),
        });
        const json = await res.json();
        const url = json?.data?.url || json?.url;
        if (url) window.open(url, '_blank');
        else setError('无法创建支付会话');
      }
    } catch (e) {
      setError('支付失败，请检查网络');
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (!isNative) return;
    setBusy('restore');
    const result = await restorePurchases();
    if (result.success) {
      onClose();
    } else {
      setError(result.error || '恢复失败');
    }
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-gray-900 border border-gray-700 p-6 md:p-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">选择你的学习方案</h1>
          <p className="text-gray-400 text-sm">
            {isNative ? '将通过 App Store / Google Play 安全支付' : '解锁全部 AI 学习能力'}
          </p>
        </div>

        {error && (
          <div className="mx-auto mb-6 max-w-md rounded-lg bg-red-900/30 border border-red-800/50 px-4 py-2 text-sm text-red-400 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-xl p-6 flex flex-col ${
                plan.highlight
                  ? 'bg-gradient-to-b from-gray-800 to-gray-900 border-2 border-cyan-500 shadow-lg shadow-cyan-500/10'
                  : 'bg-gray-800/50 border border-gray-700'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full text-xs text-white font-medium">
                  推荐
                </div>
              )}

              <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
              <p className="text-sm text-gray-400 mb-4">{plan.desc}</p>

              <div className="mb-6">
                <span className="text-3xl font-bold text-white">¥{plan.price}</span>
                <span className="text-gray-400 text-sm ml-1">/{plan.period}</span>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan)}
                disabled={plan.disabled || busy === plan.id}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                  busy === plan.id
                    ? 'bg-gray-700 text-gray-400 cursor-wait'
                    : plan.highlight
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500'
                    : 'cert' in plan && plan.cert
                    ? 'bg-amber-600/20 text-amber-400 border border-amber-600/30 hover:bg-amber-600/30'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {busy === plan.id ? '处理中...' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          {isNative && (
            <button
              onClick={handleRestore}
              disabled={busy === 'restore'}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
            >
              {busy === 'restore' ? '恢复中...' : '恢复已购项目'}
            </button>
          )}
          <p className="text-xs text-gray-500">
            {isNative
              ? '支付通过 App Store / Google Play 处理 · 可随时取消'
              : '支付由 Stripe 安全处理 · 可随时取消自动续费'}
          </p>
        </div>
      </div>
    </div>
  );
}
