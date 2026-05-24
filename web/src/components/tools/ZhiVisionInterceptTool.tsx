import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useZhiChat } from '../../context/ZhiChatContext';
import { useZhiDirectory } from '../../context/ZhiDirectoryContext';
import { syncChatTurnToCloud } from '../../lib/sync-chat-to-cloud';
import {
  analyzeVisionImage,
  confirmVisionIntake,
  resolveTextbook,
  solveVisionProblem,
  type TextbookResolveDto,
  type VisionIntakeDto,
  type VisionSolveDto,
} from '../../lib/zhi-vision-api';
import {
  emitDirectoryWorkspaceRefresh,
  emitWuxianEventUntyped,
  onWuxianEventUntyped,
  WUXIAN_EVENTS,
} from '../../lib/wuxian-events';
import { recordMistake } from '../../lib/zhi-mistake-api';
import {
  teachChapter,
  completeChapterCheckpoint,
  fetchTextbookProgress,
  teachKnowledgePoint,
  submitLessonCheckpoint,
  type ChapterLessonDto,
  type LessonDto,
  type TextbookProgressDto,
} from '../../lib/zhi-tutor-api';

type Tab = 'photo' | 'textbook' | 'solve';

const SUBJECTS = ['数学', '物理', '化学', '英语', '语文', '计算机', '综合'];

