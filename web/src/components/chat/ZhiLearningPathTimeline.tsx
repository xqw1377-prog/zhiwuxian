import { useCallback, useEffect, useState } from 'react';
import {
  fetchLearningPath,
  rebuildLearningPath,
  type LearningPathDto,
  type PathPhaseDto,
} from '../../lib/zhi-learning-path-api';
import { onWuxianEvent, WUXIAN_EVENTS } from '../../lib/wuxian-events';
import { useZhiChat } from '../../context/ZhiChatContext';

function phaseIcon(status: PathPhaseDto['milestoneStatus']): string {
  if (status === 'IN_PROGRESS') return '▶';
  if (status === 'COMPLETED') return '✓';
  return '○';
}

function unitStatusLabel(status: string): string {
  if (status === 'mastered') return '已掌握';
  if (status === 'in_progress') return '进行中';
  if (status === 'assessment_due') return '待验收';
  if (status === 'failed') return '未过关';
  return '待解锁';
}

export function ZhiLearningPathTimeline({
  userId,
  compact = false,
}: {
  userId: string;
  compact?: boolean;
}) {
  const { openTool } = useZhiChat();
  const [path, setPath] = useState<LearningPathDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const doc = await fetchLearningPath(userId);
      setPath(doc);
      if (!doc) setErr('暂无路径，请先完成梦校航标');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return onWuxianEvent(WUXIAN_EVENTS.anchorBrief, () => {
      void load();
    });
  }, [load]);

  const onRebuild = async () => {
    setLoading(true);
    try {
      const doc = await rebuildLearningPath(userId);
      setPath(doc);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '重建失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !path) {
    return <p className="text-[9px] text-gray-500">加载梦校学习路径…</p>;
  }

  if (err && !path) {
    return (
      <p className="text-[9px] text-amber-400/90">
        {err}
        <button type="button" className="ml-2 underline" onClick={() => void load()}>
          重试
        </button>
      </p>
    );
  }

  if (!path?.phases?.length) return null;

  return (
    <div
      className={`rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-left font-mono ${
        compact ? 'p-2 text-[9px]' : 'p-3 text-[10px]'
      } text-gray-300`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold text-cyan-300">
          梦校学习路径
          <span className="ml-2 font-normal text-gray-500">
            剩 {path.daysRemaining} 天 · {path.pathwayLabel}
          </span>
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void onRebuild()}
          className="shrink-0 rounded border border-cyan-500/30 px-1.5 py-0.5 text-[8px] text-cyan-300/90 hover:bg-cyan-500/10 disabled:opacity-50"
        >
          重算路径
        </button>
      </div>
      <p className="mb-2 text-gray-400">{path.summaryLine}</p>
      {path.todayFocus && (
        <div className="mb-2 rounded-lg border border-[#00FF7F]/25 bg-[#00FF7F]/5 px-2 py-1.5">
          <p className="text-[8px] text-[#00FF7F]">今日攻坚</p>
          <p className="font-bold text-white">{path.todayFocus.title}</p>
          <button
            type="button"
            className="mt-1 text-[8px] text-cyan-300 underline"
            onClick={() => openTool('learning-path', { silent: true })}
          >
            展开全路径 →
          </button>
        </div>
      )}
      {path.masteryPct != null && (
        <p className="mb-1 text-gray-500">综合掌握 {path.masteryPct}%</p>
      )}
      {path.nextAssessmentDue ? (
        <p className="mb-2 text-[#00FF7F]/80">下次必考验收：{path.nextAssessmentDue}</p>
      ) : null}
      <ul className="space-y-2">
        {path.phases.map((p) => (
          <li
            key={p.id}
            className={`rounded-lg border px-2 py-1.5 ${
              p.milestoneStatus === 'IN_PROGRESS'
                ? 'border-cyan-400/40 bg-cyan-500/10'
                : 'border-gray-900 bg-black/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-cyan-300">
                {phaseIcon(p.milestoneStatus)} {p.deadline}
              </span>
              <span className="text-[8px] text-gray-500">
                {p.milestoneStatus === 'IN_PROGRESS'
                  ? '进行中'
                  : p.milestoneStatus === 'COMPLETED'
                    ? '已完成'
                    : '待解锁'}
              </span>
            </div>
            <p className="mt-0.5 font-bold text-white">{p.phase}</p>
            <p className="text-gray-400">目标：{p.goalSummary}</p>
            <p className="text-gray-500">过关：{p.exitCriteria}</p>
            {p.knowledgeUnits.length > 0 && (
              <ul className="mt-1 space-y-0.5 border-t border-gray-800/80 pt-1">
                {p.knowledgeUnits.slice(0, compact ? 3 : 5).map((u) => (
                  <li key={u.id} className="text-[8px] text-gray-400">
                    <span className="text-gray-300">{u.title}</span>
                    <span className="ml-1">
                      · {u.dueDate} · {unitStatusLabel(u.status)}
                      {u.requiresAssessment ? ' · 必考' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
