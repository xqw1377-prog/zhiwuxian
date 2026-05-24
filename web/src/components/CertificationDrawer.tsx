import { authFetch } from '../lib/api-auth';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { onWuxianEventUntyped, WUXIAN_EVENTS } from '../lib/wuxian-events';

interface Props {
  userId: string;
  isLifetimeCertified?: boolean;
  hasPrivateApiKey?: boolean;
  onSync: () => void;
}

export default function CertificationDrawer({
  userId,
  isLifetimeCertified = false,
  hasPrivateApiKey = false,
  onSync,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [ltcCode, setLtcCode] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => onWuxianEventUntyped(WUXIAN_EVENTS.hideOverlays, () => setIsOpen(false)), []);

  const handleSave = async () => {
    if (!ltcCode.trim()) {
      setStatusMsg('请填写终身认证码');
      return;
    }
    setSaving(true);
    setStatusMsg('正在写入终身认证状态…');
    try {
      const res = await authFetch('/api/v1/user/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          ltcCode: ltcCode.trim() || undefined,
        }),
      });
      const json = await res.json();
      const d = json.data ?? json;
      if (d.success) {
        setStatusMsg(
          d.isLifetimeCertified
            ? '🚀 终身认同已点亮！无限续航。'
            : '🚨 认证码无效。',
        );
        setLtcCode('');
        onSync();
        setTimeout(() => {
          setIsOpen(false);
          setStatusMsg('');
        }, 1500);
      } else {
        setStatusMsg('🚨 同步失败，引力场不稳定。');
      }
    } catch {
      setStatusMsg('🚨 网络异常，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-6 z-40 font-mono">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-[#161820] border border-gray-800 text-[#00FF7F] px-4 py-2 rounded-xl text-xs hover:border-[#00FF7F] hover:shadow-[0_0_20px_rgba(0,255,127,0.25)] transition-all duration-300"
      >
        {isOpen ? '✕ 关闭控制台' : '⚙️ 终身认证'}
        {isLifetimeCertified && (
          <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-[#00FF7F] animate-pulse" />
        )}
      </button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="absolute bottom-14 left-0 w-80 bg-[#161820] border border-[#00FF7F]/30 rounded-2xl p-5 space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.6),0_0_30px_rgba(0,255,127,0.08)]"
        >
          <header>
            <h3 className="text-sm font-bold text-white tracking-wider">
              WUXIAN // 终身与端侧认证
            </h3>
            <p className="text-[10px] text-gray-500 mt-1">平台统一使用 DeepSeek 托管算力；终身认证用于解锁无限续航。</p>
            {isLifetimeCertified && (
              <p className="text-[10px] text-[#00FF7F] mt-2">
                ✓ 终身认证
              </p>
            )}
          </header>

          <motion.div className="space-y-3 text-xs">
            <motion.div className="space-y-1">
              <label className="text-gray-400 block">终身认证码 (Lifetime Certificate):</label>
              <input
                type="text"
                value={ltcCode}
                onChange={(e) => setLtcCode(e.target.value)}
                placeholder="输入认同序列或购买所得代码"
                className="w-full bg-[#0D0E12] text-white border border-gray-800 focus:border-[#00FF7F] px-3 py-2 rounded-lg outline-none transition-colors placeholder-gray-700"
              />
            </motion.div>
          </motion.div>

          {statusMsg && (
            <p className="text-[10px] text-center text-gray-400 italic animate-pulse">{statusMsg}</p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#00FF7F] text-[#0D0E12] py-2 rounded-xl font-bold text-xs hover:bg-[#00E672] disabled:opacity-50 transition-colors shadow-[0_0_16px_rgba(0,255,127,0.35)]"
          >
            {saving ? '写入中…' : '写入核心量子矩阵'}
          </button>
        </motion.div>
      )}
    </div>
  );
}