export function ZhiVisionInterceptTool({ userId }: { userId: string }) {
  const { appendZhi, toolLaunch, consumeToolLaunch } = useZhiChat();
  const { activeId, activeDirectory } = useZhiDirectory();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('photo');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const vTab = toolLaunch?.visionTab;
    if (!vTab) return;
    setTab(vTab);
    consumeToolLaunch();
  }, [toolLaunch?.visionTab, consumeToolLaunch]);
  const [hint, setHint] = useState('');

  const [vision, setVision] = useState<VisionIntakeDto | null>(null);
  const [textbook, setTextbook] = useState<TextbookResolveDto | null>(null);

  const [title, setTitle] = useState('');
  const [publisher, setPublisher] = useState('');
  const [savingMistakes, setSavingMistakes] = useState(false);
  const [savedMistakes, setSavedMistakes] = useState(0);
  const [chapterLesson, setChapterLesson] = useState<ChapterLessonDto | null>(null);
  const [textbookProgress, setTextbookProgress] = useState<TextbookProgressDto | null>(null);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [checkAnswer, setCheckAnswer] = useState('');
  const [checkResult, setCheckResult] = useState<'correct' | 'wrong' | null>(null);
  const [solveResult, setSolveResult] = useState<VisionSolveDto | null>(null);
  const [solveLesson, setSolveLesson] = useState<LessonDto | null>(null);
  const [solveCheckAnswer, setSolveCheckAnswer] = useState('');
  const [solveCheckResult, setSolveCheckResult] = useState<'correct' | 'wrong' | null>(null);

  const [subject, setSubject] = useState('数学');
  const [progressChapter, setProgressChapter] = useState('');
  const [progressNote, setProgressNote] = useState('');

  useEffect(() => {
    return onWuxianEventUntyped(WUXIAN_EVENTS.visionIntakePreview, (detail) => {
      const d = detail as VisionIntakeDto | undefined;
      if (d?.subject) {
        setVision(d);
        setTextbook(null);
        setTab('photo');
      }
    });
  }, []);

  const onPickFile = () => fileRef.current?.click();

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setVision(null);
      setTextbook(null);
      try {
        const result = await analyzeVisionImage(userId, file, hint.trim() || undefined);
        setVision(result);
        setTab('photo');
      } catch (e) {
        appendZhi(e instanceof Error ? e.message : '拍图解析失败', '摄影拦截');
      } finally {
        setBusy(false);
      }
    },
    [appendZhi, hint, userId],
  );

  const onSolveFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setSolveResult(null);
      setSolveLesson(null);
      setSolveCheckAnswer('');
      setSolveCheckResult(null);
      try {
        const result = await solveVisionProblem(userId, file, hint.trim() || undefined);
        setSolveResult(result);
        setTab('solve');
      } catch (e) {
        appendZhi(e instanceof Error ? e.message : '解题失败', '拍照解题');
      } finally {
        setBusy(false);
      }
    },
    [appendZhi, hint, userId],
  );

  const onResolveTextbook = async () => {
    setBusy(true);
    setVision(null);
    try {
      const ch = progressChapter.trim() ? Number(progressChapter) : undefined;
      const result = await resolveTextbook(userId, {
        title,
        publisher,
        subject,
        progressChapter: Number.isFinite(ch) ? ch : undefined,
        progressNote: progressNote.trim() || undefined,
      });
      setTextbook(result);
      emitWuxianEventUntyped(WUXIAN_EVENTS.textbookUpdated);
      emitDirectoryWorkspaceRefresh();
    } catch (e) {
      appendZhi(e instanceof Error ? e.message : '教材解析失败', '摄影拦截');
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    setBusy(true);
    try {
      const payload = vision
        ? {
            baselineScores: vision.baselineScores,
            weakSubjects: vision.weakPoints,
            challenge: vision.challenge,
          }
        : textbook
          ? {
              baselineScores: { [textbook.baselineKey]: textbook.baselineValue },
              weakSubjects: textbook.upcomingKnowledge.slice(0, 4),
              challenge: textbook.gapNote,
              textbookCatalogId: textbook.catalogId,
            }
          : null;
      if (!payload) return;

      const applied = await confirmVisionIntake(userId, payload);
      const msg = vision?.chatText ?? textbook?.chatText ?? '建档已确认';
      appendZhi(msg, '摄影拦截 · 已建档');
      if (vision) {
        const summary = [vision.subject, vision.scoreOrProgress, vision.challenge].filter(Boolean).join(' · ');
        void syncChatTurnToCloud({
          userId,
          cognitiveDirId: activeId,
          focusTitle: activeDirectory?.title ?? null,
          userText: summary,
          attachSummary: vision.summary,
          fileNames: ['vision-intake'],
        });
      }
      if (applied.review) {
        emitWuxianEventUntyped(WUXIAN_EVENTS.dailyReview, applied.review);
      }
      emitWuxianEventUntyped(WUXIAN_EVENTS.textbookUpdated);
      emitDirectoryWorkspaceRefresh(applied.directoryId ?? undefined);
      setVision(null);
      setTextbook(null);
    } catch (e) {
      appendZhi(e instanceof Error ? e.message : '确认建档失败', '摄影拦截');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-[11px] text-gray-300">
      <div className="flex gap-1 rounded-lg border border-gray-900 bg-black/40 p-0.5">
        <button
          type="button"
          onClick={() => setTab('photo')}
          className={`flex-1 rounded-md px-2 py-1.5 ${tab === 'photo' ? 'bg-[#00FF7F]/15 text-[#00FF7F]' : 'text-gray-500'}`}
        >
          拍图建档
        </button>
        <button
          type="button"
          onClick={() => setTab('textbook')}
          className={`flex-1 rounded-md px-2 py-1.5 ${tab === 'textbook' ? 'bg-[#00FF7F]/15 text-[#00FF7F]' : 'text-gray-500'}`}
        >
          教材指认
        </button>
        <button
          type="button"
          onClick={() => setTab('solve')}
          className={`flex-1 rounded-md px-2 py-1.5 ${tab === 'solve' ? 'bg-amber-500/15 text-amber-300' : 'text-gray-500'}`}
        >
          拍照解题
        </button>
      </div>

      {tab === 'photo' && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500">
            试卷 / 成绩单 / 教材某一页：拍清分数与错题即可，不必全书扫描。
          </p>
          <input
            className="w-full rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
            placeholder="可选：说明科目或卡点"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={onPickFile}
            className="w-full rounded-lg border border-dashed border-[#00FF7F]/40 py-3 text-[#00FF7F] hover:bg-[#00FF7F]/5 disabled:opacity-50"
          >
            {busy ? '解析中…' : '📷 选择或拍摄图片'}
          </button>
        </div>
      )}

      {tab === 'textbook' && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500">
            只需书名 + 出版社（可选：学到第几章）。ZHI 自动展开目录与知识点，无需逐页拍照。
          </p>
          <input
            className="w-full rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
            placeholder="书名，如：高中数学必修一"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
            placeholder="出版社，如：人民教育出版社"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
          />
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              className="w-24 rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
              placeholder="学到第几章"
              inputMode="numeric"
              value={progressChapter}
              onChange={(e) => setProgressChapter(e.target.value)}
            />
          </div>
          <input
            className="w-full rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
            placeholder="可选：册别/版本说明"
            value={progressNote}
            onChange={(e) => setProgressNote(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !title.trim() || !publisher.trim()}
            onClick={() => void onResolveTextbook()}
            className="w-full rounded-lg bg-[#00FF7F]/20 py-2 font-bold text-[#00FF7F] disabled:opacity-40"
          >
            {busy ? '展开目录中…' : '解析目录与知识点'}
          </button>
        </div>
      )}

      {tab === 'solve' && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500">
            拍下数学/物理/化学/英语等题目，ZHI 自动读题并给出分步解答与知识点讲解。
          </p>
          <input
            className="w-full rounded-lg border border-gray-900 bg-black/50 px-2 py-1.5 text-white"
            placeholder="可选：提示科目或补充题目说明"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onSolveFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={onPickFile}
            className="w-full rounded-lg border border-dashed border-amber-500/40 py-3 text-amber-300 hover:bg-amber-500/5 disabled:opacity-50"
          >
            {busy ? '读题解题中…' : '📷 拍照上传题目'}
          </button>
        </div>
      )}

      {vision && (
        <ResultCard title={`拍图 · ${vision.subject}`} onConfirm={() => void onConfirm()} busy={busy}>
          <p>类型：{vision.kind} · {vision.scoreOrProgress}</p>
          {vision.topics.length > 0 && <p>知识点：{vision.topics.join('、')}</p>}
          {vision.weakPoints.length > 0 && <p className="text-red-300/80">薄弱：{vision.weakPoints.join('、')}</p>}
          <p>挑战：{vision.challenge}</p>
          {vision.weakPoints.length > 0 && (
            <div className="mt-2 border-t border-gray-900 pt-2">
              <button
                type="button"
                disabled={savingMistakes}
                onClick={async () => {
                  setSavingMistakes(true);
                  try {
                    let count = 0;
                    for (const wp of vision.weakPoints) {
                      await recordMistake({
                        userId,
                        subject: vision.subject ?? '综合',
                        questionText: wp,
                        mistakeType: 'conceptual',
                        knowledgeNode: wp,
                        source: 'vision-intercept',
                      });
                      count++;
                    }
                    setSavedMistakes((c) => c + count);
                    appendZhi(`📝 已保存 ${count} 条薄弱项到错题本`, '摄影拦截');
                  } catch (e) {
                    appendZhi(e instanceof Error ? e.message : '保存错题失败', '摄影拦截');
                  } finally {
                    setSavingMistakes(false);
                  }
                }}
                className="w-full rounded border border-amber-500/30 py-1.5 text-[9px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
              >
                {savingMistakes ? '保存中…' : savedMistakes > 0 ? `✅ 已保存 ${savedMistakes} 条` : '📝 保存薄弱项到错题本'}
              </button>
            </div>
          )}
        </ResultCard>
      )}

      {textbook && (
        <ResultCard title={`教材 · ${textbook.title}`} onConfirm={() => void onConfirm()} busy={busy}>
          <p>
            {textbook.publisher} · {textbook.subject} · 进度 {textbook.progressChapter}/{textbook.totalChapters}（
            {textbook.progressPct}%）
          </p>
          <p className="text-gray-500">{textbook.gapNote}</p>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[10px] text-gray-400">
            {textbook.chapters.slice(0, 12).map((ch) => (
              <li
                key={ch.index}
                className={ch.index === textbook.progressChapter ? 'text-[#00FF7F]' : ''}
              >
                {ch.index}. {ch.title}
                {ch.knowledgePoints.length > 0 && (
                  <span className="text-gray-600"> — {ch.knowledgePoints.slice(0, 4).join('、')}</span>
                )}
              </li>
            ))}
            {textbook.chapters.length > 12 && (
              <li className="text-gray-600">…共 {textbook.totalChapters} 章</li>
            )}
          </ul>
          <div className="mt-2 border-t border-gray-900 pt-2">
            <button
              type="button"
              className="w-full rounded-lg bg-cyan-500/20 py-2 text-[10px] font-bold text-cyan-200 hover:bg-cyan-500/30"
              onClick={async () => {
                setChapterBusy(true);
                try {
                  const prog = await fetchTextbookProgress(userId, textbook.catalogId);
                  setTextbookProgress(prog);
                } catch { /* silently fail */ } finally { setChapterBusy(false); }
              }}
            >
              {chapterBusy ? '加载中…' : '📖 从教材学'}
            </button>
          </div>
        </ResultCard>
      )}

      {textbookProgress && !chapterLesson && (
        <div className="space-y-2 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3">
          <p className="text-[10px] font-bold text-cyan-200">{textbookProgress.title} · 学习进度</p>
          <div className="space-y-1">
            {textbookProgress.chapters.slice(0, 20).map((ch) => (
              <div key={ch.index} className="flex items-center justify-between gap-2 text-[9px]">
                <span className={ch.checkpointPassed ? 'text-[#00FF7F]' : ch.status === 'in_progress' ? 'text-cyan-200' : 'text-gray-500'}>
                  {ch.index}. {ch.title}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {ch.checkpointPassed && <span className="text-[#00FF7F]">✓</span>}
                  {ch.status === 'in_progress' && <span className="text-cyan-400">学习中</span>}
                  {ch.status === 'pending' && (
                    <button
                      type="button"
                      disabled={chapterBusy}
                      className="text-cyan-400 underline disabled:opacity-40"
                      onClick={async () => {
                        setChapterBusy(true);
                        setChapterLesson(null);
                        try {
                          const lesson = await teachChapter(userId, textbookProgress.catalogId, ch.index);
                          setChapterLesson(lesson);
                          setCheckAnswer('');
                          setCheckResult(null);
                        } catch (e) {
                          appendZhi(e instanceof Error ? e.message : '讲授失败', '摄影拦截');
                        } finally { setChapterBusy(false); }
                      }}
                    >
                      {chapterBusy ? '…' : '学'}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="w-full rounded border border-gray-800 py-1 text-[9px] text-gray-500"
            onClick={() => { setTextbookProgress(null); setChapterLesson(null); }}
          >
            关闭
          </button>
        </div>
      )}

      {chapterLesson && (
        <div className="space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-cyan-200">第{chapterLesson.chapterIndex}章 {chapterLesson.chapterTitle}</p>
            <button
              type="button"
              className="text-[9px] text-gray-500"
              onClick={() => setChapterLesson(null)}
            >
              收起
            </button>
          </div>
          {chapterLesson.knowledgePoints.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {chapterLesson.knowledgePoints.map((kp) => (
                <span key={kp} className="rounded bg-gray-900 px-1.5 py-0.5 text-[8px] text-gray-400">{kp}</span>
              ))}
            </div>
          )}
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            <p className="text-[10px] leading-relaxed text-gray-200 whitespace-pre-wrap">{chapterLesson.teaching}</p>
            {chapterLesson.examples && (
              <div className="rounded bg-amber-500/10 px-2 py-1.5 text-[9px] text-amber-200">
                <span className="font-bold">例题：</span>{chapterLesson.examples}
              </div>
            )}
            {chapterLesson.summary && (
              <div className="rounded bg-[#00FF7F]/10 px-2 py-1.5 text-[9px] text-[#00FF7F]/90">
                <span className="font-bold">总结：</span>{chapterLesson.summary}
              </div>
            )}
          </div>
          {chapterLesson.checkpointQuestion && (
            <div className="border-t border-gray-800 pt-2">
              <p className="text-[9px] text-[#00FF7F] mb-1">验收：{chapterLesson.checkpointQuestion}</p>
              <div className="space-y-1">
                {chapterLesson.checkpointOptions.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-[9px] text-gray-400 cursor-pointer">
                    <input
                      type="radio"
                      name="ch-check"
                      checked={checkAnswer === opt}
                      onChange={() => { setCheckAnswer(opt); setCheckResult(null); }}
                    />
                    {opt}
                  </label>
                ))}
              </div>
              {checkAnswer && !checkResult && (
                <button
                  type="button"
                  className="mt-1 rounded bg-[#00FF7F]/20 px-3 py-1 text-[9px] text-[#00FF7F]"
                  onClick={async () => {
                    const correct = checkAnswer === chapterLesson.checkpointAnswer;
                    setCheckResult(correct ? 'correct' : 'wrong');
                    await completeChapterCheckpoint(userId, chapterLesson.catalogId, chapterLesson.chapterIndex, correct);
                    appendZhi(
                      correct
                        ? `✅ 第${chapterLesson.chapterIndex}章 "${chapterLesson.chapterTitle}" 验收通过`
                        : `❌ 第${chapterLesson.chapterIndex}章 "${chapterLesson.chapterTitle}" 验收未通过，正确答案：${chapterLesson.checkpointAnswer}`,
                      '教材学习',
                    );
                    if (correct && textbookProgress) {
                      const prog = await fetchTextbookProgress(userId, textbookProgress.catalogId);
                      setTextbookProgress(prog);
                    }
                  }}
                >
                  提交答案
                </button>
              )}
              {checkResult && (
                <p className={`mt-1 text-[9px] ${checkResult === 'correct' ? 'text-[#00FF7F]' : 'text-rose-300'}`}>
                  {checkResult === 'correct' ? '✓ 通过！可以进入下一章' : `✗ 未通过，正确答案：${chapterLesson.checkpointAnswer}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {solveResult && !solveLesson && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
          <p className="mb-1 font-bold text-amber-300">📐 {solveResult.subject} · {solveResult.knowledgePoint}</p>
          <div className="space-y-2 text-[10px] leading-relaxed">
            <div className="rounded bg-black/40 px-2 py-1.5">
              <p className="text-[9px] text-gray-400 mb-0.5">题目：</p>
              <p className="text-gray-200 whitespace-pre-wrap">{solveResult.problemText}</p>
            </div>
            <div className="rounded bg-black/40 px-2 py-1.5">
              <p className="text-[9px] text-gray-400 mb-0.5">分步解答：</p>
              <p className="text-gray-200 whitespace-pre-wrap">{solveResult.solution}</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="flex-1 rounded bg-[#00FF7F]/10 px-2 py-1.5">
                <p className="text-[9px] text-[#00FF7F]/70 mb-0.5">答案</p>
                <p className="text-[#00FF7F] whitespace-pre-wrap">{solveResult.answer}</p>
              </div>
              <div className="flex-1 rounded bg-cyan-500/10 px-2 py-1.5">
                <p className="text-[9px] text-cyan-300/70 mb-0.5">难度</p>
                <p className="text-cyan-200">{solveResult.difficulty === 'easy' ? '简单' : solveResult.difficulty === 'hard' ? '困难' : '中等'}</p>
              </div>
            </div>
            <div className="rounded bg-amber-500/10 px-2 py-1.5">
              <p className="text-[9px] text-amber-300/70 mb-0.5">💡 核心概念</p>
              <p className="text-amber-200 whitespace-pre-wrap">{solveResult.explanation}</p>
            </div>
            {solveResult.knowledgePointTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {solveResult.knowledgePointTags.map((t) => (
                  <span key={t} className="rounded bg-gray-800 px-1.5 py-0.5 text-[8px] text-gray-400">{t}</span>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={savingMistakes}
                onClick={async () => {
                  setSavingMistakes(true);
                  try {
                    await recordMistake({
                      userId,
                      subject: solveResult.subject,
                      questionText: solveResult.problemText.slice(0, 500),
                      mistakeType: 'conceptual',
                      knowledgeNode: solveResult.knowledgePoint,
                      source: 'vision-solve',
                    });
                    setSavedMistakes((c) => c + 1);
                    appendZhi(`📝 已保存题目到错题本：${solveResult.knowledgePoint}`, '拍照解题');
                  } catch (e) {
                    appendZhi(e instanceof Error ? e.message : '保存错题失败', '拍照解题');
                  } finally {
                    setSavingMistakes(false);
                  }
                }}
                className="flex-1 rounded border border-amber-500/30 py-1.5 text-[9px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
              >
                {savingMistakes ? '保存中…' : savedMistakes > 0 ? '✅ 已保存' : '📝 保存到错题本'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const lesson = await teachKnowledgePoint({
                      userId,
                      knowledgePoint: solveResult.knowledgePoint,
                      subject: solveResult.subject,
                      context: solveResult.problemText.slice(0, 300),
                      sourceType: 'vision-solve',
                    });
                    setSolveLesson(lesson);
                    setSolveCheckAnswer('');
                    setSolveCheckResult(null);
                  } catch (e) {
                    appendZhi(e instanceof Error ? e.message : '获取讲解失败', '拍照解题');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="flex-1 rounded border border-cyan-500/30 py-1.5 text-[9px] text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
              >
                讲解知识点
              </button>
            </div>
          </div>
          <button
            type="button"
            className="mt-2 w-full rounded border border-gray-800 py-1 text-[9px] text-gray-500"
            onClick={() => { setSolveResult(null); setSolveLesson(null); }}
          >
            关闭
          </button>
        </div>
      )}

      {solveLesson && (
        <div className="space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-cyan-200">{solveLesson.knowledgePoint}</p>
            <button
              type="button"
              className="text-[9px] text-gray-500"
              onClick={() => { setSolveLesson(null); setSolveResult(null); }}
            >
              收起
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            <div className="rounded bg-gray-900/60 px-2 py-1.5">
              <p className="text-[9px] text-gray-400 mb-0.5">前置检查</p>
              <p className="text-[10px] text-gray-200 whitespace-pre-wrap">{solveLesson.prerequisiteCheck}</p>
            </div>
            <div className="rounded bg-gray-900/60 px-2 py-1.5">
              <p className="text-[9px] text-gray-400 mb-0.5">核心讲解</p>
              <p className="text-[10px] text-gray-200 whitespace-pre-wrap">{solveLesson.coreTeaching}</p>
            </div>
            <div className="rounded bg-amber-500/10 px-2 py-1.5">
              <p className="text-[9px] text-amber-300/70 mb-0.5">类比</p>
              <p className="text-[9px] text-amber-200 whitespace-pre-wrap">{solveLesson.analogy}</p>
            </div>
            <div className="rounded bg-rose-500/10 px-2 py-1.5">
              <p className="text-[9px] text-rose-300/70 mb-0.5">常见错误</p>
              <p className="text-[9px] text-rose-200 whitespace-pre-wrap">{solveLesson.commonMistakes}</p>
            </div>
          </div>
          {solveLesson.checkpointQuestion && (
            <div className="border-t border-gray-800 pt-2">
              <p className="text-[9px] text-[#00FF7F] mb-1">验收：{solveLesson.checkpointQuestion}</p>
              <div className="space-y-1">
                {solveLesson.checkpointOptions.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-[9px] text-gray-400 cursor-pointer">
                    <input
                      type="radio"
                      name="solve-check"
                      checked={solveCheckAnswer === opt}
                      onChange={() => { setSolveCheckAnswer(opt); setSolveCheckResult(null); }}
                    />
                    {opt}
                  </label>
                ))}
              </div>
              {solveCheckAnswer && !solveCheckResult && (
                <button
                  type="button"
                  className="mt-1 rounded bg-[#00FF7F]/20 px-3 py-1 text-[9px] text-[#00FF7F]"
                  onClick={async () => {
                    try {
                      const res = await submitLessonCheckpoint(userId, solveLesson.id, solveCheckAnswer);
                      setSolveCheckResult(res.passed ? 'correct' : 'wrong');
                      appendZhi(
                        res.passed
                          ? `✅ 验收通过：${solveLesson.knowledgePoint}`
                          : `❌ 验收未通过，正确答案：${res.correctAnswer}`,
                        '拍照解题',
                      );
                    } catch (e) {
                      appendZhi(e instanceof Error ? e.message : '提交验收失败', '拍照解题');
                    }
                  }}
                >
                  提交答案
                </button>
              )}
              {solveCheckResult && (
                <p className={`mt-1 text-[9px] ${solveCheckResult === 'correct' ? 'text-[#00FF7F]' : 'text-rose-300'}`}>
                  {solveCheckResult === 'correct' ? '✓ 通过！' : `✗ 未通过`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  title,
  children,
  onConfirm,
  busy,
}: {
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#00FF7F]/25 bg-[#00FF7F]/5 p-3">
      <p className="mb-2 font-bold text-[#00FF7F]">{title}</p>
      <div className="space-y-1 text-[10px] leading-relaxed">{children}</div>
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className="mt-3 w-full rounded-lg bg-[#FF4500]/20 py-2 text-[11px] font-bold text-[#FF4500] disabled:opacity-50"
      >
        确认写入建档并修正今日计划
      </button>
    </div>
  );
}
