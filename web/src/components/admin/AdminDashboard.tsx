import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../../lib/api-auth';
import { AdminZhiPanel } from './AdminZhiPanel';
import { AdminFoldTimePanel } from './AdminFoldTimePanel';

type Tab = 'overview' | 'users' | 'zhi' | 'metrics' | 'revenue' | 'system' | 'llm' | 'activation' | 'orders' | 'ops';

type FoldTimeSummary = {
  okr: {
    anchoredUsers: number;
    qualifiedActiveLearners: number;
    qalRatePct: number;
    weaknessImprovementRatePct: number;
    avgFoldIndexQAL: number;
    targets: { qalRatePct: number; weaknessImprovementRatePct: number; foldLiftMedian: number };
  };
  cohortCounts: Record<string, number>;
  loopCompletionRatePct: number;
  avgFoldIndexL2L3: number;
};

type ZhiPlatformStats = {
  learningPathUsers: number;
  assessmentPapers7d: number;
  pendingCoursewareReview: number;
  paidOrders30d: number;
  paidRevenueCny30d: number;
};

interface Stats {
  totalUsers: number;
  adminCount: number;
  bannedCount: number;
  totalWarpPurchased: number;
  activeUsers7d: number;
  zhi?: ZhiPlatformStats;
  foldTime?: FoldTimeSummary | null;
}

interface User {
  email: string;
  display_name: string;
  user_id: string;
  role: string;
  banned: number;
  created_at: string;
}

interface RevenueDay {
  day: string;
  warp: number;
  users: number;
}

type ActivationRow = {
  code: string;
  warp_amount: number;
  created_at: number;
  expires_at: number;
  redeemed_by: string | null;
  redeemed_at: number;
};

type PaymentOrderRow = {
  id: string;
  user_id: string;
  product_type: string;
  product_id: string;
  amount_cny: number;
  currency: string;
  status: string;
  payment_provider: string;
  third_party_tx_id: string | null;
  created_at: string;
  paid_at: string | null;
};

type WalletOverview = {
  userId: string;
  warpPoints: number;
  invitationCode: string;
  spend: { totalWarpCost: number; requestCount: number; totalTokens: number };
};

