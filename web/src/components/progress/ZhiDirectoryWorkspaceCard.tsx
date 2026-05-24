import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useZhiChat } from '../../context/ZhiChatContext';
import { useZhiDirectory } from '../../context/ZhiDirectoryContext';
import {
  createDirectoryGoal,
  emitDirectoryWorkspaceRefresh,
  fetchDirectoryWorkspace,
  updateTaskStatus,
  type DirectoryWorkspaceDto,
  type TaskRerouteDto,
} from '../../lib/directory-workspace-api';
import { onWuxianEvent, WUXIAN_EVENTS } from '../../lib/wuxian-events';

function isToeflDirectory(directoryId: string, title: string): boolean {
  return /TOEFL|托福/i.test(directoryId) || /托福/i.test(title);
}

type LoopStep = 'boot' | 'tasks' | 'assess' | 'reroute';

export function ZhiDirectoryWorkspaceCard() {
  const { userId, openTool, appendZhi } = useZhiChat();
  const { activeId, activeDirectory, refreshDirectories } = useZhiDirectory();
  const [workspace, setWorkspace] = useState<DirectoryWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [lastReroute, setLastReroute] = useState<TaskRerouteDto | null>(null);

  const reload = useCallback(async () => {
    if (!userId || !activeId) {
      setWorkspace(null);
      return;
    }
    setLoading(true);
    try {
      const ws = await fetchDirectoryWorkspace(userId, activeId);
      setWorkspace(ws);
    } finally {
      setLoading(false);
    }
  }, [userId, activeId]);

  useEffect(() => {
    void reload();
    setLastReroute(null);
  }, [reload]);

  useEffect(() => {
    const onWorkspace = (detail: { directoryId?: string }) => {
      if (detail?.directoryId && detail.directoryId !== activeId) return;
      void reload();
    };
    const unsubWs = onWuxianEvent(WUXIAN_EVENTS.directoryWorkspaceRefresh, onWorkspace);
    const unsubDir = onWuxianEvent(WUXIAN_EVENTS.directoriesRefresh, () => {
      void reload();
    });
    return () => {
      unsubWs();
      unsubDir();
    };
  }, [activeId, reload]);

  const toeflMode = activeId && activeDirectory ? isToeflDirectory(activeId, activeDirectory.title) : false;

  const loopStep = useMemo((): LoopStep => {
    if (!workspace) return 'boot';
    if (workspace.goals.length === 0 && workspace.suggestTemplateId) return 'boot';
    const todo = workspace.stats.todoToday;
    if (todo > 0) return 'tasks';
    if (workspace.stats.failedToday > 0 || lastReroute) return 'reroute';
    if (toeflMode && workspace.stats.doneToday > 0) return 'assess';
    return workspace.goals.length > 0 ? 'assess' : 'boot';
  }, [workspace, lastReroute, toeflMode]);

  const onCreateSuggested = async () => {
    if (!userId || !activeId || !workspace?.suggestTemplateId || creating) return;
    setCreating(true);
    try {
      const created = await createDirectoryGoal({
        userId,
        directoryId: activeId,
        title: workspace.suggestTitle ?? '90 天托福破百作战',
        days: 90,
        templateId: workspace.suggestTemplateId,
      });
      if (created?.companionSpeech) {
        appendZhi(created.companionSpeech, '90天作战舱');
      } else {
        appendZhi('托福 90 天作战舱已拆解，今日任务已写入作战区。', '90天作战舱');
      }
      emitDirectoryWorkspaceRefresh(activeId);
      await refreshDirectories(activeId);
      await reload();
    } finally {
      setCreating(false);
    }
  };

  const onTask = async (goalId: string, taskId: string, status: 'DONE' | 'FAILED') => {
    if (busyTaskId) return;
    setBusyTaskId(taskId);
    try {
      const result = await updateTaskStatus({ goalId, taskId, status });
      if (!result.ok) return;

      if (result.reroute?.companionSpeech) {
        setLastReroute(result.reroute);
        const hint = status === 'FAILED' ? '路径重路由' : '任务入账';
        appendZhi(result.reroute.companionSpeech, hint);
        if (status === 'FAILED' && result.reroute.nextTasks.length > 0) {
          const next = result.reroute.nextTasks.map((t) => `· ${t.desc}`).join('\n');
          appendZhi(`明日/替补任务已生成：\n${next}`, hint);
        }
      } else if (status === 'DONE') {
        appendZhi('今日原子任务已入账，斜率压力下降。完成一轮后可做托福/雅思模考清算。', '任务入账');
      }

      emitDirectoryWorkspaceRefresh(activeId ?? undefined);
      await refreshDirectories(activeId ?? undefined);
      await reload();
    } finally {
      setBusyTaskId(null);
    }
  };

  const openToeflAssessment = () => {
    openTool('learning-assessment', {
      launch: { assessmentTab: 'standard', assessmentSubjectId: 'toefl' },
    });
  };

  const openLanguageCoach = () => {
    openTool('language-coach', { silent: true });
    appendZhi('打开语言陪练：录 45 秒独立口语后回来，在「学习评估」里填写要点。', '口语陪练');
  };

  if (!activeId || !activeDirectory) return null;

  const title = activeDirectory.title;
  const stats = workspace?.stats;

  const loopLabels: Record<LoopStep, string> = {
    boot: '① 开战',
    tasks: '② 今日',
    assess: '③ 评估',
    reroute: '④ 重路由',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[92%] rounded-xl border border-[#00FF7F]/25 bg-[#00FF7F]/5 p-3 text-left text-[10px] text-gray-300"
      role="region"
      aria-label="目录作战区"
    >
      <p className="mb-1 text-[11px] font-bold text-[#00FF7F]">作战区 · {title}</p>

      {toeflMode && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {(['boot', 'tasks', 'assess', 'reroute'] as LoopStep[]).map((s) => (
            <span
              key={s}
              className={`rounded-full px-2 py-0.5 text-[8px] ${
                loopStep === s
                  ? 'bg-[#00FF7F]/20 text-[#00FF7F] border border-[#00FF7F]/35'
                  : 'border border-gray-800 text-gray-600'
              }`}
            >
              {loopLabels[s]}
            </span>
          ))}
          <span className="text-[8px] text-gray-600">90天闭环</span>
        </div>
      )}

      {toeflMode && workspace && workspace.goals.length > 0 && (
        <div className="mb-2 flex gap-1">
          <button
            type="button"
            onClick={openToeflAssessment}
            className="flex-1 rounded-lg border border-violet-500/35 py-1.5 text-[9px] text-violet-200 hover:bg-violet-500/10"
          >
            托福/雅思模考
          </button>
          <button
            type="button"
            onClick={openLanguageCoach}
            className="flex-1 rounded-lg border border-amber-500/35 py-1.5 text-[9px] text-amber-200 hover:bg-amber-500/10"
          >
            45s 口语
          </button>
        </div>
      )}

      {lastReroute && lastReroute.showBubble && (
        <p className="mb-2 rounded-lg border border-amber-900/40 bg-amber-950/30 px-2 py-1.5 text-[9px] leading-relaxed text-amber-100/90">
          {lastReroute.companionSpeech}
        </p>
      )}

      {loading && <p className="text-[9px] text-gray-500">加载目标与今日任务…</p>}
      {!loading && workspace && (
        <>
          {stats && (
            <p className="mb-2 text-[9px] text-gray-500">
              今日待办 {stats.todoToday} · 已完成 {stats.doneToday}
              {stats.failedToday > 0 ? ` · 失败 ${stats.failedToday}` : ''}
              {!workspace.linkedToDirectory && workspace.goals.length > 0 && (
                <span className="text-amber-400/80"> · 展示未挂目录的近期目标</span>
              )}
            </p>
          )}
          {workspace.goals.length === 0 && workspace.suggestTemplateId && (
            <motion.div className="mb-2 rounded-lg border border-dashed border-gray-700 p-2">
              <p className="mb-2 text-[9px] text-gray-400">该目录尚无绑定目标，可一键开启托福 90 天作战舱。</p>
              <button
                type="button"
                onClick={() => void onCreateSuggested()}
                disabled={creating}
                className="w-full rounded-lg border border-[#00FF7F]/40 py-2 text-[10px] font-bold text-[#00FF7F] hover:bg-[#00FF7F]/10 disabled:opacity-50"
              >
                {creating ? '拆解中…' : `开启 · ${workspace.suggestTitle ?? '90 天作战'}`}
              </button>
            </motion.div>
          )}
          {workspace.goals.map((g) => (
            <motion.div key={g.id} className="mb-3 rounded-lg border border-gray-800 bg-[#0A0B0E]/80 p-2">
              <p className="text-[10px] font-semibold text-white">{g.title}</p>
              <p className="mb-1 text-[8px] text-gray-500">
                剩余 {g.remainingDays}/{g.durationDays} 天 · 能量 {g.remainingEnergy}/{g.totalEnergy} · 风险{' '}
                {g.deviationRisk}%
              </p>
              {g.todayTasks.length === 0 ? (
                <p className="text-[9px] text-gray-600">
                  今日暂无待办
                  {toeflMode ? ' · 可做模考评估或等待明日任务' : '（可能已完成或需重路由）'}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {g.todayTasks.map((t) => (
                    <li
                      key={t.id}
                      className={`rounded-md border px-2 py-1.5 ${
                        t.status === 'DONE'
                          ? 'border-gray-800 opacity-60 line-through'
                          : t.status === 'FAILED'
                            ? 'border-red-900/50'
                            : 'border-gray-800'
                      }`}
                    >
                      <p className="text-[9px] leading-snug text-gray-200">{t.content}</p>
                      {t.status === 'TODO' && (
                        <motion.div className="mt-1.5 flex gap-1">
                          <button
                            type="button"
                            disabled={busyTaskId === t.id}
                            onClick={() => void onTask(g.id, t.id, 'DONE')}
                            className="flex-1 rounded border border-[#00FF7F]/35 py-1 text-[9px] text-[#00FF7F] hover:bg-[#00FF7F]/10 disabled:opacity-50"
                          >
                            完成
                          </button>
                          <button
                            type="button"
                            disabled={busyTaskId === t.id}
                            onClick={() => void onTask(g.id, t.id, 'FAILED')}
                            className="flex-1 rounded border border-gray-700 py-1 text-[9px] text-gray-400 hover:bg-gray-900 disabled:opacity-50"
                          >
                            未完成 → 重路由
                          </button>
                        </motion.div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
        </>
      )}
    </motion.div>
  );
}
