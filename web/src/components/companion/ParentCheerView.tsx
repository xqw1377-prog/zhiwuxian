/**
 * WUXIAN · 家长微信端战报卡片（高反差「三维时间折叠」战报）
 */

import { useState, useEffect, useCallback } from 'react';
import { resolveApiUrl } from '../../lib/api-base';
import { unwrapEnvelope } from '../../lib/api-envelope';

const PARENT_SESSION_STORAGE_KEY = 'wuxian_parent_session';

interface CompanionCard {
  title: string;
  goalId: string;
  studentId: string;
  date: string;
  foldSummary: string;
  battleSummary: string;
  knowledgePoints: string[];
  dreamSchoolPull: string;
  zhiComment: string;
  slope: number;
  cheerActions: { label: string; style: string; fuel: number }[];
}

interface MacroRecap {
  periodDays: number;
  total_days?: number;
  total_minutes?: number;
  total_escapes?: number;
  reroute_count?: number;
  total_cheers?: number;
  total_fuel?: number;
}

function hashQuery(): URLSearchParams {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const idx = raw.indexOf('?');
  return new URLSearchParams(idx >= 0 ? raw.slice(idx + 1) : '');
}

function parentLinkToken(): string {
  const q = hashQuery();
  const t = q.get('t')?.trim();
  if (t) return t;
  const legacy = q.get('token')?.trim();
  return legacy || '';
}

function apiQuery(): string {
  const t = parentLinkToken();
  return t ? `?t=${encodeURIComponent(t)}` : '';
}

function parentSession(): string {
  return localStorage.getItem(PARENT_SESSION_STORAGE_KEY)?.trim() || '';
}

function parentAuthHeaders(): HeadersInit {
  const s = parentSession();
  if (!s) return {};
  return { 'x-parent-session': s };
}

