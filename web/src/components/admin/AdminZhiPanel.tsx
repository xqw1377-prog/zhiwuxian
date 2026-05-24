import { useCallback, useEffect, useState } from 'react';
import { getAuthToken } from '../../lib/api-auth';
import {
  listCoursewareForReview,
  reviewCourseware,
  type CoursewareAdminItemDto,
  type CoursewareReviewAction,
} from '../../lib/courseware-admin-api';

type LearningSnapshot = {
  userId: string;
  anchor: { school: string | null; grade: string | null; intakeYear: string | null };
  path: {
    hasPath: boolean;
    targetSchool: string | null;
    challengeIndex: number | null;
    phaseCount: number;
    todayFocus: string | null;
    nextAssessmentDue: string | null;
    dataCompletenessPct: number | null;
  };
  evidence: {
    weaknessCount: number;
    topWeaknesses: Array<{ title: string; subjectName: string; severity: number }>;
    pushHeadline: string;
    missingSignals: string[];
  };
  assessment: {
    subjectCount: number;
    pendingActive: number;
    recentPapers: Array<{
      id: string;
      title: string;
      subjectId: string;
      status: string;
      paperType: string;
    }>;
  };
  foldTime?: {
    cohort: string;
    qualifiedActiveLearner: boolean;
    weaknessImproved: boolean;
    foldEfficiencyIndex: number;
    papersReckoned28d: number;
    studyMinutesWeek1: number;
    studyMinutesWeek4: number;
  };
};

type SubTab = 'learning' | 'courseware';

