import { useCallback, useEffect, useState } from 'react';
import { useZhiChat } from '../../context/ZhiChatContext';
import { submitCausalReport } from '../../lib/zhi-causal-report-api';
import { emitDirectoryWorkspaceRefresh, emitWuxianEventUntyped, WUXIAN_EVENTS } from '../../lib/wuxian-events';
import {
  startSession,
  endSession,
  fetchActiveSession,
  fetchSessionSummary,
  fetchWeeklyReport,
  type ActiveSessionDto,
  type SessionSummaryDto,
  type WeeklyReportDto,
} from '../../lib/zhi-timer-api';
import { checkAndUnlockAchievements } from '../../lib/zhi-achievement-api';

const SUBJECTS = ['数学', '物理', '化学', '英语', '托福', 'SAT', '算法', '综合'];

export function ZhiCausalReportTool({ userId }: { userId: string }) {
  const { appendZhi, openTool } = useZhiChat();
  const [subject, setSubject] = useState('综合');
  const [completed, setCompleted] = useState('');
  const [stuck, setStuck] = useState('');
  const [deliverable, setDeliverable] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSessionDto | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionSummaryDto | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportDto | null>(null);
  const [mood, setMood] = useState('');
  const [timerBusy, setTimerBusy] = useState(false);

  const loadTimerData = useCallback(async () => {
    try {
      const [active, summary, report] = await Promise.all([
        fetchActiveSession(userId),
        fetchSessionSummary(userId),
        fetchWeeklyReport(userId),
      ]);
      setActiveSession(active);
      setSessionSummary(summary);
      setWeeklyReport(report);
    } catch { /* silently fail */ }
  }, [userId]);

  useEffect(() => {
    void loadTimerData();
  }, [loadTimerData]);

  const onStartSession = async () => {
    setTimerBusy(true);
    try {
      const s = await startSession({ userId, subject });
      setActiveSession(s);
      appendZhi(`⏱ ${subject} 学习计时已开始`, '学习计时');
    } catch (e) {
      appendZhi(e instanceof Error ? e.message : '启动计时失败', '学习计时');
    } finally {
      setTimerBusy(false);
    }
  };

  const onEndSession = async () => {
    if (!activeSession) return;
    setTimerBusy(true);
    try {
      const result = await endSession(userId, activeSession.id, { mood: mood || undefined });
      setActiveSession(null);
      setMood('');
      appendZhi(`⏱ 本次学习 ${Math.round(result.durationSeconds / 60)} 分钟${mood ? ` · 心情：${mood}` : ''}`, '学习计时');
      await loadTimerData();
      await checkAndUnlockAchievements(userId, 'study', Math.round(result.durationSeconds / 60));
    } catch (e) {
      appendZhi(e instanceof Error ? e.message : '结束计时失败', '学习计时');
    } finally {
      setTimerBusy(false);
    }
  };

  const onSubmit = async () => {
    setBusy(true);
    try {
      const result = await submitCausalReport(userId, {
        completed: completed.trim(),
        stuck: stuck.trim(),
        deliverable: deliverable.trim(),
        subject,
      });
      appendZhi(result.chatText, '因果汇报');
      if (result.openLanguageCoach) {
        openTool('language-coach');
      }
      if (result.openVideoLearn) {
        openTool('video-learn');
      }
      if (result.review) {
        emitWuxianEventUntyped(WUXIAN_EVENTS.dailyReview, result.review);
      }
      emitDirectoryWorkspaceRefresh();
      setCompleted('');
      setStuck('');
      setDeliverable('');
    } catch (e) {
      appendZhi(e instanceof Error ? e.message : '汇报失败', '因果汇报');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-[11px] text-gray-300">
      <p className="text-[10px] leading-relaxed text-gray-500">
        ZHI 按「完成 → 卡点 → 明日交付」三项入账，并自动修正今日 P0/P1（不必写长文）。
      </p>
      <select
        className="w-full rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      >
        {SUBJECTS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label className="block space-y-1">
        <span className="text-[9px] uppercase tracking-widest text-[#00FF7F]">1 · 完成了什么</span>
        <textarea
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
          placeholder="例：刷完极限 20 题，对 17 题"
          value={completed}
          onChange={(e) => setCompleted(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[9px] uppercase tracking-widest text-[#FF4500]">2 · 卡在哪</span>
        <textarea
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
          placeholder="例：洛必达与泰勒余项混淆"
          value={stuck}
          onChange={(e) => setStuck(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[9px] uppercase tracking-widest text-gray-400">3 · 明天交付物</span>
        <textarea
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
          placeholder="例：错题本 3 页截图 + 1 段口语录音"
          value={deliverable}
          onChange={(e) => setDeliverable(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={busy || (!completed.trim() && !stuck.trim() && !deliverable.trim())}
        onClick={() => void onSubmit()}
        className="w-full rounded-lg bg-[#FF4500]/20 py-2.5 font-bold text-[#FF4500] disabled:opacity-40"
      >
        {busy ? 'ZHI 裁决中…' : '提交因果汇报'}
      </button>

      <hr className="border-gray-900" />

      <p className="text-[9px] uppercase tracking-widest text-cyan-400">⏱ 学习计时</p>
      {activeSession ? (
        <div className="space-y-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
          <p className="text-[10px] text-cyan-200">正在学习：{activeSession.subject ?? '未指定'}</p>
          <p className="text-[9px] text-gray-500">已用时：{Math.round(activeSession.elapsedSeconds / 60)} 分钟</p>
          <label className="block space-y-1">
            <span className="text-[8px] text-gray-500">结束心情</span>
            <select
              className="w-full rounded border border-gray-900 bg-black/50 px-2 py-1 text-[9px] text-white"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
            >
              <option value="">不记录</option>
              <option value="great">😊 很棒</option>
              <option value="good">🙂 不错</option>
              <option value="ok">😐 一般</option>
              <option value="bad">😞 不好</option>
              <option value="frustrated">😤 挫败</option>
            </select>
          </label>
          <button
            type="button"
            disabled={timerBusy}
            onClick={() => void onEndSession()}
            className="w-full rounded bg-rose-500/20 py-1.5 text-[9px] text-rose-300 disabled:opacity-40"
          >
            {timerBusy ? '结束中…' : '结束学习时段'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={timerBusy}
          onClick={() => void onStartSession()}
          className="w-full rounded-lg border border-cyan-500/30 py-2 text-[9px] text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
        >
          {timerBusy ? '启动中…' : '▶ 开始学习计时'}
        </button>
      )}

      {sessionSummary && (
        <div className="flex flex-wrap gap-2 text-[9px] text-gray-500">
          <span>今日 {Math.round(sessionSummary.todaySeconds / 60)} 分钟</span>
          <span>本周 {Math.round(sessionSummary.weekSeconds / 60)} 分钟</span>
          <span>连续 {sessionSummary.streakDays} 天</span>
        </div>
      )}

      {weeklyReport && (
        <div className="rounded-lg border border-gray-900 bg-black/30 p-2">
          <p className="mb-1 text-[9px] uppercase tracking-widest text-gray-500">本周学习报告</p>
          <p className="text-[9px] text-gray-400">总 {Math.round(weeklyReport.totalSeconds / 60)} 分钟 · 日均 {Math.round(weeklyReport.avgDailySeconds / 60)} 分钟</p>
          <p className="text-[9px] text-gray-400">主要科目：{weeklyReport.topSubject} · 完成率 {Math.round(weeklyReport.completionRate * 100)}%</p>
          <div className="mt-1 space-y-0.5">
            {weeklyReport.weekDays.map((d) => (
              <div key={d.date} className="flex justify-between text-[8px] text-gray-600">
                <span>{d.date.slice(5)}</span>
                <span>{Math.round(d.totalSeconds / 60)} 分钟 · {d.sessions} 次</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
