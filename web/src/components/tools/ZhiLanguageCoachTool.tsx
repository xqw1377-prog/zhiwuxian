import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useZhiChat } from '../../context/ZhiChatContext';
import { uploadVoiceAudio } from '../../lib/chat-upload';
import {
  fetchLanguageMission,
  submitLanguageEval,
  submitLanguageShadow,
  type LanguageEvalDto,
  type LanguageMissionDto,
  type LanguageTutorProgressDto,
} from '../../lib/zhi-language-api';
import { fetchMistakeTrend, type MistakeTrendDto } from '../../lib/zhi-mistake-api';
import { fetchSessionSummary, type SessionSummaryDto } from '../../lib/zhi-timer-api';
import { ZhiProgressBar } from '../progress/ZhiProgressBar';
import { ZhiLanguageSparkline } from '../progress/ZhiLanguageSparkline';
import { emitDirectoryWorkspaceRefresh } from '../../lib/directory-workspace-api';

type Stage = 'mission' | 'prep' | 'recording' | 'result' | 'shadow';

export function ZhiLanguageCoachTool({ userId }: { userId: string }) {
  const { appendZhi } = useZhiChat();
  const [mission, setMission] = useState<LanguageMissionDto | null>(null);
  const [progress, setProgress] = useState<LanguageTutorProgressDto | null>(null);
  const [stage, setStage] = useState<Stage>('mission');
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(45);
  const [prepLeft, setPrepLeft] = useState(15);
  const [transcript, setTranscript] = useState('');
  const [writing, setWriting] = useState('');
  const [intakeType, setIntakeType] = useState<'SPEAKING' | 'WRITING'>('SPEAKING');
  const [evalResult, setEvalResult] = useState<LanguageEvalDto | null>(null);
  const timerRef = useRef<number | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);

  const loadMission = useCallback(async () => {
    const pack = await fetchLanguageMission(userId);
    if (pack?.mission) {
      setMission(pack.mission);
      setIntakeType(pack.mission.intakeType);
    }
  }, [userId]);

  useEffect(() => {
    void loadMission();
  }, [loadMission]);

  const [mistakeTrend, setMistakeTrend] = useState<MistakeTrendDto | null>(null);
  const [sessionSummaryData, setSessionSummaryData] = useState<SessionSummaryDto | null>(null);
  const [showTrend, setShowTrend] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [trend, summary] = await Promise.all([
          fetchMistakeTrend(userId),
          fetchSessionSummary(userId),
        ]);
        setMistakeTrend(trend);
        setSessionSummaryData(summary);
      } catch { /* silently fail */ }
    })();
  }, [userId]);

  const stopRec = () => {
    recRef.current?.stop();
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startPrep = () => {
    if (!mission) return;
    setPrepLeft(mission.prepSeconds ?? 15);
    setStage('prep');
    const t = window.setInterval(() => {
      setPrepLeft((s) => {
        if (s <= 1) {
          window.clearInterval(t);
          startSpeaking();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const startSpeaking = () => {
    if (!mission) return;
    setTranscript('');
    setSecondsLeft(mission.speakSeconds ?? 45);
    setStage('recording');
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (SpeechRecognitionCtor) {
      const rec = new SpeechRecognitionCtor();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (ev) => {
        let t = '';
        for (let i = 0; i < ev.results.length; i += 1) t += ev.results[i][0]?.transcript ?? '';
        setTranscript(t.trim());
      };
      rec.start();
      recRef.current = rec;
    }
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          stopRec();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const finishAndEval = async (content: string) => {
    if (!mission || !content.trim()) return;
    setBusy(true);
    try {
      const taskPrompt =
        intakeType === 'WRITING' ? mission.writingTaskPrompt : mission.taskPrompt;
      const result = await submitLanguageEval(userId, {
        type: intakeType,
        examTrack: mission.examTrack,
        taskPrompt,
        userContent: content.trim(),
      });
      if (!result.success) {
        appendZhi(result.msg ?? '清算失败', '语言陪练');
        setStage('mission');
        return;
      }
      setEvalResult(result);
      setStage('result');
      appendZhi(result.zhiReckoning, '语言陪练');
      emitDirectoryWorkspaceRefresh();
      void loadMission();
    } catch (e) {
      appendZhi(e instanceof Error ? e.message : '语言陪练失败', '语言陪练');
    } finally {
      setBusy(false);
    }
  };

  const onUploadAudio = async (file: File) => {
    setBusy(true);
    try {
      const v = await uploadVoiceAudio(userId, file);
      const text = [v.rawSpeechText, v.weaverResponse].filter(Boolean).join(' ');
      setTranscript(text);
      await finishAndEval(text);
    } catch (e) {
      appendZhi(e instanceof Error ? e.message : '语音转写失败', '语言陪练');
    } finally {
      setBusy(false);
    }
  };

  const onShadow = async () => {
    if (!evalResult?.zhiChallenge) return;
    const attempt = (writing || transcript).trim();
    if (!attempt) return;
    setBusy(true);
    try {
      const d = await submitLanguageShadow(userId, {
        type: intakeType,
        attempt,
        zhiChallenge: evalResult.zhiChallenge,
      });
      appendZhi(d.zhiReckoning, '语言陪练 · 影子关');
      if (d.passed) {
        setStage('mission');
        setEvalResult(null);
        emitDirectoryWorkspaceRefresh();
        void loadMission();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!mission) {
    return <p className="text-[10px] text-gray-500">加载语言战役中…</p>;
  }

  const progressPct = mission.targetToefl
    ? Math.min(100, Math.round((mission.currentToefl / mission.targetToefl) * 100))
    : 0;

  return (
    <motion.div className="space-y-3 text-[11px] text-gray-300">
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
        <p className="text-[10px] leading-relaxed text-amber-100/90">{mission.tutorIntro}</p>
        <p className="mt-2 text-[9px] text-gray-500">
          {mission.levelBand} 档 · 口语估分 {mission.speakingEst}/30 · 今日攻 {mission.focusSkill}
          {progress?.streakDays ? ` · 连续 ${progress.streakDays} 天` : ''}
        </p>
      </div>
      <div className="rounded-xl border border-[#00FF7F]/20 bg-[#00FF7F]/5 p-3">
        <p className="mb-1 font-bold text-[#00FF7F]">{mission.headline}</p>
        <p className="mb-2 text-[10px] text-gray-400">{mission.zhiBrief}</p>
        <p className="mb-2 text-[9px] text-gray-500">{mission.sessionGoal}</p>
        <ZhiProgressBar
          label="托福对标梦校"
          currentPct={progressPct}
          targetPct={100}
          displayCurrent={String(mission.currentToefl || '—')}
          displayTarget={String(mission.targetToefl)}
          unit=""
          compact
        />
        {progress?.curve7d && (
          <div className="mt-3 border-t border-gray-900 pt-2">
            <p className="mb-1 text-[9px] text-gray-500">7 日口语曲线</p>
            <ZhiLanguageSparkline points={progress.curve7d} compact />
            <p className="mt-1 text-[8px] text-gray-600">{progress.todayCoachLine}</p>
          </div>
        )}
      </div>

      {stage === 'mission' && (
        <>
          <p className="rounded-lg border border-gray-900 bg-black/40 px-2 py-2 text-[10px] leading-relaxed text-gray-400">
            📌 {mission.taskPrompt}
          </p>
          <p className="rounded-lg border border-dashed border-gray-800 px-2 py-2 text-[10px] text-gray-500">
            准备：{mission.prepGuide}
          </p>
          <p className="text-[9px] text-gray-600">热身小练：{mission.microDrill}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setIntakeType('SPEAKING');
                startPrep();
              }}
              className="flex-1 rounded-lg bg-[#00FF7F] py-2 font-bold text-black disabled:opacity-50"
            >
              🎙 {mission.prepSeconds}s 准备 + {mission.speakSeconds}s 口语
            </button>
            <button
              type="button"
              onClick={() => setIntakeType('WRITING')}
              className={`rounded-lg border px-3 py-2 ${intakeType === 'WRITING' ? 'border-[#00FF7F] text-[#00FF7F]' : 'border-gray-800 text-gray-500'}`}
            >
              ✍️
            </button>
          </div>
          {intakeType === 'WRITING' && (
            <div className="space-y-2">
              <p className="rounded-lg border border-gray-900 bg-black/40 px-2 py-2 text-[10px] text-gray-400">
                ✍️ {mission.writingTaskPrompt}
              </p>
              <p className="text-[9px] text-gray-600">{mission.writingPrepGuide}</p>
              <textarea
                value={writing}
                onChange={(e) => setWriting(e.target.value)}
                rows={4}
                placeholder="在此输入作文…"
                className="w-full rounded-lg border border-gray-900 bg-black/50 p-2 text-white"
              />
              <button
                type="button"
                disabled={busy || !writing.trim()}
                onClick={() => void finishAndEval(writing)}
                className="w-full rounded-lg bg-[#00FF7F]/20 py-2 text-[#00FF7F] disabled:opacity-40"
              >
                提交写作并入账
              </button>
            </div>
          )}
          <label className="block">
            <span className="text-[9px] text-gray-600">或上传口语录音（STT 更稳）</span>
            <input
              type="file"
              accept="audio/*"
              className="mt-1 w-full text-[9px]"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUploadAudio(f);
                e.target.value = '';
              }}
            />
          </label>
        </>
      )}

      {stage === 'prep' && (
        <motion.div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center">
          <p className="text-2xl font-black text-amber-400">{prepLeft}s</p>
          <p className="text-[10px] text-gray-400">{mission.prepGuide}</p>
          <button
            type="button"
            onClick={() => startSpeaking()}
            className="w-full rounded-lg border border-amber-500/40 py-2 text-amber-200"
          >
            准备好了，开始录音
          </button>
        </motion.div>
      )}

      {stage === 'recording' && (
        <div className="space-y-2 rounded-xl border border-[#FF4500]/30 p-3">
          <p className="text-[#FF4500]">录音中 · {secondsLeft}s</p>
          <p className="max-h-24 overflow-y-auto text-[10px] text-gray-500">{transcript || '识别中…'}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              stopRec();
              void finishAndEval(transcript || writing);
            }}
            className="w-full rounded-lg border border-gray-700 py-2 text-gray-300"
          >
            结束并请陪练点评
          </button>
        </div>
      )}

      {stage === 'result' && evalResult && (
        <div className="space-y-2 rounded-xl border border-gray-800 p-3">
          <p className="font-bold text-[#FF4500]">{evalResult.estimatedScore}</p>
          {evalResult.scoreNumeric != null && (
            <p className="text-[10px] text-[#00FF7F]">
              档案口语约 {evalResult.speakingEst ?? evalResult.scoreNumeric}/30
              {evalResult.levelBand ? ` · ${evalResult.levelBand} 档` : ''}
              {evalResult.streakDays ? ` · 连续练 ${evalResult.streakDays} 天` : ''}
            </p>
          )}
          {evalResult.whatWorked?.length ? (
            <div className="rounded-lg bg-[#00FF7F]/5 p-2 text-[10px] text-[#00FF7F]">
              <p className="font-bold">做对了</p>
              {evalResult.whatWorked.map((w) => (
                <p key={w}>✓ {w}</p>
              ))}
            </div>
          ) : null}
          {evalResult.priorityFix ? (
            <p className="text-[10px] text-amber-200">今天只改这一点：{evalResult.priorityFix}</p>
          ) : null}
          {evalResult.microDrill ? (
            <p className="rounded border border-dashed border-gray-800 p-2 text-[10px] text-gray-400">
              2 分钟小练：{evalResult.microDrill}
            </p>
          ) : null}
          {evalResult.fatalFlaws.length > 0 && (
            <ul className="space-y-1 text-[10px] text-gray-500">
              {evalResult.fatalFlaws.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-gray-300">影子挑战：{evalResult.zhiChallenge}</p>
          <textarea
            value={writing || transcript}
            onChange={(e) => {
              setWriting(e.target.value);
              setTranscript(e.target.value);
            }}
            rows={3}
            className="w-full rounded border border-gray-900 bg-black/50 p-2 text-white"
            placeholder="按挑战句重录/重写…"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onShadow()}
            className="w-full rounded-lg bg-[#00FF7F] py-2 font-black text-black"
          >
            影子关验证
          </button>
        </div>
      )}

      <hr className="border-gray-900" />
      <button
        type="button"
        onClick={() => setShowTrend((v) => !v)}
        className="w-full text-left text-[9px] uppercase tracking-widest text-gray-500 hover:text-gray-300"
      >
        {showTrend ? '▼' : '▶'} 学习趋势 & 错题统计
      </button>
      {showTrend && (
        <div className="space-y-2">
          {sessionSummaryData && (
            <div className="rounded-lg border border-gray-900 bg-black/30 p-2">
              <p className="text-[9px] uppercase tracking-widest text-cyan-400 mb-1">学习数据</p>
              <div className="flex flex-wrap gap-2 text-[9px] text-gray-400">
                <span>今日 {Math.round(sessionSummaryData.todaySeconds / 60)} 分钟</span>
                <span>本周 {Math.round(sessionSummaryData.weekSeconds / 60)} 分钟</span>
                <span>本月 {Math.round(sessionSummaryData.monthSeconds / 60)} 分钟</span>
                <span>连续 {sessionSummaryData.streakDays} 天</span>
                <span>精力 {sessionSummaryData.avgEnergy}</span>
              </div>
            </div>
          )}
          {mistakeTrend && mistakeTrend.length > 0 && (
            <div className="rounded-lg border border-gray-900 bg-black/30 p-2">
              <p className="text-[9px] uppercase tracking-widest text-rose-400 mb-1">错题趋势（最近7天）</p>
              <div className="flex items-end gap-1 h-16">
                {mistakeTrend.map((d) => {
                  const max = Math.max(...mistakeTrend.map((t) => t.newCount + t.reviewedCount), 1);
                  const totalH = Math.round(((d.newCount + d.reviewedCount) / max) * 50);
                  return (
                    <div key={d.date} className="flex flex-col items-center flex-1">
                      <div className="flex gap-0.5 w-full justify-center">
                        <div className="w-1.5 bg-rose-500/60 rounded-t" style={{ height: `${Math.max((d.newCount / max) * 50, 1)}px` }} />
                        <div className="w-1.5 bg-[#00FF7F]/60 rounded-t" style={{ height: `${Math.max((d.reviewedCount / max) * 50, 1)}px` }} />
                      </div>
                      <span className="text-[6px] text-gray-600 mt-0.5">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-1 text-[8px] text-gray-600">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded bg-rose-500/60" />新增</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded bg-[#00FF7F]/60" />复习</span>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
