import { authFetch } from '../lib/api-auth';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface StarLeagueStatus {
  warpPoints: number;
  inviteCode: string;
  contributedTokens: number;
  isSharingRelay: boolean;
  totalServedTokens: number;
  canHostRelay: boolean;
  joinUrl: string;
  visionRelayCost: number;
  referralBonus: number;
}

export function StarLeagueDashboard({ userId }: { userId: string }) {
  const [status, setStatus] = useState<StarLeagueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [copyHint, setCopyHint] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v1/relay/status/${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setStatus(json.data as StarLeagueStatus);
      }
    } catch {
      /* 离线降级 */
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleRelayValve = async () => {
    if (!status?.canHostRelay) {
      alert('仅终身认证且已配置私有 API Key 的极客可托管算力中继');
      return;
    }
    setToggling(true);
    try {
      const res = await authFetch('/api/v1/relay/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, enabled: !status.isSharingRelay }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? '切换失败');
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : '中继阀门切换失败');
    } finally {
      setToggling(false);
    }
  };

  const copyJoinLink = () => {
    if (!status) return;
    void navigator.clipboard.writeText(status.joinUrl);
    setCopyHint('引力链接已复制，去炸裂你的自学群');
    setTimeout(() => setCopyHint(''), 3000);
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-2xl bg-[#161820] border border-gray-800 rounded-2xl p-6 font-mono text-[10px] text-gray-600"
      >
        // 星盟算力网络同步中…
      </motion.div>
    );
  }

  const warpPoints = status?.warpPoints ?? 100;
  const isSharingRelay = status?.isSharingRelay ?? false;
  const contributedTokens = status?.contributedTokens ?? 0;
  const totalServed = status?.totalServedTokens ?? 0;
  const inviteCode = status?.inviteCode ?? 'WUXIAN-…';
  const referralBonus = status?.referralBonus ?? 50;

  return (
    <div className="w-full max-w-2xl bg-[#161820] border border-gray-800 rounded-2xl p-6 font-mono space-y-6">
      <header className="flex justify-between items-center border-b border-gray-900 pb-4">
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
          <h3 className="text-sm font-bold text-[#00FF7F] tracking-widest">// WUXIAN 星盟分布式算力网络</h3>
          <p className="text-[10px] text-gray-500 mt-1">2.0 跨端去中心化时空同盟</p>
        </motion.div>
        <div className="text-right">
          <span className="text-[10px] text-gray-500 block">CURRENT WARP FUEL</span>
          <span className="text-lg font-bold text-[#00FF7F]">
            {warpPoints} <span className="text-xs text-gray-500">Warp</span>
          </span>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0D0E12] border border-gray-900 rounded-xl p-4 flex justify-between items-center gap-4"
      >
        <motion.div className="space-y-1" layout>
          <span className="text-xs font-bold text-white block">托管我的闲置算力 (Token Relay)</span>
          <span className="text-[10px] text-gray-500 block">
            {isSharingRelay
              ? `🟢 正在作为全网节点运转 | 累计已为星盟中继 ${totalServed.toLocaleString()} Tokens · 功勋 ${contributedTokens.toLocaleString()}`
              : status?.canHostRelay
                ? '⚪ 阀门关闭。开启后你的 Key 将进入负载均衡池'
                : '⚪ 阀门关闭。终身认证 + 私有 Key 后可成为供给节点'}
          </span>
        </motion.div>

        <button
          type="button"
          disabled={toggling || !status?.canHostRelay}
          onClick={() => void toggleRelayValve()}
          className={`w-14 h-7 rounded-full p-1 transition-all duration-300 border shrink-0 disabled:opacity-40 ${
            isSharingRelay ? 'bg-[#00FF7F]/10 border-[#00FF7F]' : 'bg-gray-950 border-gray-800'
          }`}
          aria-pressed={isSharingRelay}
        >
          <motion.div
            layout
            className={`w-5 h-5 rounded-full ${isSharingRelay ? 'bg-[#00FF7F] ml-7' : 'bg-gray-700'}`}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#0D0E12] border border-gray-900 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-[10px] text-gray-500">// 我的专属引力钥匙</span>
          <span className="text-xs text-white font-bold my-2 select-all tracking-wider">{inviteCode}</span>
          <button
            type="button"
            onClick={copyJoinLink}
            className="w-full bg-transparent border border-gray-800 text-gray-400 hover:text-[#00FF7F] hover:border-[#00FF7F] py-1.5 rounded-lg text-[10px] font-bold transition-all"
          >
            {copyHint || '复制裂变锚点'}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-[#0D0E12] border border-gray-900 rounded-xl p-4 flex flex-col justify-between"
        >
          <span className="text-[10px] text-gray-500">// 裂变解锁机制</span>
          <p className="text-[11px] text-gray-400 my-1">
            每邀请一位自学者完成路径 B 视觉重路由，双方各注入{' '}
            <span className="text-[#00FF7F]">+{referralBonus} Warp</span>；每次拦截消耗{' '}
            <span className="text-gray-300">{status?.visionRelayCost ?? 5}</span> 燃料。
          </p>
          <span className="text-[9px] text-[#FF4500] font-bold animate-pulse">白嫖算力的终极黑道</span>
        </motion.div>
      </div>
    </div>
  );
}
