import { useState } from 'react';
import { getAuthToken, setAuthToken } from '../lib/api-auth';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (userId: string) => void;
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const token = getAuthToken();
      const endpoint = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const body: Record<string, string> = { email, password };
      if (mode === 'register' && displayName) body.displayName = displayName;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || json?.message || '操作失败');
        return;
      }
      const data = json?.data || json;
      if (data.token) setAuthToken(data.token);
      if (data.userId) {
        localStorage.setItem('wuxian_user_id', data.userId);
        onSuccess(data.userId);
      }
      onClose();
    } catch {
      setError('网络错误，请检查连接');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9996] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-700 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-white mb-1">
          {mode === 'login' ? '登录' : '注册账号'}
        </h2>
        <p className="text-xs text-gray-400 mb-5">
          {mode === 'login' ? '登录后可跨设备同步学习数据' : '注册后可在不同设备上继续学习'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">昵称（可选）</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="如何称呼你"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '至少 6 位' : '输入密码'}
              required
              minLength={6}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 transition-all"
          >
            {busy ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