export function AdminZhiPanel({ initialUserId }: { initialUserId?: string }) {
  const [sub, setSub] = useState<SubTab>('learning');
  const [userId, setUserId] = useState(initialUserId ?? '');
  const [snap, setSnap] = useState<LearningSnapshot | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [cwItems, setCwItems] = useState<CoursewareAdminItemDto[]>([]);
  const [cwPending, setCwPending] = useState(0);
  const [cwFilter, setCwFilter] = useState<'pending' | 'all'>('pending');

  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const fetchJson = useCallback(
    async (url: string, init?: RequestInit) => {
      const res = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || json?.message || '请求失败');
      return json?.data ?? json;
    },
    [token],
  );

  const loadSnapshot = async () => {
    const uid = userId.trim();
    if (!uid) return;
    setBusy(true);
    setMsg('');
    try {
      const d = await fetchJson(`/api/v1/admin/learning/users/${encodeURIComponent(uid)}`);
      setSnap(d as LearningSnapshot);
    } catch (e) {
      setSnap(null);
      setMsg(e instanceof Error ? e.message : '加载失败');
    } finally {
      setBusy(false);
    }
  };

  const rebuildPath = async () => {
    const uid = userId.trim();
    if (!uid) return;
    setBusy(true);
    setMsg('');
    try {
      const d = await fetchJson(`/api/v1/admin/learning/users/${encodeURIComponent(uid)}/rebuild-path`, {
        method: 'POST',
      });
      setMsg(d.ok ? `路径已重算：${d.path?.targetSchool ?? '—'}（${d.path?.phaseCount ?? 0} 阶段）` : '重算失败');
      await loadSnapshot();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '重算失败');
    } finally {
      setBusy(false);
    }
  };

  const loadCourseware = async () => {
    setBusy(true);
    try {
      const d = await listCoursewareForReview({
        pendingReviewOnly: cwFilter === 'pending',
      });
      setCwItems(d?.items ?? []);
      setCwPending(d?.pendingReview ?? 0);
    } catch {
      setCwItems([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialUserId?.trim()) setUserId(initialUserId.trim());
  }, [initialUserId]);

  useEffect(() => {
    if (sub === 'courseware') void loadCourseware();
  }, [sub, cwFilter]);

  const doReview = async (id: string, action: CoursewareReviewAction) => {
    setBusy(true);
    try {
      await reviewCourseware(id, action);
      setMsg(`已执行 ${action}`);
      await loadCourseware();
    } catch {
      setMsg('审核失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            ['learning', '学习数据'],
            ['courseware', `课件审核${cwPending ? ` (${cwPending})` : ''}`],
          ] as [SubTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSub(id)}
            className={`px-3 py-1.5 rounded-lg text-xs ${sub === id ? 'bg-emerald-700 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && <p className="text-xs text-amber-400">{msg}</p>}

      {sub === 'learning' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
            <h3 className="text-sm font-medium text-white mb-3">按用户 ID 查看 ZHI 学业快照</h3>
            <div className="flex flex-wrap gap-2">
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="用户 ID"
                className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs w-72 font-mono"
              />
              <button
                type="button"
                onClick={() => void loadSnapshot()}
                disabled={!userId.trim() || busy}
                className="px-3 py-1.5 rounded-lg bg-cyan-700 text-white text-xs disabled:opacity-50"
              >
                加载
              </button>
              <button
                type="button"
                onClick={() => void rebuildPath()}
                disabled={!userId.trim() || busy}
                className="px-3 py-1.5 rounded-lg bg-amber-800 text-white text-xs disabled:opacity-50"
              >
                重算学习路径
              </button>
            </div>
          </div>

          {snap && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-2">
                <h4 className="text-white font-medium">梦校航标</h4>
                <p className="text-gray-400">
                  {snap.anchor.school || '未锁定'} · {snap.anchor.grade || '—'} · 入学{' '}
                  {snap.anchor.intakeYear || '—'}
                </p>
                <h4 className="text-white font-medium pt-2">学习路径</h4>
                {snap.path.hasPath ? (
                  <>
                    <p className="text-cyan-300">{snap.path.targetSchool}</p>
                    <p className="text-gray-400">
                      挑战指数 {snap.path.challengeIndex} · {snap.path.phaseCount} 阶段 · 完备度{' '}
                      {snap.path.dataCompletenessPct ?? '—'}%
                    </p>
                    <p className="text-gray-300">今日：{snap.path.todayFocus || '—'}</p>
                    <p className="text-gray-500">下次必考：{snap.path.nextAssessmentDue || '—'}</p>
                  </>
                ) : (
                  <p className="text-gray-500">暂无路径文档</p>
                )}
              </div>
              <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-2">
                <h4 className="text-white font-medium">短板证据</h4>
                <p className="text-gray-300">{snap.evidence.pushHeadline}</p>
                <ul className="text-gray-400 list-disc pl-4">
                  {snap.evidence.topWeaknesses.map((w) => (
                    <li key={w.title}>
                      [{w.subjectName}] {w.title}（{w.severity}）
                    </li>
                  ))}
                </ul>
                {snap.evidence.missingSignals.length > 0 && (
                  <p className="text-red-400/80">缺：{snap.evidence.missingSignals.join('、')}</p>
                )}
                {snap.foldTime && (
                  <>
                    <h4 className="text-white font-medium pt-2">折叠时间 / OKR</h4>
                    <p className="text-gray-400">
                      层级 {snap.foldTime.cohort}
                      {snap.foldTime.qualifiedActiveLearner ? ' · ✓ QAL' : ''}
                      {snap.foldTime.weaknessImproved ? ' · 弱项↑' : ''}
                    </p>
                    <p className="text-gray-500">
                      28天交卷 {snap.foldTime.papersReckoned28d} · 折叠率 {snap.foldTime.foldEfficiencyIndex} ·
                      学习分钟 W1 {snap.foldTime.studyMinutesWeek1} → W4 {snap.foldTime.studyMinutesWeek4}
                    </p>
                  </>
                )}
                <h4 className="text-white font-medium pt-2">评估卷</h4>
                <p className="text-gray-400">
                  分科 {snap.assessment.subjectCount} · 待答主动卷 {snap.assessment.pendingActive}
                </p>
                <ul className="text-gray-500 space-y-1">
                  {snap.assessment.recentPapers.slice(0, 6).map((p) => (
                    <li key={p.id} className="font-mono truncate">
                      {p.title} · {p.status} · {p.paperType}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {sub === 'courseware' && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={cwFilter}
              onChange={(e) => setCwFilter(e.target.value as 'pending' | 'all')}
              className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs"
            >
              <option value="pending">待审核</option>
              <option value="all">全部</option>
            </select>
            <button
              type="button"
              onClick={() => void loadCourseware()}
              className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs"
            >
              刷新
            </button>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {cwItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-gray-200 truncate">{item.title}</p>
                  <p className="text-gray-600 font-mono text-[10px]">
                    {item.qualityGrade} · {item.status} · {item.id.slice(0, 12)}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void doReview(item.id, 'promote_a')}
                    className="px-2 py-1 rounded text-[10px] bg-cyan-900 text-cyan-300"
                  >
                    →A
                  </button>
                  <button
                    type="button"
                    onClick={() => void doReview(item.id, 'promote_s')}
                    className="px-2 py-1 rounded text-[10px] bg-amber-900 text-amber-300"
                  >
                    →S
                  </button>
                  <button
                    type="button"
                    onClick={() => void doReview(item.id, 'archive')}
                    className="px-2 py-1 rounded text-[10px] bg-gray-800 text-gray-400"
                  >
                    归档
                  </button>
                </div>
              </div>
            ))}
            {cwItems.length === 0 && <p className="text-gray-500 text-sm py-6 text-center">暂无课件</p>}
          </div>
        </div>
      )}
    </div>
  );
}
