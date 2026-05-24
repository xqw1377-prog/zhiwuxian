import { authFetch } from '../lib/api-auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type LanguageStage = 'PROMPT' | 'RECORDING' | 'RECKONING' | 'SHADOW_SPARRING';
type IntakeType = 'SPEAKING' | 'WRITING';
type ExamTrack = 'TOEFL' | 'IELTS';

const DEFAULT_PROMPT =
  'Should universities spend more money on sports facilities or academic libraries?';

function unwrap<T>(json: unknown): T {
  const j = json as { data?: T };
  return (j?.data ?? json) as T;
}

export function ZhiLanguageBox({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const [warpPoints, setWarpPoints] = useState(0);
  const [challengeIndex, setChallengeIndex] = useState(92);
  const [currentStage, setCurrentStage] = useState<LanguageStage>('PROMPT');
  const [intakeType, setIntakeType] = useState<IntakeType>('SPEAKING');
  const [examTrack, setExamTrack] = useState<ExamTrack>('TOEFL');
  const [taskPrompt, setTaskPrompt] = useState(DEFAULT_PROMPT);
  const [transcript, setTranscript] = useState('');
  const [writingDraft, setWritingDraft] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(45);
  const [score, setScore] = useState('');
  const [ieltsEq, setIeltsEq] = useState('');
  const [flaws, setFlaws] = useState<string[]>([]);
  const [challengePrompt, setChallengePrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [mentorWords, setMentorWords] = useState(
    '曦宝，托福独立口语最忌讳假装流利、疯狂嗯啊。今晚：30 秒准备，45 秒极限爆发。按下 [语音录制雷达]，亮出你的底牌。',
  );

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<number | null>(null);

  const refreshWarp = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v3.5/billing/status/${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (res.ok) {
        const d = unwrap<{ availableWarpPoints: number; challengeIndex: number | null }>(json);
        setWarpPoints(d.availableWarpPoints ?? 0);
        if (d.challengeIndex != null) setChallengeIndex(d.challengeIndex);
      }
    } catch {
      /* offline */
    }
  }, [userId]);

  useEffect(() => {
    void refreshWarp();
  }, [refreshWarp]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runLanguageEval = useCallback(
    async (content: string) => {
      setBusy(true);
      try {
        const res = await authFetch('/api/v3.5/zhi/language-eval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: intakeType,
            examTrack,
            taskPrompt,
            userContent: content,
          }),
        });
        const json = await res.json();
        const d = unwrap<{
          success: boolean;
          msg?: string;
          estimatedScore: string;
          ieltsEquivalent: string;
          fatalFlaws: string[];
          zhiChallenge: string;
          zhiReckoning: string;
          warpPointsRemaining: number;
          challengeIndex: number;
        }>(json);
        if (!res.ok || !d.success) {
          setMentorWords(d.msg ?? '语言矩阵清算失败');
          setCurrentStage('PROMPT');
          return;
        }
        setScore(d.estimatedScore);
        setIeltsEq(d.ieltsEquivalent);
        setFlaws(d.fatalFlaws);
        setChallengePrompt(d.zhiChallenge);
        setMentorWords(d.zhiReckoning);
        setWarpPoints(d.warpPointsRemaining);
        setChallengeIndex(d.challengeIndex);
        setCurrentStage('RECKONING');
        window.dispatchEvent(new CustomEvent('wuxian:destiny-collapse'));
      } catch (err) {
        setMentorWords(err instanceof Error ? err.message : '清算管线中断');
        setCurrentStage('PROMPT');
      } finally {
        setBusy(false);
      }
    },
    [examTrack, intakeType, taskPrompt, userId],
  );

  const startRecording = () => {
    setTranscript('');
    setSecondsLeft(45);
    setCurrentStage('RECORDING');
    setMentorWords(
      '曦宝，计时器开始倒水。45 秒，强行输出因果逻辑，别看模板！ZHI 正在对发音与语速进行多模态切片…',
    );

    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;

    if (SpeechRecognitionCtor) {
      const rec = new SpeechRecognitionCtor();
      rec.lang = examTrack === 'IELTS' ? 'en-GB' : 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (ev) => {
        let text = '';
        for (let i = 0; i < ev.results.length; i += 1) {
          text += ev.results[i][0]?.transcript ?? '';
        }
        setTranscript(text.trim());
      };
      rec.onerror = () => {
        /* 降级到手动输入 */
      };
      rec.start();
      recognitionRef.current = rec;
    }

    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          stopRecording();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const finishRecording = () => {
    stopRecording();
    const content =
      intakeType === 'WRITING'
        ? writingDraft.trim()
        : transcript.trim() || writingDraft.trim();
    if (!content) {
      setMentorWords('曦宝，空麦不算撞击。重录，或切换到写作模式粘贴作文。');
      setCurrentStage('PROMPT');
      return;
    }
    void runLanguageEval(content);
  };

  const submitWriting = () => {
    if (!writingDraft.trim()) return;
    setIntakeType('WRITING');
    void runLanguageEval(writingDraft.trim());
  };

  const verifyShadow = async () => {
    const attempt =
      intakeType === 'WRITING' ? writingDraft.trim() : transcript.trim() || writingDraft.trim();
    if (!attempt || !challengePrompt) return;
    setBusy(true);
    try {
      const res = await authFetch('/api/v3.5/zhi/language-shadow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: intakeType,
          attempt,
          zhiChallenge: challengePrompt,
        }),
      });
      const json = await res.json();
      const d = unwrap<{
        passed: boolean;
        zhiReckoning: string;
        warpPointsRemaining: number;
        challengeIndex: number;
      }>(json);
      if (!res.ok) throw new Error('影子验证失败');
      setMentorWords(d.zhiReckoning);
      setWarpPoints(d.warpPointsRemaining);
      setChallengeIndex(d.challengeIndex);
      if (d.passed) {
        setCurrentStage('PROMPT');
        setTranscript('');
        setWritingDraft('');
        setFlaws([]);
        window.dispatchEvent(new CustomEvent('wuxian:destiny-collapse'));
      }
      void refreshWarp();
    } catch (err) {
      setMentorWords(err instanceof Error ? err.message : '影子关卡未通过');
    } finally {
      setBusy(false);
    }
  };

  const progressPct = ((45 - secondsLeft) / 45) * 100;

  return (
    <div className="mx-auto w-full max-w-2xl select-none p-4 font-mono text-left">
      <div className="space-y-4 rounded-2xl border-2 border-[#00FF7F]/40 bg-[#0A0B0E] p-6 shadow-[0_0_40px_rgba(0,255,127,0.06)]">
        <div className="flex items-center justify-between border-b border-gray-950 pb-3 text-[10px]">
          <motion.div className="flex items-center space-x-2 text-[#00FF7F]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00FF7F]" />
            <span className="font-black tracking-widest">{compact ? "语言陪练" : "ZHI // LANGUAGE INTRUSION MATRIX"}</span>
          </motion.div>
          <div className="flex items-center gap-2">
            <select
              value={examTrack}
              onChange={(e) => setExamTrack(e.target.value as ExamTrack)}
              className="rounded border border-gray-900 bg-[#11131A] px-2 py-0.5 text-[9px] text-gray-400"
            >
              <option value="TOEFL">TOEFL</option>
              <option value="IELTS">IELTS</option>
            </select>
            {!compact && (
              <span className="rounded border border-gray-900 bg-[#11131A] px-2 py-0.5 text-[9px] text-gray-400">
                {warpPoints} Warp
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-950 bg-[#11131A] p-4">
          <span className="mb-2 block text-[8px] font-black tracking-widest text-[#FF4500]">
            // ZHI 的物理审判
          </span>
          <p className="font-sans text-xs italic leading-relaxed text-gray-200">&ldquo;{mentorWords}&rdquo;</p>
        </div>

        <AnimatePresence mode="wait">
          {currentStage === 'PROMPT' && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3 rounded-xl border border-gray-900 bg-gray-950 py-4 text-center"
            >
              <p className="mb-2 px-4 font-sans text-xs text-gray-400">📌 {taskPrompt}</p>
              <div className="flex justify-center gap-2 px-4">
                <button
                  type="button"
                  onClick={() => {
                    setIntakeType('SPEAKING');
                    startRecording();
                  }}
                  disabled={busy}
                  className="rounded-xl bg-[#00FF7F] px-6 py-2 text-xs font-black text-black transition-all hover:bg-[#00E06F]"
                >
                  🎙️ 开启 45 秒极限录音拦截
                </button>
                <button
                  type="button"
                  onClick={() => setIntakeType('WRITING')}
                  className={`rounded-xl border px-4 py-2 text-[10px] transition-all ${
                    intakeType === 'WRITING'
                      ? 'border-[#00FF7F] text-[#00FF7F]'
                      : 'border-gray-800 text-gray-500'
                  }`}
                >
                  ✍️ 写作模式
                </button>
              </div>
              {intakeType === 'WRITING' && (
                <div className="space-y-2 px-4 text-left">
                  <textarea
                    value={writingDraft}
                    onChange={(e) => setWritingDraft(e.target.value)}
                    placeholder="粘贴或输入托福/雅思作文…"
                    className="min-h-[100px] w-full rounded-lg border border-gray-900 bg-black p-3 font-sans text-xs text-white outline-none focus:border-[#00FF7F]"
                  />
                  <button
                    type="button"
                    disabled={busy || !writingDraft.trim()}
                    onClick={() => void submitWriting()}
                    className="w-full rounded-lg bg-[#00FF7F] py-2 text-xs font-black text-black disabled:opacity-50"
                  >
                    提交作文，ZHI 物理清算（8 Warp）➔
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {currentStage === 'RECORDING' && (
            <motion.div
              key="rec"
              initial={{ scale: 0.98 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center space-y-3 rounded-xl border border-[#FF4500]/30 bg-gray-950 p-4"
            >
              <div className="flex items-center space-x-3">
                <span className="h-2 w-2 animate-ping rounded-full bg-[#FF4500]" />
                <span className="animate-pulse text-xs font-bold text-[#FF4500]">
                  AUDIO SNIFFING // {secondsLeft}s 剩余
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-gray-900">
                <div
                  className="h-full bg-[#FF4500] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {transcript ? (
                <p className="max-h-20 w-full overflow-y-auto font-sans text-[10px] text-gray-500">
                  {transcript}
                </p>
              ) : (
                <input
                  type="text"
                  value={writingDraft}
                  onChange={(e) => setWritingDraft(e.target.value)}
                  placeholder="无麦克风识别时，在此键入口述转写…"
                  className="w-full rounded border border-gray-900 bg-black px-3 py-2 text-xs text-white"
                />
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void finishRecording()}
                className="rounded border border-gray-800 bg-gray-900 px-4 py-1 text-xs text-gray-400 transition-all hover:text-white"
              >
                完成录音，让 ZHI 物理清算（8 Warp）➔
              </button>
            </motion.div>
          )}

          {currentStage === 'RECKONING' && (
            <motion.div
              key="reckon"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 rounded-xl border border-gray-900 bg-gray-950 p-4"
            >
              <div className="flex items-center justify-between border-b border-gray-900 pb-2">
                <span className="text-xs font-black text-[#FF4500]">{score}</span>
                <span className="text-[9px] text-gray-600">雅思等值: {ieltsEq}</span>
              </div>
              <ul className="space-y-2">
                {flaws.map((flaw) => (
                  <li key={flaw} className="font-sans text-[11px] leading-relaxed text-gray-400">
                    {flaw}
                  </li>
                ))}
              </ul>
              <div className="space-y-2 rounded-lg border border-gray-900 bg-[#11131A] p-3">
                <span className="block text-[9px] uppercase text-[#00FF7F]">➔ ZHI 影子关卡拦截：</span>
                <p className="font-sans text-[11px] italic text-gray-300">&ldquo;{challengePrompt}&rdquo;</p>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStage('SHADOW_SPARRING');
                    setTranscript('');
                    setWritingDraft('');
                    setMentorWords('影子肉搏战已挂载。重录或重写挑战句，撞穿才能解锁。');
                  }}
                  className="w-full rounded-lg bg-[#00FF7F] py-2 text-center text-xs font-black tracking-widest text-black transition-all hover:bg-[#00E06F]"
                >
                  迎头撞击，进入影子重录 ➔
                </button>
              </div>
            </motion.div>
          )}

          {currentStage === 'SHADOW_SPARRING' && (
            <motion.div
              key="shadow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3 rounded-xl border border-[#00FF7F]/30 bg-[#00FF7F]/5 p-4"
            >
              <p className="font-sans text-[11px] text-gray-300">&ldquo;{challengePrompt}&rdquo;</p>
              <textarea
                value={writingDraft || transcript}
                onChange={(e) => {
                  setWritingDraft(e.target.value);
                  setTranscript(e.target.value);
                }}
                placeholder="重录转写或重写影子挑战句…"
                className="min-h-[80px] w-full rounded-lg border border-gray-900 bg-gray-950 p-3 font-sans text-xs text-white outline-none focus:border-[#00FF7F]"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIntakeType('SPEAKING');
                    startRecording();
                  }}
                  className="rounded-lg border border-gray-800 px-3 py-2 text-[10px] text-gray-400 hover:text-white"
                >
                  🎙️ 重录
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void verifyShadow()}
                  className="flex-1 rounded-lg bg-[#00FF7F] py-2 text-xs font-black text-black hover:bg-[#00E06F] disabled:opacity-50"
                >
                  影子句肉搏验证（2 Warp）➔
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 flex items-center justify-between border-t border-gray-950 pt-3 text-[10px] text-gray-500">
          <span>
            当前科目:{' '}
            <span className="font-bold text-white">
              {examTrack} {intakeType === 'SPEAKING' ? '口语' : '写作'}战役
            </span>
          </span>
          <div className="flex items-center space-x-3">
            <span>
              战役阶段: <span className="font-bold text-[#00FF7F]">T2 独立突破</span>
            </span>
            <span>
              命运阻力: <span className="font-bold text-[#FF4500]">{challengeIndex}%</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
