import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  listCoursewareForReview,
  reviewCourseware,
  type CoursewareAdminItemDto,
  type CoursewareReviewAction,
} from '../../lib/courseware-admin-api';

const GRADE_COLOR: Record<string, string> = {
  S: 'text-amber-300 border-amber-500/40',
  A: 'text-[#00FF7F] border-[#00FF7F]/40',
  B: 'text-gray-300 border-gray-600',
  C: 'text-rose-400 border-rose-500/40',
};

type Filter = 'pending' | 'all' | 'B';

export function ZhiCoursewareAdminTool() {
  const [filter, setFilter] = useState<Filter>('pending');
  const [items, setItems] = useState<CoursewareAdminItemDto[]>([]);
  const [pendingReview, setPendingReview] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const pack = await listCoursewareForReview({
      pendingReviewOnly: filter === 'pending',
      grade: filter === 'B' ? 'B' : undefined,
    });
    setItems(pack?.items ?? []);
    setPendingReview(pack?.pendingReview ?? 0);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const runReview = async (id: string, action: CoursewareReviewAction, label: string) => {
    setBusyId(id);
    setMsg('');
    const updated = await reviewCourseware(id, action);
    if (updated) {
      setMsg(`${label}：${updated.title.slice(0, 40)}`);
      await load();
    } else {
      setMsg('审核失败，请重试');
    }
    setBusyId(null);
  };

  return (
    <motion.div className="space-y-3 text-left">
      <motion.div className="flex flex-wrap gap-1">
        {(
          [
            ['pending', `待复核 (${pendingReview})`],
            ['B', 'B 级全部'],
            ['all', '全部课件'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-md px-2 py-1 text-[9px] font-bold ${
              filter === id ? 'bg-violet-600 text-white' : 'border border-gray-800 text-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </motion.div>

      {msg && <p className="text-[9px] text-[#00FF7F]">{msg}</p>}

      {loading ? (
        <p className="text-[9px] text-gray-600">加载课件库…</p>
      ) : items.length === 0 ? (
        <p className="text-[9px] leading-relaxed text-gray-600">
          暂无待复核课件。视频同化入库的 B 级课件会出现在这里，审核后可升为 A 级参与优先匹配。
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {items.map((cw) => (
            <li
              key={cw.id}
              className="rounded-xl border border-gray-900 bg-black/50 p-2.5"
            >
              <motion.div className="flex items-start justify-between gap-2">
                <motion.div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold text-gray-100">{cw.title}</p>
                  <p className="mt-0.5 text-[9px] text-gray-500">
                    {cw.instructor ?? cw.platform} · {cw.subject} · 综合 {cw.quality.composite}
                  </p>
                  <p className="mt-1 truncate text-[8px] text-gray-600">{cw.summary}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cw.topicTags.slice(0, 4).map((t) => (
                      <span key={t} className="rounded border border-gray-800 px-1 text-[7px] text-gray-500">
                        {t}
                      </span>
                    ))}
                  </div>
                </motion.div>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-black ${GRADE_COLOR[cw.qualityGrade] ?? GRADE_COLOR.B}`}
                >
                  {cw.qualityGrade}
                </span>
              </motion.div>
              {cw.qualityGrade === 'B' && (
                <motion.div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === cw.id}
                    onClick={() => void runReview(cw.id, 'promote_a', '已升 A')}
                    className="flex-1 rounded-lg border border-[#00FF7F]/40 py-1.5 text-[9px] font-bold text-[#00FF7F] hover:bg-[#00FF7F]/10 disabled:opacity-50"
                  >
                    {busyId === cw.id ? '处理中…' : '升 A · 优质'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === cw.id}
                    onClick={() => void runReview(cw.id, 'promote_s', '已升 S')}
                    className="rounded-lg border border-amber-500/30 px-2 py-1.5 text-[9px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    升 S
                  </button>
                </motion.div>
              )}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
