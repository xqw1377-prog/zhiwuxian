import { useState, useRef, useEffect } from 'react';
import { getAuthToken } from '../lib/api-auth';

interface UserMenuProps {
  userId: string;
  displayName?: string | null;
  warpBalance?: number;
  tier?: string;
  isAdmin?: boolean;
  onOpenAuth?: () => void;
}

export function UserMenu({ userId, displayName, warpBalance, tier, isAdmin, onOpenAuth }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const label = displayName || userId.slice(0, 12);

  const handleLogout = async () => {
    const token = getAuthToken();
    if (token) {
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
      } catch { /* silent */ }
    }
    localStorage.clear();
    window.location.reload();
  };

  const handleRevokeAll = async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      await fetch('/api/v1/auth/revoke-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
    } catch { /* silent */ }
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 transition-colors text-sm"
      >
        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-xs text-white font-bold">
          {(label[0] || '?').toUpperCase()}
        </span>
        <span className="text-gray-200 max-w-[100px] truncate">{label}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-gray-800 border border-gray-700 shadow-xl z-50 py-1 animate-fade-in">
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-xs text-gray-400">用户 ID</p>
            <p className="text-sm text-gray-200 font-mono truncate">{userId}</p>
          </div>

          {typeof warpBalance === 'number' && (
            <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <span className="text-xs text-gray-400">Warp 余额</span>
              <span className="text-sm text-cyan-400 font-medium">{warpBalance}</span>
            </div>
          )}

          {tier && (
            <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <span className="text-xs text-gray-400">账户等级</span>
              <span className="text-sm text-yellow-400 font-medium">{tier}</span>
            </div>
          )}

          {onOpenAuth && (
            <button
              onClick={() => { setOpen(false); onOpenAuth(); }}
              className="w-full text-left px-4 py-2.5 text-sm text-cyan-400 hover:bg-gray-700 transition-colors"
            >
              绑定邮箱 / 登录
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('wuxian-open-admin')); }}
              className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-gray-700 transition-colors"
            >
              ⚙️ 管理后台
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 transition-colors"
          >
            退出登录
          </button>
          <button
            onClick={handleRevokeAll}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
          >
            在所有设备上退出
          </button>
        </div>
      )}
    </div>
  );
}
