import { useState, useEffect } from 'react';
import { getAuthToken, setAuthToken } from '../../lib/api-auth';
import { fetchAuthMe } from '../../lib/auth-me';
import { AdminDashboard } from './AdminDashboard';

export function AdminStandalonePage({ onClose }: { onClose: () => void }) {
  const [authed, setAuthed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const verifyAdminSession = async (): Promise<boolean> => {
    const me = await fetchAuthMe();
    if (!me?.userId) return false;
    setAuthed(true);
    setIsAdmin(Boolean(me.isAdmin));
    return Boolean(me.isAdmin);
  };

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setChecking(false);
      return;
    }
    void verifyAdminSession().finally(() => setChecking(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json?.error || json?.message || '登录失败'); return; }
      const data = json?.data || json;
      if (data.token) setAuthToken(data.token);
      const ok = await verifyAdminSession();
      if (!ok) {
        setAuthed(true);
        setError('该账号无管理员权限，请使用管理员账号登录。');
      }
    } catch { setError('网络错误'); }
    finally { setBusy(false); }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">验证会话...</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-700 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">管理后台登录</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">邮箱</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" required
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">密码</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="输入密码" required
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-medium hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 transition-all"
            >
              {busy ? '验证中...' : '登录管理后台'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md rounded-2xl bg-gray-900 border border-red-900/50 p-6 text-center">
          <p className="text-red-400 text-sm mb-4">需要管理员权限才能访问运营后台。</p>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">返回</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminDashboard onClose={onClose} />
    </div>
  );
}
