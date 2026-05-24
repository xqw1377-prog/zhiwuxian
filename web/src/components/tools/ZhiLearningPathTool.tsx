import { useCallback, useEffect, useState } from 'react';
import { useZhiChat } from '../../context/ZhiChatContext';
import {
  fetchLearningPath,
  rebuildLearningPath,
  type LearningPathDto,
} from '../../lib/zhi-learning-path-api';
import { emitAnchorBrief } from '../../lib/wuxian-events';
import { fetchAnchorBrief } from '../../lib/zhi-anchor-brief-api';
import { fetchTodayPlan, completeSlot, type TodayPlanDto } from '../../lib/zhi-planner-api';
import { teachKnowledgePoint, submitLessonCheckpoint, type LessonDto } from '../../lib/zhi-tutor-api';

export function ZhiLearningPathTool({ userId }: { userId: string }) {
  const { openTool, appendZhi } = useZhiChat();
  const [path, setPath] = useState<LearningPathDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [todayPlan, setTodayPlan] = useState<TodayPlanDto | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [tutorLesson, setTutorLesson] = useState<LessonDto | null>(null);
  const [tutorBusy, setTutorBusy] = useState(false);
  const [tutorCheckAnswer, setTutorCheckAnswer] = useState('');
  const [tutorCheckResult, setTutorCheckResult] = useState<'correct' | 'wrong' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const doc = await fetchLearningPath(userId);
      setPath(doc);
      if (!doc) setErr('暂无路径：请先完成梦校航标');
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
    void (async () => {
      setPlanLoading(true);
      try {
        const plan = await fetchTodayPlan(userId);
        setTodayPlan(plan);
      } catch { /* silently fail */ } finally {
        setPlanLoading(false);
      }
    })();
  }, [userId]);

  const onRebuild = async () => {
    setLoading(true);
    try {
      const doc = await rebuildLearningPath(userId);
      setPath(doc);
      setErr(null);
      const ab = await fetchAnchorBrief(userId);
      if (ab) emitAnchorBrief(ab);
      appendZhi(
        `【路径已重算】${doc.summaryLine}${doc.todayFocus ? `\n今日攻坚：${doc.todayFocus.title}` : ''}`,
        '学习路径',
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : '重算失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !path) {
    return <p className="p-4 text-sm text-gray-500">正在生成梦校学习路径…</p>;
  }

  if (err && !path) {
    return (
      <div className="p-4 text-sm text-amber-400">
        {err}
        <button type="button" className="ml-2 underline" onClick={() => openTool('anchor', { anchorEdit: true })}>
          去设定航标
        </button>
      </div>
    );
  }

  if (!path) return null;

  const active = path.phases.find((p) => p.milestoneStatus === 'IN_PROGRESS');

  return (
    <div className="flex flex-col gap-4 p-3 font-mono text-[10px] text-gray-300">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-cyan-300">梦校学习路径 · 知识工程</h3>
          <p className="mt-1 text-gray-400">{path.summaryLine}</p>
          <p className="text-gray-500">
            {path.targetSchool} · 剩 {path.daysRemaining} 天 · 掌握 {path.masteryPct ?? 0}%
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void onRebuild()}
          className="rounded-lg border border-cyan-500/40 px-3 py-1.5 text-[10px] text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
        >
          重算全路径
        </button>
      </div>

      {path.dataCompletenessPct != null && (
        <p className="text-[9px] text-gray-500">
          证据完备度 {path.dataCompletenessPct}%
          {path.missingSignals?.length ? ` · 待补齐：${path.missingSignals.join('、')}` : ''}
        </p>
      )}

      {todayPlan && (
        <div className="rounded-xl border border-[#00FF7F]/25 bg-[#00FF7F]/8 p-3">
          <p className="mb-1.5 text-[9px] uppercase tracking-widest text-[#00FF7F]">今日规划</p>
          <p className="mb-2 text-[9px] text-gray-500">{todayPlan.coachLine}</p>
          <div className="mb-2 flex items-center gap-2 text-[9px] text-gray-400">
            <span className="text-[#00FF7F]">{todayPlan.completed}/{todayPlan.total}</span>
            <span>时段已完成</span>
          </div>
          {todayPlan.slots.length > 0 && (
            <ul className="space-y-1">
              {todayPlan.slots.map((slot) => (
                <li key={slot.id} className="flex items-center justify-between gap-2 rounded border border-gray-900 bg-black/30 px-2 py-1 text-[9px]">
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${slot.status === 'DONE' ? 'bg-[#00FF7F]' : 'bg-amber-500'}`} />
                    <span className={slot.status === 'DONE' ? 'text-gray-500 line-through' : 'text-gray-200'}>{slot.subject}</span>
                  </span>
                  <span className="text-gray-500">{slot.startTime}-{slot.endTime} {slot.taskDescription.slice(0, 20)}</span>
                  {slot.status !== 'DONE' && (
                    <button
                      type="button"
                      className="text-[#00FF7F] underline"
                      onClick={async () => {
                        await completeSlot(userId, slot.id);
                        const plan = await fetchTodayPlan(userId);
                        setTodayPlan(plan);
                      }}
                    >
                      完成
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {todayPlan.slots.length === 0 && (
            <p className="text-[9px] text-gray-600">暂无规划时段，可先生成学习路径</p>
          )}
        </div>
      )}

      {planLoading && !todayPlan && (
        <p className="text-[9px] text-gray-500">加载今日规划…</p>
      )}

      {path.pushActions && path.pushActions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {path.pushActions.map((a) => (
            <button
              key={a.id}
              type="button"
              title={a.reason}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] text-amber-200 hover:bg-amber-500/20"
              onClick={() => {
                if (a.kind === 'assessment') {
                  openTool('learning-assessment', {
                    silent: true,
                    launch: { assessmentSubjectId: a.subjectId },
                  });
                } else if (a.kind === 'vision') openTool('vision-intercept', { silent: true });
                else if (a.kind === 'causal') openTool('causal-report', { silent: true });
                else if (a.kind === 'path') openTool('learning-path', { silent: true });
                else if (a.kind === 'anchor') openTool('anchor', { anchorEdit: true });
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {path.weaknessLedger && path.weaknessLedger.length > 0 && (
        <div>
          <p className="mb-1 text-[9px] uppercase tracking-widest text-amber-400/90">短板清单（证据汇聚）</p>
          <ul className="space-y-1">
            {path.weaknessLedger.map((w) => (
              <li
                key={w.id}
                className="rounded border border-gray-800 bg-black/30 px-2 py-1 text-[9px]"
              >
                <span className="text-amber-200">[{w.severity}] {w.title}</span>
                <span className="block text-gray-500">{w.evidence.slice(0, 72)}</span>
                <button
                  type="button"
                  className="mt-0.5 text-cyan-400 underline"
                  onClick={() =>
                    openTool('learning-assessment', {
                      silent: true,
                      launch: { assessmentSubjectId: w.subjectId },
                    })
                  }
                >
                  验收此短板
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {path.todayFocus && (
        <div className="rounded-xl border border-[#00FF7F]/35 bg-[#00FF7F]/10 p-3">
          <p className="text-[9px] uppercase tracking-widest text-[#00FF7F]">今日攻坚</p>
          <p className="mt-1 text-sm font-bold text-white">{path.todayFocus.title}</p>
          <p className="text-gray-400">
            {path.todayFocus.dueDate} · {path.todayFocus.reason}
          </p>
          <button
            type="button"
            className="mt-2 rounded-lg border border-[#00FF7F]/30 px-2 py-1 text-[9px] text-[#00FF7F]"
            onClick={() =>
              openTool('learning-assessment', {
                silent: true,
                launch: { assessmentSubjectId: path.todayFocus!.subjectId },
              })
            }
          >
            立即验收（有学必考）
          </button>
        </div>
      )}

      {path.criticalDates && path.criticalDates.length > 0 && (
        <div>
          <p className="mb-1 text-[9px] uppercase tracking-widest text-gray-500">关键考期</p>
          <ul className="space-y-1">
            {path.criticalDates.map((c) => (
              <li key={`${c.date}-${c.label}`} className="flex justify-between gap-2">
                <span className="text-cyan-400">{c.date}</span>
                <span className="text-right text-gray-400">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {path.weeklyCheckpoints && path.weeklyCheckpoints.length > 0 && (
        <div>
          <p className="mb-1 text-[9px] uppercase tracking-widest text-gray-500">四周交付</p>
          <ul className="space-y-1">
            {path.weeklyCheckpoints.map((w) => (
              <li key={w.weekStart}>
                <span className="text-gray-500">{w.weekStart}</span> {w.deliverable}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 text-[9px] uppercase tracking-widest text-gray-500">
          阶段时间轴 {active ? `· 当前 ${active.phase}` : ''}
        </p>
        <ul className="space-y-3">
          {path.phases.map((p) => (
            <li
              key={p.id}
              className={`rounded-xl border p-3 ${
                p.milestoneStatus === 'IN_PROGRESS'
                  ? 'border-cyan-400/50 bg-cyan-500/10'
                  : p.milestoneStatus === 'COMPLETED'
                    ? 'border-gray-800 bg-black/30 opacity-70'
                    : 'border-gray-900 bg-black/40'
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-bold text-white">{p.phase}</span>
                <span className="text-cyan-300">{p.deadline}</span>
              </div>
              <p className="mt-1 text-gray-400">目标：{p.goalSummary}</p>
              <p className="text-gray-500">过关：{p.exitCriteria}</p>
              <ul className="mt-2 space-y-1 border-t border-gray-800 pt-2">
                {p.knowledgeUnits.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-gray-300">{u.title}</span>
                    <span className="flex items-center gap-1.5 text-[8px] text-gray-500">
                      {u.currentPct}%→{u.masteryTargetPct}% · {u.dueDate}
                      {u.requiresAssessment ? ' · 必考' : ''}
                      <button
                        type="button"
                        disabled={tutorBusy}
                        className="text-cyan-400 underline disabled:opacity-40"
                        onClick={async () => {
                          setTutorBusy(true);
                          setTutorLesson(null);
                          try {
                            const subject = p.knowledgeUnits.find((ku) => ku.id === u.id)?.title ?? u.title;
                            const lesson = await teachKnowledgePoint({
                              userId,
                              knowledgePoint: u.title,
                              subject: p.phase,
                              context: `当前掌握度 ${u.currentPct}%，目标 ${u.masteryTargetPct}%`,
                              sourceType: 'planned_knowledge',
                              sourceId: u.id,
                            });
                            setTutorLesson(lesson);
                            setTutorCheckAnswer('');
                            setTutorCheckResult(null);
                          } catch { /* silently fail */ } finally { setTutorBusy(false); }
                        }}
                      >
                        讲解
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      {path.nextAssessmentDue && (
        <p className="text-center text-[9px] text-[#00FF7F]/80">
          下次必考验收：{path.nextAssessmentDue}
        </p>
      )}

      {tutorLesson && (
        <div className="space-y-2 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-cyan-200">{tutorLesson.knowledgePoint}</p>
            <button
              type="button"
              className="text-[9px] text-gray-500"
              onClick={() => setTutorLesson(null)}
            >
              收起
            </button>
          </div>
          {tutorLesson.prerequisiteCheck && <p className="text-[9px] text-gray-500">前置：{tutorLesson.prerequisiteCheck}</p>}
          <p className="text-[10px] leading-relaxed text-gray-200 whitespace-pre-wrap">{tutorLesson.coreTeaching}</p>
          {tutorLesson.analogy && <p className="text-[9px] text-amber-200">💡 {tutorLesson.analogy}</p>}
          {tutorLesson.commonMistakes && <p className="text-[9px] text-rose-300">⚠️ {tutorLesson.commonMistakes}</p>}

          {tutorLesson.checkpointQuestion && (
            <div className="border-t border-gray-800 pt-2">
              <p className="text-[9px] text-[#00FF7F] mb-1">随堂验收：{tutorLesson.checkpointQuestion}</p>
              <div className="space-y-1">
                {tutorLesson.checkpointOptions.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-[9px] text-gray-400 cursor-pointer">
                    <input
                      type="radio"
                      name="path-check"
                      checked={tutorCheckAnswer === opt}
                      onChange={() => { setTutorCheckAnswer(opt); setTutorCheckResult(null); }}
                    />
                    {opt}
                  </label>
                ))}
              </div>
              {tutorCheckAnswer && !tutorCheckResult && (
                <button
                  type="button"
                  className="mt-1 rounded bg-[#00FF7F]/20 px-3 py-1 text-[9px] text-[#00FF7F]"
                  onClick={async () => {
                    try {
                      const result = await submitLessonCheckpoint(userId, tutorLesson.id, tutorCheckAnswer);
                      setTutorCheckResult(result.passed ? 'correct' : 'wrong');
                      if (result.passed) appendZhi(`✅ ${tutorLesson.knowledgePoint} 验收通过，掌握度已更新`, '学习路径');
                      else appendZhi(`❌ ${tutorLesson.knowledgePoint} 验收未通过，正确答案：${result.correctAnswer}`, '学习路径');
                    } catch (e) {
                      appendZhi(e instanceof Error ? e.message : '提交失败', '学习路径');
                    }
                  }}
                >
                  提交答案
                </button>
              )}
              {tutorCheckResult && (
                <p className={`mt-1 text-[9px] ${tutorCheckResult === 'correct' ? 'text-[#00FF7F]' : 'text-rose-300'}`}>
                  {tutorCheckResult === 'correct' ? '✓ 正确！掌握度已提升' : `✗ 未通过，正确答案：${tutorLesson.checkpointAnswer}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