type AdminWarpGrantRow = {
  id: string;
  admin_user_id: string;
  user_id: string;
  amount: number;
  reason: string;
  note: string;
  created_at: number;
};

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const [revenue, setRevenue] = useState<RevenueDay[]>([]);
  const [system, setSystem] = useState<Record<string, unknown> | null>(null);
  const [llmCosts, setLlmCosts] = useState<Record<string, unknown>[]>([]);
  const [llmUsers, setLlmUsers] = useState<Record<string, unknown>[]>([]);
  const [tokenCaps, setTokenCaps] = useState<Record<string, string>>({});
  const [capSetMsg, setCapSetMsg] = useState('');
  const [actWarpAmount, setActWarpAmount] = useState(500);
  const [actCount, setActCount] = useState(50);
  const [actExpiresDays, setActExpiresDays] = useState(180);
  const [actMsg, setActMsg] = useState('');
  const [actCodes, setActCodes] = useState<string[]>([]);
  const [actRows, setActRows] = useState<ActivationRow[]>([]);
  const [actTotal, setActTotal] = useState(0);
  const [actRedeemedFilter, setActRedeemedFilter] = useState<'all' | 'redeemed' | 'unredeemed'>('unredeemed');
  const [actQuery, setActQuery] = useState('');
  const [orders, setOrders] = useState<PaymentOrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [orderStatus, setOrderStatus] = useState('');
  const [orderProvider, setOrderProvider] = useState('');
  const [orderUserId, setOrderUserId] = useState('');
  const [warpGrantUserId, setWarpGrantUserId] = useState('');
  const [warpGrantAmount, setWarpGrantAmount] = useState(100);
  const [warpGrantReason, setWarpGrantReason] = useState('活动发放');
  const [warpGrantNote, setWarpGrantNote] = useState('');
  const [warpGrantMsg, setWarpGrantMsg] = useState('');
  const [grantRows, setGrantRows] = useState<AdminWarpGrantRow[]>([]);
  const [keyUserId, setKeyUserId] = useState('');
  const [keySnap, setKeySnap] = useState<any>(null);
  const [keyMsg, setKeyMsg] = useState('');
  const [walletOverview, setWalletOverview] = useState<WalletOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zhiFocusUserId, setZhiFocusUserId] = useState('');

  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const fetchJson = useCallback(async (url: string) => {
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || '请求失败');
    return json?.data || json;
  }, [token]);

  useEffect(() => {
    setLoading(true); setError('');
    Promise.all([
      fetchJson('/api/v1/admin/stats').then(setStats).catch(() => {}),
      fetchJson('/api/v1/admin/stats/revenue').then(d => setRevenue(d.daily || [])).catch(() => {}),
      fetchJson('/api/v1/admin/stats/system').then(setSystem).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [fetchJson]);

  useEffect(() => {
    if (tab !== 'users') return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(userPage), limit: '20' });
    if (userSearch.trim()) params.set('search', userSearch.trim());
    fetchJson(`/api/v1/admin/users?${params}`)
      .then(d => { setUsers(d.users || []); setUserTotal(d.total || 0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, userPage, userSearch, fetchJson]);

  useEffect(() => {
    if (tab !== 'llm') return;
    setLoading(true); setError('');
    Promise.all([
      fetchJson('/api/v1/admin/llm/cost-aggregation').then(setLlmCosts).catch(() => {}),
      fetchJson('/api/v1/admin/llm/user-summary').then(setLlmUsers).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [tab, fetchJson]);

  useEffect(() => {
    if (tab !== 'activation') return;
    setLoading(true);
    const params = new URLSearchParams({ limit: '50', offset: '0' });
    if (actRedeemedFilter === 'redeemed') params.set('redeemed', '1');
    if (actRedeemedFilter === 'unredeemed') params.set('redeemed', '0');
    if (actQuery.trim()) params.set('codePrefix', actQuery.trim().toUpperCase());
    fetchJson(`/api/v1/admin/activation-codes?${params}`)
      .then(d => { setActRows(d.rows || []); setActTotal(d.total || 0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, actRedeemedFilter, actQuery, fetchJson]);

  useEffect(() => {
    if (tab !== 'orders') return;
    setLoading(true);
    const params = new URLSearchParams({ limit: '50', offset: '0', days: '90' });
    if (orderStatus.trim()) params.set('status', orderStatus.trim().toUpperCase());
    if (orderProvider.trim()) params.set('provider', orderProvider.trim().toLowerCase());
    if (orderUserId.trim()) params.set('userId', orderUserId.trim());
    fetchJson(`/api/v1/admin/payment/orders?${params}`)
      .then(d => { setOrders(d.orders || []); setOrdersTotal(d.total || 0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, orderStatus, orderProvider, orderUserId, fetchJson]);

  const handleBan = async (userId: string, banned: boolean) => {
    try {
      await fetch(`/api/v1/admin/users/${userId}/ban`, {
        method: 'PUT', headers, body: JSON.stringify({ banned }),
      });
      setUsers(users.map(u => u.user_id === userId ? { ...u, banned: banned ? 1 : 0 } : u));
    } catch { setError('操作失败'); }
  };

  const handleRole = async (userId: string, role: string) => {
    try {
      await fetch(`/api/v1/admin/users/${userId}/role`, {
        method: 'PUT', headers, body: JSON.stringify({ role }),
      });
      setUsers(users.map(u => u.user_id === userId ? { ...u, role } : u));
    } catch { setError('操作失败'); }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm(`确认删除用户 ${userId}？此操作不可撤回。`)) return;
    try {
      await fetch(`/api/v1/admin/users/${userId}`, { method: 'DELETE', headers });
      setUsers(users.filter(u => u.user_id !== userId));
    } catch { setError('删除失败'); }
  };

  const totalPages = Math.ceil(userTotal / 20);

  return (
    <div className="fixed inset-0 z-[9996] flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-white">管理后台</h1>
          <div className="flex gap-1">
              {([
                ['overview', '概览'],
                ['users', '用户'],
                ['zhi', 'ZHI 学业'],
                ['metrics', '折叠时间'],
                ['revenue', '收入'],
                ['orders', '订单'],
                ['activation', '激活码'],
                ['llm', 'LLM 成本'],
                ['ops', '运营'],
                ['system', '系统'],
              ] as [Tab, string][]).map(([id, label]) => (
              <button key={id} onClick={() => { setTab(id); setError(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === id ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >{label}</button>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && <div className="mx-6 mt-3 rounded-lg bg-red-900/30 border border-red-800/50 px-4 py-2 text-sm text-red-400">{error}</div>}

      <div className="flex-1 overflow-y-auto p-6">
        {loading && !stats && tab === 'overview' && (
          <div className="text-gray-400 text-sm animate-pulse">加载中...</div>
        )}

        {/* Overview */}
        {tab === 'overview' && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: '总用户数', value: stats.totalUsers, color: 'text-cyan-400' },
                { label: '管理员', value: stats.adminCount, color: 'text-amber-400' },
                { label: '封禁用户', value: stats.bannedCount, color: 'text-red-400' },
                { label: '7日活跃', value: stats.activeUsers7d, color: 'text-green-400' },
                { label: 'Warp 总量', value: Math.round(stats.totalWarpPurchased).toLocaleString(), color: 'text-purple-400' },
                { label: '学习路径用户', value: stats.zhi?.learningPathUsers ?? 0, color: 'text-emerald-400' },
                { label: '7日评估卷', value: stats.zhi?.assessmentPapers7d ?? 0, color: 'text-blue-400' },
                { label: '待审课件', value: stats.zhi?.pendingCoursewareReview ?? 0, color: 'text-orange-400' },
                { label: 'QAL 合格用户', value: stats.foldTime?.okr.qualifiedActiveLearners ?? 0, color: 'text-emerald-300' },
                { label: 'QAL 占比', value: `${stats.foldTime?.okr.qalRatePct ?? 0}%`, color: 'text-amber-300' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-gray-900 border border-gray-800 p-5">
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
            {stats.foldTime && (
              <div className="rounded-xl bg-gray-900 border border-emerald-900/30 p-4 flex flex-wrap gap-4 text-xs text-gray-400">
                <span>L0 {stats.foldTime.cohortCounts.L0 ?? 0}</span>
                <span>L1 {stats.foldTime.cohortCounts.L1 ?? 0}</span>
                <span>L2 {stats.foldTime.cohortCounts.L2 ?? 0}</span>
                <span>L3 {stats.foldTime.cohortCounts.L3 ?? 0}</span>
                <span>· L3闭环率 {stats.foldTime.loopCompletionRatePct}%</span>
                <span>· 弱项改善 {stats.foldTime.okr.weaknessImprovementRatePct}%（目标 {stats.foldTime.okr.targets.weaknessImprovementRatePct}%）</span>
                <button
                  type="button"
                  className="text-cyan-400 hover:underline ml-auto"
                  onClick={() => setTab('metrics')}
                >
                  查看折叠时间详情 →
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'metrics' && (
          <AdminFoldTimePanel
            onPickUser={(id) => {
              setZhiFocusUserId(id);
              setTab('zhi');
            }}
          />
        )}

        {/* Users */}
        {tab === 'users' && (
          <div>
            <div className="flex gap-3 mb-4">
              <input
                value={userSearch} onChange={e => { setUserSearch(e.target.value); setUserPage(1); }}
                placeholder="搜索邮箱/昵称/ID..."
                className="flex-1 max-w-sm px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
              <span className="text-sm text-gray-500 self-center">共 {userTotal} 人</span>
            </div>

            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.user_id} className={`rounded-xl border p-4 flex items-center justify-between ${u.banned ? 'border-red-900/50 bg-red-950/20' : 'border-gray-800 bg-gray-900'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white truncate">{u.display_name || u.email}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.role === 'admin' ? 'bg-amber-600/20 text-amber-400' : 'bg-gray-700 text-gray-400'}`}>{u.role}</span>
                      {u.banned === 1 && <span className="text-xs px-1.5 py-0.5 rounded bg-red-600/20 text-red-400">已封禁</span>}
                    </div>
                    <p className="text-xs text-gray-500 font-mono">{u.email}</p>
                    <p className="text-xs text-gray-600 font-mono">ID: {u.user_id}</p>
                    <p className="text-xs text-gray-600">{u.created_at}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleRole(u.user_id, u.role === 'admin' ? 'user' : 'admin')}
                      className="px-2.5 py-1 rounded text-xs border border-gray-700 text-gray-400 hover:border-amber-500 hover:text-amber-400 transition-colors">
                      {u.role === 'admin' ? '取消管理' : '设为管理'}
                    </button>
                    <button onClick={() => handleBan(u.user_id, u.banned !== 1)}
                      className={`px-2.5 py-1 rounded text-xs border transition-colors ${u.banned ? 'border-green-700 text-green-400 hover:border-green-500' : 'border-red-800 text-red-400 hover:border-red-600'}`}>
                      {u.banned ? '解禁' : '封禁'}
                    </button>
                    <button
                      onClick={() => { setZhiFocusUserId(u.user_id); setTab('zhi'); }}
                      className="px-2.5 py-1 rounded text-xs border border-emerald-800 text-emerald-400 hover:border-emerald-600 transition-colors"
                    >
                      学业
                    </button>
                    <button onClick={() => handleDelete(u.user_id)}
                      className="px-2.5 py-1 rounded text-xs border border-red-900 text-red-500 hover:border-red-700 transition-colors">
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {users.length === 0 && <p className="text-gray-500 text-sm text-center py-8">无匹配用户</p>}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setUserPage(p)}
                    className={`w-8 h-8 rounded text-xs ${p === userPage ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>{p}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'zhi' && <AdminZhiPanel initialUserId={zhiFocusUserId} />}

        {/* Revenue */}
        {tab === 'revenue' && (
          <div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 mb-4">
              <h3 className="text-sm font-medium text-white mb-3">近 30 日活跃趋势</h3>
              {revenue.length === 0 ? (
                <p className="text-gray-500 text-sm">暂无数据</p>
              ) : (
                <div className="space-y-1">
                  {revenue.slice(-14).map(r => (
                    <div key={r.day} className="flex items-center gap-3 text-xs">
                      <span className="w-24 text-gray-400 shrink-0">{r.day.slice(5)}</span>
                      <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 rounded-full transition-all" style={{ width: `${Math.min(100, (r.users / 10) * 100)}%` }} />
                      </div>
                      <span className="w-16 text-right text-gray-300">{r.users} 人</span>
                      <span className="w-20 text-right text-gray-500">{r.warp} Warp</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'orders' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white">订单列表（近 90 天）</h3>
                <span className="text-xs text-gray-500">共 {ordersTotal} 条</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <input
                  value={orderUserId}
                  onChange={(e) => setOrderUserId(e.target.value)}
                  placeholder="用户 ID（可选）"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-56"
                />
                <input
                  value={orderStatus}
                  onChange={(e) => setOrderStatus(e.target.value)}
                  placeholder="状态 PENDING/PAID（可选）"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-56"
                />
                <input
                  value={orderProvider}
                  onChange={(e) => setOrderProvider(e.target.value)}
                  placeholder="渠道 stripe/wechat/simulate（可选）"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-60"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-2 pr-3">订单</th>
                      <th className="text-left py-2 pr-3">用户</th>
                      <th className="text-left py-2 pr-3">商品</th>
                      <th className="text-right py-2 pr-3">金额</th>
                      <th className="text-left py-2 pr-3">状态</th>
                      <th className="text-left py-2 pr-3">渠道</th>
                      <th className="text-left py-2 pr-3">Tx</th>
                      <th className="text-right py-2 pr-3">创建</th>
                      <th className="text-right py-2 pr-3">支付</th>
                      <th className="text-right py-2 pr-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-2 pr-3 text-gray-200 font-mono">{o.id}</td>
                        <td className="py-2 pr-3 text-gray-300 font-mono">{o.user_id}</td>
                        <td className="py-2 pr-3 text-gray-300">{o.product_id || o.product_type}</td>
                        <td className="py-2 pr-3 text-right text-gray-200">{Number(o.amount_cny).toFixed(2)} {o.currency}</td>
                        <td className="py-2 pr-3 text-gray-300">{o.status}</td>
                        <td className="py-2 pr-3 text-gray-300">{o.payment_provider}</td>
                        <td className="py-2 pr-3 text-gray-500 font-mono">{o.third_party_tx_id || '-'}</td>
                        <td className="py-2 pr-3 text-right text-gray-500">{o.created_at?.slice(0, 10) || '-'}</td>
                        <td className="py-2 pr-3 text-right text-gray-500">{o.paid_at?.slice(0, 10) || '-'}</td>
                        <td className="py-2 pr-3 text-right">
                          <button
                            onClick={() => {
                              setTab('ops');
                              setKeyUserId(o.user_id);
                              setWarpGrantUserId(o.user_id);
                              setWarpGrantNote(`订单 ${o.id}`);
                              setWalletOverview(null);
                              setKeySnap(null);
                              setKeyMsg('');
                              setWarpGrantMsg('');
                            }}
                            className="px-2 py-1 rounded bg-white/5 border border-gray-800 text-gray-200 hover:bg-white/10"
                          >
                            运营
                          </button>
                        </td>
                      </tr>
                    ))}
                    {orders.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-gray-500">暂无数据</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* LLM Cost */}
        {tab === 'llm' && (
          <div className="space-y-6">
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h3 className="text-sm font-medium text-white mb-3">每日 Token 配额</h3>
              <div className="flex gap-3 mb-4">
                <input
                  value={tokenCaps.userId || ''} onChange={e => setTokenCaps(p => ({ ...p, userId: e.target.value }))}
                  placeholder="用户 ID"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-48"
                />
                <input
                  value={tokenCaps.cap || ''} onChange={e => setTokenCaps(p => ({ ...p, cap: e.target.value }))}
                  type="number" min="0" placeholder="每日 Token 上限 (0=不限)"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-40"
                />
                <button onClick={async () => {
                  if (!tokenCaps.userId) return;
                  try {
                    const r = await fetch('/api/v1/admin/llm/token-cap', {
                      method: 'PUT', headers, body: JSON.stringify({ userId: tokenCaps.userId, dailyTokenCap: Number(tokenCaps.cap) || 0 }),
                    });
                    const j = await r.json();
                    if (r.ok) setCapSetMsg('已更新');
                    else setCapSetMsg(j.message || '失败');
                  } catch { setCapSetMsg('请求失败'); }
                }} className="px-3 py-1.5 rounded-lg bg-cyan-700 text-white text-xs hover:bg-cyan-600">设置</button>
                {capSetMsg && <span className="text-xs text-green-400 self-center">{capSetMsg}</span>}
              </div>
            </div>

            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h3 className="text-sm font-medium text-white mb-3">按日聚合成本</h3>
              {llmCosts.length === 0 ? (
                <p className="text-gray-500 text-sm">暂无数据</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-2 pr-3">日期</th><th className="text-left py-2 pr-3">供应商</th><th className="text-left py-2 pr-3">模型</th>
                      <th className="text-right py-2 pr-3">请求数</th><th className="text-right py-2 pr-3">输入 Token</th><th className="text-right py-2 pr-3">输出 Token</th><th className="text-right py-2 pr-3">总 Warp</th>
                    </tr></thead>
                    <tbody>
                      {llmCosts.slice(0, 50).map((r, i) => (
                        <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="py-2 pr-3 text-gray-300">{r.day as string}</td>
                          <td className="py-2 pr-3 text-gray-300">{r.provider as string}</td>
                          <td className="py-2 pr-3 text-gray-300">{r.model as string}</td>
                          <td className="py-2 pr-3 text-right text-gray-300">{(r.request_count as number).toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right text-gray-300">{(r.total_input_tokens as number).toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right text-gray-300">{(r.total_output_tokens as number).toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right text-purple-400">{Number(r.total_warp_cost).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h3 className="text-sm font-medium text-white mb-3">用户消费 Top 50</h3>
              {llmUsers.length === 0 ? (
                <p className="text-gray-500 text-sm">暂无数据</p>
              ) : (
                <div className="space-y-2">
                  {llmUsers.map((u, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 text-xs w-6">#{i + 1}</span>
                        <span className="text-sm text-white font-mono">{u.user_id as string}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-gray-400">{Number(u.request_count).toLocaleString()} 次</span>
                        <span className="text-gray-300">{(Number(u.total_tokens)).toLocaleString()} Tokens</span>
                        <span className="text-purple-400 font-medium">{Number(u.total_warp_cost).toFixed(2)} Warp</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'activation' && (
          <div className="space-y-6">
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h3 className="text-sm font-medium text-white mb-3">生成 Warp 激活码</h3>
              <div className="flex flex-wrap gap-3">
                <input
                  value={actWarpAmount}
                  onChange={(e) => setActWarpAmount(Number(e.target.value) || 0)}
                  type="number"
                  min="1"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-40"
                  placeholder="每码 Warp"
                />
                <input
                  value={actCount}
                  onChange={(e) => setActCount(Number(e.target.value) || 0)}
                  type="number"
                  min="1"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-32"
                  placeholder="数量"
                />
                <input
                  value={actExpiresDays}
                  onChange={(e) => setActExpiresDays(Number(e.target.value) || 0)}
                  type="number"
                  min="1"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-36"
                  placeholder="有效期(天)"
                />
                <button
                  onClick={async () => {
                    setActMsg('');
                    setActCodes([]);
                    try {
                      const r = await fetch('/api/v1/fuel/activation/create', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ warpAmount: actWarpAmount, count: actCount, expiresInDays: actExpiresDays }),
                      });
                      const j = await r.json().catch(() => null);
                      if (!r.ok) { setActMsg(j?.message || '生成失败'); return; }
                      const d = j?.data || j;
                      const codes = Array.isArray(d.codes) ? d.codes : [];
                      setActCodes(codes);
                      setActMsg(`已生成 ${codes.length} 个`);
                    } catch {
                      setActMsg('请求失败');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-cyan-700 text-white text-xs hover:bg-cyan-600"
                >
                  生成
                </button>
                {actMsg && <span className="text-xs text-gray-400 self-center">{actMsg}</span>}
                {actCodes.length > 0 && (
                  <button
                    onClick={async () => {
                      const text = actCodes.join('\n');
                      try {
                        await navigator.clipboard.writeText(text);
                        setActMsg('已复制');
                      } catch {
                        setActMsg('复制失败');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs hover:border-gray-500"
                  >
                    复制
                  </button>
                )}
              </div>
              {actCodes.length > 0 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {actCodes.slice(0, 100).map((c) => (
                    <div key={c} className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-xs font-mono text-gray-200">
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-medium text-white">激活码列表</h3>
                <span className="text-xs text-gray-500">共 {actTotal} 条</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <select
                  value={actRedeemedFilter}
                  onChange={(e) => setActRedeemedFilter(e.target.value as 'all' | 'redeemed' | 'unredeemed')}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs"
                >
                  <option value="unredeemed">未兑换</option>
                  <option value="redeemed">已兑换</option>
                  <option value="all">全部</option>
                </select>
                <input
                  value={actQuery}
                  onChange={(e) => setActQuery(e.target.value)}
                  placeholder="code 前缀（可选）"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-56"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-2 pr-3">Code</th>
                      <th className="text-right py-2 pr-3">Warp</th>
                      <th className="text-right py-2 pr-3">创建</th>
                      <th className="text-right py-2 pr-3">到期</th>
                      <th className="text-left py-2 pr-3">兑换用户</th>
                      <th className="text-right py-2 pr-3">兑换时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actRows.map((r) => (
                      <tr key={r.code} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-2 pr-3 text-gray-200 font-mono">{r.code}</td>
                        <td className="py-2 pr-3 text-right text-purple-400">{Number(r.warp_amount).toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right text-gray-400">{r.created_at ? new Date(r.created_at * 1000).toLocaleDateString() : '-'}</td>
                        <td className="py-2 pr-3 text-right text-gray-400">{r.expires_at ? new Date(r.expires_at * 1000).toLocaleDateString() : '-'}</td>
                        <td className="py-2 pr-3 text-gray-300 font-mono">{r.redeemed_by || '-'}</td>
                        <td className="py-2 pr-3 text-right text-gray-400">{r.redeemed_at ? new Date(r.redeemed_at * 1000).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                    {actRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-500">暂无数据</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'ops' && (
          <div className="space-y-6">
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h3 className="text-sm font-medium text-white mb-3">用户钱包概览</h3>
              <div className="flex flex-wrap gap-3 items-center mb-4">
                <input
                  value={keyUserId}
                  onChange={(e) => setKeyUserId(e.target.value)}
                  placeholder="用户 ID"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-72"
                />
                <button
                  onClick={async () => {
                    setKeyMsg('');
                    setWalletOverview(null);
                    try {
                      const d = await fetchJson(`/api/v1/admin/users/${encodeURIComponent(keyUserId.trim())}/wallet-overview?days=7`);
                      setWalletOverview(d as WalletOverview);
                      const g = await fetchJson(`/api/v1/admin/warp/grants?userId=${encodeURIComponent(keyUserId.trim())}&limit=20&offset=0`);
                      setGrantRows(Array.isArray(g.rows) ? g.rows : []);
                    } catch (e: any) {
                      setKeyMsg(e?.message || '查询失败');
                    }
                  }}
                  disabled={!keyUserId.trim()}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs hover:border-gray-500 disabled:opacity-50"
                >
                  拉取概览
                </button>
              </div>
              {walletOverview && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-gray-950 border border-gray-800 p-4">
                    <div className="text-gray-500 mb-1">Warp 余额</div>
                    <div className="text-purple-400 text-xl font-bold">{walletOverview.warpPoints.toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg bg-gray-950 border border-gray-800 p-4">
                    <div className="text-gray-500 mb-1">近 7 天消耗</div>
                    <div className="text-gray-200 text-lg font-bold">{Number(walletOverview.spend.totalWarpCost).toFixed(2)}</div>
                    <div className="text-gray-600 mt-1">{walletOverview.spend.requestCount.toLocaleString()} 次 · {walletOverview.spend.totalTokens.toLocaleString()} tokens</div>
                  </div>
                  <div className="rounded-lg bg-gray-950 border border-gray-800 p-4">
                    <div className="text-gray-500 mb-1">邀请码</div>
                    <div className="text-gray-200 font-mono">{walletOverview.invitationCode || '-'}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h3 className="text-sm font-medium text-white mb-3">钱包运营（手工发放 Warp）</h3>
              <div className="flex flex-wrap gap-3 items-center">
                <input
                  value={warpGrantUserId}
                  onChange={(e) => setWarpGrantUserId(e.target.value)}
                  placeholder="用户 ID"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-72"
                />
                <input
                  value={warpGrantAmount}
                  onChange={(e) => setWarpGrantAmount(Number(e.target.value) || 0)}
                  type="number"
                  min="-500000"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-40"
                />
                <input
                  value={warpGrantReason}
                  onChange={(e) => setWarpGrantReason(e.target.value)}
                  placeholder="原因（可选）"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-44"
                />
                <input
                  value={warpGrantNote}
                  onChange={(e) => setWarpGrantNote(e.target.value)}
                  placeholder="备注（可选）"
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-64"
                />
                <button
                  onClick={async () => {
                    setWarpGrantMsg('');
                    try {
                      const r = await fetch('/api/v1/admin/warp/adjust', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                          userId: warpGrantUserId.trim(),
                          amount: warpGrantAmount,
                          reason: warpGrantReason.trim() || undefined,
                          note: warpGrantNote.trim() || undefined,
                        }),
                      });
                      const j = await r.json().catch(() => null);
                      if (!r.ok) { setWarpGrantMsg(j?.message || '发放失败'); return; }
                      const d = j?.data || j;
                      const amt = Number(d.amount ?? warpGrantAmount);
                      setWarpGrantMsg(`${amt > 0 ? '已发放' : '已冲正'} ${amt > 0 ? '+' : ''}${amt}，余额 ${d.balance}`);
                      if (warpGrantUserId.trim()) {
                        try {
                          const g = await fetchJson(`/api/v1/admin/warp/grants?userId=${encodeURIComponent(warpGrantUserId.trim())}&limit=20&offset=0`);
                          setGrantRows(Array.isArray(g.rows) ? g.rows : []);
                        } catch {}
                      }
                    } catch {
                      setWarpGrantMsg('请求失败');
                    }
                  }}
                  disabled={!warpGrantUserId.trim() || warpGrantAmount === 0}
                  className="px-3 py-1.5 rounded-lg bg-cyan-700 text-white text-xs hover:bg-cyan-600 disabled:opacity-50"
                >
                  提交
                </button>
                {warpGrantMsg && <span className="text-xs text-gray-400">{warpGrantMsg}</span>}
              </div>
              {grantRows.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left py-2 pr-3">时间</th>
                        <th className="text-right py-2 pr-3">数量</th>
                        <th className="text-left py-2 pr-3">原因</th>
                        <th className="text-left py-2 pr-3">备注</th>
                        <th className="text-left py-2 pr-3">操作者</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grantRows.slice(0, 20).map((r) => (
                        <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="py-2 pr-3 text-gray-400">{r.created_at ? new Date(r.created_at * 1000).toLocaleString() : '-'}</td>
                          <td className={`py-2 pr-3 text-right ${Number(r.amount) < 0 ? 'text-red-400' : 'text-purple-400'}`}>{Number(r.amount).toLocaleString()}</td>
                          <td className="py-2 pr-3 text-gray-300">{r.reason || '-'}</td>
                          <td className="py-2 pr-3 text-gray-500">{r.note || '-'}</td>
                          <td className="py-2 pr-3 text-gray-500 font-mono">{r.admin_user_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h3 className="text-sm font-medium text-white mb-3">私钥治理（不展示明文）</h3>
              <div className="flex flex-wrap gap-3 items-center mb-4">
                <button
                  onClick={async () => {
                    setKeyMsg('');
                    setKeySnap(null);
                    setWalletOverview(null);
                    try {
                      const d = await fetchJson(`/api/v1/admin/users/${encodeURIComponent(keyUserId.trim())}/llm-snapshot`);
                      setKeySnap(d);
                    } catch (e: any) {
                      setKeyMsg(e?.message || '查询失败');
                    }
                  }}
                  disabled={!keyUserId.trim()}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs hover:border-gray-500 disabled:opacity-50"
                >
                  查询
                </button>
                <button
                  onClick={async () => {
                    setKeyMsg('');
                    try {
                      const r = await fetch(`/api/v1/admin/users/${encodeURIComponent(keyUserId.trim())}/llm-key?provider=all`, {
                        method: 'DELETE',
                        headers,
                      });
                      const j = await r.json().catch(() => null);
                      if (!r.ok) { setKeyMsg(j?.message || '清除失败'); return; }
                      setKeyMsg('已清除');
                      const d = j?.data || j;
                      if (d?.userId) {
                        const snap = await fetchJson(`/api/v1/admin/users/${encodeURIComponent(keyUserId.trim())}/llm-snapshot`);
                        setKeySnap(snap);
                      }
                    } catch {
                      setKeyMsg('请求失败');
                    }
                  }}
                  disabled={!keyUserId.trim()}
                  className="px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-800/60 text-red-300 text-xs hover:border-red-600 disabled:opacity-50"
                >
                  清除全部
                </button>
                {keyMsg && <span className="text-xs text-gray-400">{keyMsg}</span>}
              </div>
              {keySnap && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {(['deepseek', 'qwen'] as const).map((p) => (
                    <div key={p} className="rounded-lg bg-gray-950 border border-gray-800 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-200 font-medium">{p}</span>
                        <span className="text-gray-500">{keySnap[p]?.hasKey ? 'hasKey=1' : 'hasKey=0'}</span>
                      </div>
                      <div className="text-gray-500 font-mono">model: {keySnap[p]?.model || '-'}</div>
                      <div className="text-gray-500 font-mono">baseURL: {keySnap[p]?.baseURL || '-'}</div>
                      <div className="text-gray-500 font-mono">updatedAt: {keySnap[p]?.updatedAt || 0}</div>
                      <button
                        onClick={async () => {
                          setKeyMsg('');
                          try {
                            const r = await fetch(`/api/v1/admin/users/${encodeURIComponent(keyUserId.trim())}/llm-key?provider=${p}`, {
                              method: 'DELETE',
                              headers,
                            });
                            const j = await r.json().catch(() => null);
                            if (!r.ok) { setKeyMsg(j?.message || '清除失败'); return; }
                            setKeyMsg(`已清除 ${p}`);
                            const snap = await fetchJson(`/api/v1/admin/users/${encodeURIComponent(keyUserId.trim())}/llm-snapshot`);
                            setKeySnap(snap);
                          } catch {
                            setKeyMsg('请求失败');
                          }
                        }}
                        className="mt-3 px-2 py-1 rounded bg-white/5 border border-gray-800 text-gray-200 hover:bg-white/10"
                      >
                        清除 {p}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* System */}
        {tab === 'system' && system && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
            <h3 className="text-sm font-medium text-white mb-3">系统状态</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['运行时间', `${Math.round((system.uptime as number) / 60)} 分钟`],
                ['Node 版本', system.nodeVersion as string],
                ['平台', system.platform as string],
                ['数据目录', system.dataDir as string],
                ['数据大小', `${Math.round((system.dbSize as number) / 1024 / 1024)} MB`],
                ['支付模式', system.paymentMode as string],
                ['Stripe', system.stripe ? '✅ 已配置' : '❌ 未配置'],
                ['Redis', system.redis ? '✅ 已配置' : '❌ 未配置'],
                ['OpenTelemetry', system.otel ? '✅ 已配置' : '❌ 未配置'],
                ['内存 (RSS)', `${Math.round((system.memory as Record<string, number>).rss / 1024 / 1024)} MB`],
                ['内存 (Heap)', `${Math.round((system.memory as Record<string, number>).heapUsed / 1024 / 1024)} / ${Math.round((system.memory as Record<string, number>).heapTotal / 1024 / 1024)} MB`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-gray-800 last:border-0">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-gray-200 font-mono">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
