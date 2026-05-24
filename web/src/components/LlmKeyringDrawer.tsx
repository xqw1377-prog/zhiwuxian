import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { authFetch, jsonAuthHeaders } from '../lib/api-auth';
import { onWuxianEventUntyped, WUXIAN_EVENTS } from '../lib/wuxian-events';

type ProviderId = 'deepseek' | 'qwen';

type ProviderSnapshot = {
  hasKey: boolean;
  baseURL: string | null;
  model: string | null;
};

type SnapshotResponse = {
  userId: string;
  deepseek: ProviderSnapshot;
  qwen: ProviderSnapshot;
};

export function LlmKeyringDrawer(props: {
  userId: string;
  onSaved?: () => void;
}) {
  const { userId, onSaved } = props;
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const [deepseekKey, setDeepseekKey] = useState('');
  const [deepseekModel, setDeepseekModel] = useState('');
  const [deepseekBaseURL, setDeepseekBaseURL] = useState('');

  const [qwenKey, setQwenKey] = useState('');
  const [qwenModel, setQwenModel] = useState('');
  const [qwenBaseURL, setQwenBaseURL] = useState('');

  useEffect(() => onWuxianEventUntyped(WUXIAN_EVENTS.hideOverlays, () => setOpen(false)), []);

  const title = useMemo(() => {
    const dk = snapshot?.deepseek?.hasKey ? '✓ DeepSeek' : 'DeepSeek';
    const qk = snapshot?.qwen?.hasKey ? '✓ Qwen' : 'Qwen';
    return `KEYRING // ${dk} · ${qk}`;
  }, [snapshot?.deepseek?.hasKey, snapshot?.qwen?.hasKey]);

  const loadSnapshot = async () => {
    try {
      const res = await authFetch(`/api/v1/llm/config/${encodeURIComponent(userId)}`);
      const json = await res.json();
      const d = (json.data ?? json) as SnapshotResponse;
      setSnapshot(d);
      setDeepseekModel(d.deepseek.model ?? '');
      setDeepseekBaseURL(d.deepseek.baseURL ?? '');
      setQwenModel(d.qwen.model ?? '');
      setQwenBaseURL(d.qwen.baseURL ?? '');
    } catch {
      setSnapshot(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadSnapshot();
  }, [open]);

  const postConfig = async (provider: ProviderId, payload: Record<string, unknown>) => {
    const res = await authFetch('/api/v1/llm/config', {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ userId, provider, ...payload }),
    });
    const json = await res.json();
    const d = (json.data ?? json) as { deepseek?: ProviderSnapshot; qwen?: ProviderSnapshot };
    if (d.deepseek && d.qwen) {
      setSnapshot({ userId, deepseek: d.deepseek, qwen: d.qwen });
    } else {
      await loadSnapshot();
    }
  };

  const saveProvider = async (provider: ProviderId) => {
    if (busy) return;
    setBusy(true);
    setStatus('正在写入钥匙环…');
    try {
      if (provider === 'deepseek') {
        await postConfig('deepseek', {
          apiKey: deepseekKey.trim() || undefined,
          model: deepseekModel.trim() || undefined,
          baseURL: deepseekBaseURL.trim() || undefined,
        });
        setDeepseekKey('');
      } else {
        await postConfig('qwen', {
          apiKey: qwenKey.trim() || undefined,
          model: qwenModel.trim() || undefined,
          baseURL: qwenBaseURL.trim() || undefined,
        });
        setQwenKey('');
      }
      setStatus('✓ 已锁定（明文不会回显）');
      onSaved?.();
      setTimeout(() => setStatus(''), 1200);
    } catch {
      setStatus('🚨 写入失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const clearProvider = async (provider: ProviderId) => {
    if (busy) return;
    setBusy(true);
    setStatus('正在撤销钥匙…');
    try {
      await postConfig(provider, { clearKey: true });
      if (provider === 'deepseek') setDeepseekKey('');
      if (provider === 'qwen') setQwenKey('');
      setStatus('✓ 已撤销');
      onSaved?.();
      setTimeout(() => setStatus(''), 1200);
    } catch {
      setStatus('🚨 撤销失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 font-mono">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="bg-[#161820] border border-gray-800 text-[#00FF7F] px-4 py-2 rounded-xl text-xs hover:border-[#00FF7F] hover:shadow-[0_0_20px_rgba(0,255,127,0.25)] transition-all duration-300"
      >
        {open ? '✕ 关闭钥匙环' : '🔐 模型钥匙'}
        {(snapshot?.deepseek?.hasKey || snapshot?.qwen?.hasKey) && (
          <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-[#00FF7F] animate-pulse" />
        )}
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="absolute bottom-14 right-0 w-[26rem] bg-[#161820] border border-[#00FF7F]/30 rounded-2xl p-5 space-y-5 shadow-[0_10px_40px_rgba(0,0,0,0.6),0_0_30px_rgba(0,255,127,0.08)]"
        >
          <header className="space-y-1">
            <h3 className="text-sm font-bold text-white tracking-wider">{title}</h3>
            <p className="text-[10px] text-gray-500">
              Key 会加密落库，仅用于调用，不会回传明文。未配置时系统自动降级为模板模式。
            </p>
          </header>

          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-gray-900 bg-[#0D0E12] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-gray-300 font-bold">DeepSeek（文本/推理）</div>
                <div className="text-[10px] text-gray-500">
                  {snapshot?.deepseek?.hasKey ? '已保存' : '未保存'}
                </div>
              </div>
              <input
                type="password"
                value={deepseekKey}
                onChange={(e) => setDeepseekKey(e.target.value)}
                placeholder={snapshot?.deepseek?.hasKey ? '留空则不更换' : '输入 DEEPSEEK_API_KEY'}
                className="w-full bg-[#14161D] text-white border border-gray-800 focus:border-[#00FF7F] px-3 py-2 rounded-lg outline-none transition-colors placeholder-gray-700"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={deepseekModel}
                  onChange={(e) => setDeepseekModel(e.target.value)}
                  placeholder="model（可选）"
                  className="w-full bg-[#14161D] text-white border border-gray-800 focus:border-[#00FF7F] px-3 py-2 rounded-lg outline-none transition-colors placeholder-gray-700"
                />
                <input
                  type="text"
                  value={deepseekBaseURL}
                  onChange={(e) => setDeepseekBaseURL(e.target.value)}
                  placeholder="baseURL（可选）"
                  className="w-full bg-[#14161D] text-white border border-gray-800 focus:border-[#00FF7F] px-3 py-2 rounded-lg outline-none transition-colors placeholder-gray-700"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveProvider('deepseek')}
                  className="flex-1 bg-[#00FF7F] text-[#0D0E12] py-2 rounded-xl font-bold text-xs hover:bg-[#00E672] disabled:opacity-50 transition-colors shadow-[0_0_16px_rgba(0,255,127,0.35)]"
                >
                  {busy ? '写入中…' : '保存'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void clearProvider('deepseek')}
                  className="px-4 py-2 rounded-xl text-xs border border-gray-800 text-gray-300 hover:border-[#FF4500]/60 hover:text-[#FF4500] disabled:opacity-50 transition-colors"
                >
                  撤销
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-900 bg-[#0D0E12] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-gray-300 font-bold">Qwen（多模态/视觉）</div>
                <div className="text-[10px] text-gray-500">
                  {snapshot?.qwen?.hasKey ? '已保存' : '未保存'}
                </div>
              </div>
              <input
                type="password"
                value={qwenKey}
                onChange={(e) => setQwenKey(e.target.value)}
                placeholder={snapshot?.qwen?.hasKey ? '留空则不更换' : '输入 QWEN_API_KEY / DASHSCOPE_API_KEY'}
                className="w-full bg-[#14161D] text-white border border-gray-800 focus:border-[#00FF7F] px-3 py-2 rounded-lg outline-none transition-colors placeholder-gray-700"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={qwenModel}
                  onChange={(e) => setQwenModel(e.target.value)}
                  placeholder="model（可选）"
                  className="w-full bg-[#14161D] text-white border border-gray-800 focus:border-[#00FF7F] px-3 py-2 rounded-lg outline-none transition-colors placeholder-gray-700"
                />
                <input
                  type="text"
                  value={qwenBaseURL}
                  onChange={(e) => setQwenBaseURL(e.target.value)}
                  placeholder="baseURL（可选）"
                  className="w-full bg-[#14161D] text-white border border-gray-800 focus:border-[#00FF7F] px-3 py-2 rounded-lg outline-none transition-colors placeholder-gray-700"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveProvider('qwen')}
                  className="flex-1 bg-[#00FF7F] text-[#0D0E12] py-2 rounded-xl font-bold text-xs hover:bg-[#00E672] disabled:opacity-50 transition-colors shadow-[0_0_16px_rgba(0,255,127,0.35)]"
                >
                  {busy ? '写入中…' : '保存'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void clearProvider('qwen')}
                  className="px-4 py-2 rounded-xl text-xs border border-gray-800 text-gray-300 hover:border-[#FF4500]/60 hover:text-[#FF4500] disabled:opacity-50 transition-colors"
                >
                  撤销
                </button>
              </div>
            </div>
          </div>

          {status && (
            <p className="text-[10px] text-center text-gray-400 italic animate-pulse">{status}</p>
          )}
        </motion.div>
      )}
    </div>
  );
}