export function ParentCheerView({ studentId, onBack }: { studentId: string; onBack?: () => void }) {
  const [card, setCard] = useState<CompanionCard | null>(null);
  const [recap, setRecap] = useState<MacroRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cheering, setCheering] = useState(false);
  const [cheerMsg, setCheerMsg] = useState('');

  const fetchCard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = parentAuthHeaders();
      const res = await fetch(
        resolveApiUrl(`/api/v1/companion/parent-view/${encodeURIComponent(studentId)}${apiQuery()}`),
        { headers },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || '请求失败');
      const data = unwrapEnvelope<{ dashboard: CompanionCard | null; message?: string }>(json);
      setCard(data.dashboard ?? null);
      if (!data.dashboard) setError(data.message || '暂无战报');

      const recapRes = await fetch(
        resolveApiUrl(`/api/v1/companion/recap/${encodeURIComponent(studentId)}?days=30${apiQuery() ? `&t=${encodeURIComponent(parentLinkToken())}` : ''}`),
        { headers },
      );
      const recapJson = await recapRes.json();
      if (recapRes.ok) {
        setRecap(unwrapEnvelope<MacroRecap>(recapJson));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void fetchCard();
  }, [fetchCard]);

  const handleCheer = async (action: { label: string; style: string; fuel: number }) => {
    if (!card?.goalId) return;
    setCheering(true);
    setCheerMsg('');
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json', ...parentAuthHeaders() };
      const res = await fetch(resolveApiUrl(`/api/v1/companion/parent-cheer${apiQuery()}`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          goalId: card.goalId,
          studentId,
          message: action.label,
          fuelBonus: action.fuel,
          cheerStyle: action.style,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        const d = unwrapEnvelope<{ message?: string; studentNotified?: boolean }>(json);
        setCheerMsg(
          d.studentNotified
            ? '鼓励已送达孩子屏幕！+Warp 已注入'
            : '鼓励已记录（孩子端离线，上线后可见）',
        );
      } else {
        setCheerMsg(json?.message || '发送失败');
      }
    } catch {
      setCheerMsg('网络错误');
    } finally {
      setCheering(false);
      setTimeout(() => setCheerMsg(''), 4000);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030406]">
        <p className="animate-pulse text-lg font-black tracking-widest text-[#00FF7F]">加载战报…</p>
      </div>
    );
  }

  if (error && !card) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#030406] px-6">
        <p className="text-[#FF4500]">{error}</p>
        <button
          type="button"
          onClick={() => void fetchCard()}
          className="rounded-xl border border-[#00FF7F]/40 px-4 py-2 text-sm text-[#00FF7F]"
        >
          重试
        </button>
      </div>
    );
  }

  if (!card) return null;

  return (
    <div className="min-h-screen bg-[#030406] pb-8">
      <div className="mx-auto max-w-lg px-4 pt-6">
        <div className="overflow-hidden rounded-2xl border-2 border-[#00FF7F]/35 bg-gradient-to-b from-[#050608] to-[#0a1210] shadow-[0_0_60px_rgba(0,255,127,0.12)]">
          <div className="border-b border-[#00FF7F]/20 bg-[#00FF7F]/5 px-5 py-4">
            <p className="text-[9px] font-bold tracking-[0.3em] text-[#00FF7F]">WUXIAN ZHI</p>
            <h1 className="mt-1 text-xl font-black text-white">{card.title}</h1>
            <p className="mt-1 font-mono text-[10px] text-gray-500">{card.date} · Daily Micro-Feed</p>
          </div>

          <div className="space-y-4 p-5">
            <section className="rounded-xl border border-cyan-900/50 bg-cyan-950/20 p-4">
              <p className="mb-2 text-[10px] font-black tracking-widest text-cyan-400">📅 折叠时间</p>
              <p className="text-sm leading-relaxed text-gray-100">{card.foldSummary}</p>
            </section>

            <section className="rounded-xl border border-amber-900/40 bg-amber-950/15 p-4">
              <p className="mb-2 text-[10px] font-black tracking-widest text-amber-400">⚔️ 物理战果</p>
              <p className="text-sm leading-relaxed text-gray-100">{card.battleSummary}</p>
              {card.knowledgePoints.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {card.knowledgePoints.map((kp) => (
                    <span
                      key={kp}
                      className="rounded-full border border-amber-700/40 bg-amber-900/20 px-2 py-0.5 text-[9px] text-amber-200"
                    >
                      {kp}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-violet-900/40 bg-violet-950/15 p-4">
              <p className="mb-2 text-[10px] font-black tracking-widest text-violet-300">🎯 梦校引力</p>
              <p className="text-sm leading-relaxed text-white">{card.dreamSchoolPull}</p>
            </section>

            <section className="rounded-xl border border-gray-800 bg-black/40 p-4 italic">
              <p className="text-[9px] text-gray-500">ZHI 特级评语</p>
              <p className="mt-1 text-sm text-[#00FF7F]">&ldquo;{card.zhiComment}&rdquo;</p>
            </section>

            <div className="space-y-2 border-t border-gray-900 pt-4">
              <p className="text-center text-[9px] tracking-widest text-gray-500">家长充能站</p>
              {card.cheerActions.map((action) => (
                <button
                  key={action.style}
                  type="button"
                  disabled={cheering}
                  onClick={() => void handleCheer(action)}
                  className={`w-full rounded-xl py-3.5 text-sm font-black transition-all disabled:opacity-50 ${
                    action.style === 'FIRE'
                      ? 'border border-orange-500/50 bg-orange-600/20 text-orange-200 hover:bg-orange-600/35'
                      : action.style === 'HEART'
                        ? 'border border-rose-500/50 bg-rose-600/20 text-rose-200 hover:bg-rose-600/35'
                        : 'border border-sky-500/50 bg-sky-600/20 text-sky-200 hover:bg-sky-600/35'
                  }`}
                >
                  {action.label}
                </button>
              ))}
              {cheerMsg && <p className="animate-pulse text-center text-xs text-[#00FF7F]">{cheerMsg}</p>}
            </div>
          </div>
        </div>

        {recap && Number(recap.total_days) > 0 && (
          <div className="mt-6 rounded-xl border border-gray-900 bg-[#050608] p-4">
            <p className="mb-3 text-[10px] font-black tracking-widest text-[#FF4500]">
              📊 近 {recap.periodDays} 天 · 认知成长图谱
            </p>
            <ul className="space-y-1.5 font-mono text-[10px] text-gray-400">
              <li>有效学习 {Number(recap.total_minutes ?? 0)} 分钟 · 战报 {Number(recap.total_days ?? 0)} 天</li>
              <li>重路由挽回深夜 {Number(recap.reroute_count ?? 0)} 次 · 逃避对抗 {Number(recap.total_escapes ?? 0)} 次</li>
              <li>家长充能 {Number(recap.total_cheers ?? 0)} 次 · 注入 Warp {Number(recap.total_fuel ?? 0)} 点</li>
            </ul>
          </div>
        )}

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-4 w-full rounded-xl border border-gray-800 py-2 text-sm text-gray-500 hover:text-white"
          >
            返回
          </button>
        )}
      </div>
    </div>
  );
}
