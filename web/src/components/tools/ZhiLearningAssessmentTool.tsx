import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useZhiChat } from '../../context/ZhiChatContext';
import { emitDirectoryWorkspaceRefresh } from '../../lib/directory-workspace-api';
import {
  fetchAssessmentHub,
  fetchAssessmentPaperById,
  generateAssessmentPaper,
  submitAssessmentPaperApi,
  type AssessmentEvalDto,
  type AssessmentHubDto,
  type AssessmentPaperDto,
  type AssessmentQuestionDto,
} from '../../lib/zhi-assessment-api';
import {
  fetchMistakeBank,
  fetchMistakesForRetry,
  reviewMistake,
  type MistakeBankDto,
  type MistakeEntryDto,
} from '../../lib/zhi-mistake-api';
import { teachKnowledgePoint, submitLessonCheckpoint, type LessonDto } from '../../lib/zhi-tutor-api';
import { generateExam, generateLargeExam, fetchExamHistory, fetchExamDetail, fetchExamQuestionsPaginated, startExam, answerExamQuestion, answerQuestionBatch, gradeExam, type ExamDetailDto, type ExamHistoryDto, type ExamQuestionDto, type PaginatedQuestionsDto } from '../../lib/zhi-exam-api';
import { ZhiExamDashboard } from '../ZhiExamDashboard';
import { ZhiProgressBar } from '../progress/ZhiProgressBar';

type Tab = 'subject' | 'standard' | 'daily' | 'mistake' | 'exam';
type Stage = 'hub' | 'paper' | 'result';

const EFF_COLOR: Record<string, string> = {
  high: 'text-[#00FF7F]',
  mid: 'text-amber-400',
  low: 'text-rose-400',
  unknown: 'text-gray-500',
};

export function ZhiLearningAssessmentTool({ userId }: { userId: string }) {
  const { openTool, appendZhi, toolLaunch, consumeToolLaunch } = useZhiChat();
  const [tab, setTab] = useState<Tab>('subject');
  const [stage, setStage] = useState<Stage>('hub');
  const [hub, setHub] = useState<AssessmentHubDto | null>(null);
  const [paper, setPaper] = useState<AssessmentPaperDto | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AssessmentEvalDto | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('toefl');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mistakeBank, setMistakeBank] = useState<MistakeBankDto | null>(null);
  const [retryMistakes, setRetryMistakes] = useState<MistakeEntryDto[]>([]);
  const [mistakeSubject, setMistakeSubject] = useState<string>('');
  const [mistakeLoading, setMistakeLoading] = useState(false);
  const [teachingLesson, setTeachingLesson] = useState<LessonDto | null>(null);
  const [teachingBusy, setTeachingBusy] = useState(false);
  const [checkAnswer, setCheckAnswer] = useState('');
  const [examHistory, setExamHistory] = useState<ExamHistoryDto | null>(null);
  const [currentExam, setCurrentExam] = useState<ExamDetailDto | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({});
  const [examBusy, setExamBusy] = useState(false);
  const [examError, setExamError] = useState('');
  const [examSubject, setExamSubject] = useState('');
  const [examResult, setExamResult] = useState<ExamDetailDto | null>(null);
  const [examMode, setExamMode] = useState<'quick' | 'large'>('quick');
  const [examPage, setExamPage] = useState(1);
  const [examPageQuestions, setExamPageQuestions] = useState<ExamQuestionDto[]>([]);
  const [examTotalPages, setExamTotalPages] = useState(1);

  const loadHub = useCallback(async () => {
    const h = await fetchAssessmentHub(userId);
    if (h) {
      setHub(h);
      if (h.subjects[0]) setSelectedSubject(h.subjects[0].id);
    }
  }, [userId]);

  const loadMistakeBank = useCallback(async () => {
    setMistakeLoading(true);
    try {
      const [bank, retry] = await Promise.all([
        fetchMistakeBank(userId, { subject: mistakeSubject || undefined, limit: 30 }),
        fetchMistakesForRetry(userId, mistakeSubject || undefined, 10),
      ]);
      setMistakeBank(bank);
      setRetryMistakes(retry);
    } catch { /* silently fail */ } finally {
      setMistakeLoading(false);
    }
  }, [userId, mistakeSubject]);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const loadExamHistory = useCallback(async () => {
    setExamBusy(true);
    try {
      const h = await fetchExamHistory(userId, examSubject || undefined, 10);
      setExamHistory(h);
    } catch { /* silently fail */ } finally { setExamBusy(false); }
  }, [userId, examSubject]);

  useEffect(() => {
    if (!toolLaunch?.assessmentTab && !toolLaunch?.assessmentPaperId) return;
    if (toolLaunch.assessmentTab) setTab(toolLaunch.assessmentTab);
    if (toolLaunch.assessmentSubjectId) setSelectedSubject(toolLaunch.assessmentSubjectId);
    const paperId = toolLaunch.assessmentPaperId;
    consumeToolLaunch();
    if (paperId) {
      void (async () => {
        setBusy(true);
        setError('');
        try {
          const p = await fetchAssessmentPaperById(userId, paperId);
          if (p) {
            setPaper(p);
            setAnswers({});
            setResult(null);
            setStage('paper');
            if (p.subjectId) setSelectedSubject(p.subjectId);
          } else {
            setError('试卷加载失败，请从评估中心重新生成');
            setStage('hub');
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : '试卷加载失败');
          setStage('hub');
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    setStage('hub');
    setPaper(null);
    setResult(null);
  }, [toolLaunch, consumeToolLaunch, userId]);

  const startPaper = async (opts: { subjectId?: string; daily?: boolean }) => {
    setBusy(true);
    setError('');
    try {
      const p = await generateAssessmentPaper(userId, {
        ...opts,
        adaptive: !opts.daily,
        userHint: opts.daily ? undefined : `分科主动评估·${opts.subjectId ?? ''}`,
      });
      setPaper(p);
      setAnswers({});
      setResult(null);
      setStage('paper');
    } catch (e) {
      setError(e instanceof Error ? e.message : '出卷失败');
    } finally {
      setBusy(false);
    }
  };

  const submitPaper = async () => {
    if (!paper) return;
    setBusy(true);
    setError('');
    try {
      const evalRes = await submitAssessmentPaperApi({ userId, paperId: paper.id, answers });
      setResult(evalRes);
      setStage('result');
      const pathNote = evalRes.learningPathSummary
        ? `\n\n【路径已重排】\n${evalRes.learningPathSummary.slice(0, 600)}${evalRes.learningPathSummary.length > 600 ? '…' : ''}`
        : '';
      appendZhi(
        `【学习评估】${paper.subjectName} ${evalRes.scorePct}% · ${evalRes.efficiencyLabel}\n→ ${evalRes.nextAction}${pathNote}`,
        '学习评估',
      );
      emitDirectoryWorkspaceRefresh();
      if (evalRes.learningPathSummary) {
        const { fetchAnchorBrief } = await import('../../lib/zhi-anchor-brief-api');
        const { emitAnchorBrief } = await import('../../lib/wuxian-events');
        const ab = await fetchAnchorBrief(userId);
        if (ab) emitAnchorBrief(ab);
      }
      await loadHub();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  };

  const renderQuestion = (q: AssessmentQuestionDto) => (
    <div key={q.id} className="rounded-xl border border-gray-900 bg-black/40 p-3">
      {q.type === 'active_qa' && (
        <span className="mb-1 inline-block rounded bg-[#00FF7F]/15 px-1.5 py-0.5 text-[8px] font-bold text-[#00FF7F]">
          ZHI 主动追问
        </span>
      )}
      {q.type === 'fill_blank' && (
        <span className="mb-1 inline-block rounded bg-cyan-500/15 px-1.5 py-0.5 text-[8px] font-bold text-cyan-300">
          填空验收
        </span>
      )}
      <p className="text-[10px] font-medium text-gray-200">{q.prompt}</p>
      {q.knowledgePoint && (
        <p className="mt-1 text-[8px] text-gray-600">知识点：{q.knowledgePoint}</p>
      )}
      {q.coachFollowUp && q.type === 'active_qa' && (
        <p className="mt-1 text-[8px] text-gray-500">答完后我会追问：{q.coachFollowUp}</p>
      )}
      {q.type === 'speaking_hint' ? (
        <button
          type="button"
          onClick={() => openTool('language-coach')}
          className="mt-2 rounded border border-amber-500/40 px-2 py-1 text-[9px] text-amber-300 hover:bg-amber-500/10"
        >
          去语言陪练录音 → 回来填写要点
        </button>
      ) : null}
      {q.type === 'choice' && q.options ? (
        <motion.div className="mt-2 space-y-1">
          {q.options.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2 text-[9px] text-gray-400">
              <input
                type="radio"
                name={q.id}
                checked={answers[q.id] === opt}
                onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
              />
              {opt}
            </label>
          ))}
        </motion.div>
      ) : (
        <textarea
          value={answers[q.id] ?? ''}
          onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
          rows={3}
          className="mt-2 w-full rounded-lg border border-gray-900 bg-[#0B0C10] px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-[#00FF7F]/40"
          placeholder="写下你的作答…"
        />
      )}
    </div>
  );

  if (tab === 'standard') {
    return (
      <motion.div className="space-y-3">
        <motion.div className="flex gap-1 rounded-lg border border-gray-900 bg-black/40 p-0.5">
          {(
            [
              ['subject', '分科评估'],
              ['standard', '托福/雅思'],
              ['daily', '今日知识点'],
              ['mistake', '错题本'],
              ['exam', '模考'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setStage('hub');
                if (id === 'mistake') void loadMistakeBank();
                if (id === 'exam') void loadExamHistory();
              }}
              className={`flex-1 rounded-md py-1.5 text-[9px] font-bold ${
                tab === id ? 'bg-[#00FF7F]/20 text-[#00FF7F]' : 'text-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </motion.div>
        <p className="text-[9px] text-gray-500">
          听读写说四科全真清算（25 Warp）。单项口语/写作可跳转语言陪练。
        </p>
        <ZhiExamDashboard userId={userId} />
        <button
          type="button"
          onClick={() => openTool('language-coach')}
          className="w-full rounded-lg border border-amber-500/30 py-2 text-[10px] text-amber-300 hover:bg-amber-500/10"
        >
          🎙 单项口语/写作陪练评估（8 Warp）
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-3 text-left">
      <motion.div className="flex gap-1 rounded-lg border border-gray-900 bg-black/40 p-0.5">
        {(
          [
            ['subject', '分科评估'],
            ['standard', '托福/雅思'],
            ['daily', '今日知识点'],
            ['mistake', '错题本'],
            ['exam', '模考'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setStage('hub');
              setPaper(null);
              setResult(null);
              setCurrentExam(null);
              setExamResult(null);
              if (id === 'mistake') void loadMistakeBank();
              if (id === 'exam') void loadExamHistory();
            }}
            className={`flex-1 rounded-md py-1.5 text-[9px] font-bold ${
              tab === id ? 'bg-[#00FF7F]/20 text-[#00FF7F]' : 'text-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </motion.div>

      {hub && stage === 'hub' && (
        <>
          <p className="text-[9px] leading-relaxed text-gray-500">{hub.coachLine}</p>
          {(hub.pendingActiveExams ?? 0) > 0 && hub.pendingExamPaperId && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  try {
                    const p = await fetchAssessmentPaperById(userId, hub.pendingExamPaperId!);
                    if (p) {
                      setPaper(p);
                      setAnswers({});
                      setResult(null);
                      setStage('paper');
                    }
                  } finally {
                    setBusy(false);
                  }
                })()
              }
              className="w-full rounded-xl border-2 border-[#00FF7F]/50 bg-[#00FF7F]/10 py-2.5 text-[10px] font-black text-[#00FF7F] hover:bg-[#00FF7F]/20 disabled:opacity-50"
            >
              ⚡ 有学必考 · 继续待完成的主动验收（{hub.pendingActiveExams}）
            </button>
          )}
        </>
      )}

      {error && <p className="text-[9px] text-rose-400">{error}</p>}

      {stage === 'hub' && tab === 'subject' && hub && (
        <motion.div className="space-y-3">
          <motion.div className="flex flex-wrap gap-1.5">
            {hub.subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSubject(s.id)}
                className={`rounded-lg border px-2 py-1 text-[9px] ${
                  selectedSubject === s.id
                    ? 'border-[#00FF7F]/40 bg-[#00FF7F]/10 text-[#00FF7F]'
                    : 'border-gray-900 text-gray-500'
                }`}
              >
                {s.name}
                <span className={`ml-1 ${EFF_COLOR[s.efficiency]}`}>
                  {s.lastScore ? s.lastScore.slice(0, 12) : '—'}
                </span>
              </button>
            ))}
          </motion.div>
          {hub.subjects
            .filter((s) => s.id === selectedSubject)
            .map((s) => (
              <motion.div key={s.id} className="rounded-xl border border-gray-900 bg-black/30 p-3">
                <ZhiProgressBar
                  label={`${s.name} 进度`}
                  currentPct={s.progressPct}
                  displayCurrent={String(s.progressPct)}
                  displayTarget="100"
                  unit="%"
                  compact
                />
              </motion.div>
            ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void startPaper({ subjectId: selectedSubject })}
            className="w-full rounded-xl bg-[#00FF7F] py-2.5 text-[10px] font-black text-black disabled:opacity-50"
          >
            {busy ? 'AI 出卷中…' : `✦ 生成 ${hub.subjects.find((s) => s.id === selectedSubject)?.name ?? ''} 评估卷`}
          </button>
        </motion.div>
      )}

      {stage === 'hub' && tab === 'daily' && hub && (
        <motion.div className="space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
          <p className="text-[10px] text-violet-200">
            今日知识点评测 · 已测 {hub.dailyKpDone}/{hub.dailyKpTotal}
          </p>
          <p className="text-[9px] text-gray-500">
            从教材当前章知识点、薄弱项与今日 P0 任务自动组卷，判断学习效率。
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startPaper({ daily: true })}
            className="w-full rounded-xl border border-violet-500/40 py-2.5 text-[10px] font-bold text-violet-200 hover:bg-violet-500/10 disabled:opacity-50"
          >
            {busy ? '组卷中…' : '开始今日知识点评测'}
          </button>
        </motion.div>
      )}

      {stage === 'hub' && tab === 'mistake' && (
        <motion.div className="space-y-3">
          <div className="flex gap-1.5">
            {['', '数学', '物理', '化学', '英语', '托福'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setMistakeSubject(s)}
                className={`rounded px-2 py-1 text-[9px] ${
                  mistakeSubject === s
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                    : 'text-gray-500 border border-gray-900'
                }`}
              >
                {s || '全部'}
              </button>
            ))}
          </div>

          {mistakeLoading && <p className="text-[9px] text-gray-500">加载错题本…</p>}

          {retryMistakes.length > 0 && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2">
              <p className="mb-1 text-[9px] font-bold text-rose-300">待复习 ({retryMistakes.length})</p>
              <ul className="space-y-1">
                {retryMistakes.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-2 text-[9px]">
                    <span className="text-gray-300">{m.questionText.slice(0, 40)}</span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        className="text-[#00FF7F] underline"
                        onClick={async () => {
                          await reviewMistake(userId, m.id, true);
                          void loadMistakeBank();
                        }}
                      >
                        对了
                      </button>
                      <button
                        type="button"
                        className="text-rose-400 underline"
                        onClick={async () => {
                          await reviewMistake(userId, m.id, false);
                          void loadMistakeBank();
                        }}
                      >
                        还错
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mistakeBank && (
            <>
              <div className="flex flex-wrap gap-2 text-[9px] text-gray-500">
                <span>共 {mistakeBank.total} 题</span>
                <span className="text-[#00FF7F]">掌握 {mistakeBank.mastered}</span>
                <span className="text-rose-300">待复习 {mistakeBank.needsReview}</span>
              </div>
              {mistakeBank.bySubject.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {mistakeBank.bySubject.map((s) => (
                    <span key={s.subject} className="rounded bg-gray-900 px-1.5 py-0.5 text-[8px] text-gray-400">
                      {s.subject} {s.count}
                    </span>
                  ))}
                </div>
              )}
              {teachingLesson && (
                <div className="space-y-2 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3">
                  <p className="text-[10px] font-bold text-cyan-200">{teachingLesson.knowledgePoint}</p>
                  {teachingLesson.prerequisiteCheck && <p className="text-[9px] text-gray-500">前置：{teachingLesson.prerequisiteCheck}</p>}
                  <p className="text-[10px] leading-relaxed text-gray-200 whitespace-pre-wrap">{teachingLesson.coreTeaching}</p>
                  {teachingLesson.analogy && <p className="text-[9px] text-amber-200">💡 {teachingLesson.analogy}</p>}
                  <button
                    type="button"
                    className="w-full rounded border border-gray-800 py-1 text-[9px] text-gray-500"
                    onClick={() => setTeachingLesson(null)}
                  >
                    收起讲解
                  </button>
                </div>
              )}

              {mistakeBank.items.length > 0 && (
                <ul className="space-y-1">
                  {mistakeBank.items.slice(0, 15).map((m) => (
                    <li key={m.id} className="rounded border border-gray-900 bg-black/30 px-2 py-1.5 text-[9px]">
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-200">{m.questionText.slice(0, 50)}</span>
                        <span className={`shrink-0 ${m.masteryStatus === 'mastered' ? 'text-[#00FF7F]' : 'text-amber-400'}`}>
                          {m.masteryStatus === 'mastered' ? '已掌握' : m.masteryStatus === 'reviewing' ? '复习中' : '待复习'}
                        </span>
                      </div>
                      {m.knowledgeNode && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-gray-600">知识点：{m.knowledgeNode}</span>
                          <button
                            type="button"
                            disabled={teachingBusy}
                            className="text-cyan-400 underline disabled:opacity-40"
                            onClick={async () => {
                              setTeachingBusy(true);
                              try {
                                const lesson = await teachKnowledgePoint({ userId, knowledgePoint: m.knowledgeNode!, subject: m.subject, sourceType: 'mistake_bank', sourceId: m.id });
                                setTeachingLesson(lesson);
                              } catch { /* silently fail */ } finally { setTeachingBusy(false); }
                            }}
                          >
                            {teachingBusy ? '…' : '讲解'}
                          </button>
                        </div>
                      )}
                      <p className="text-gray-600">错因：{m.mistakeType} · 复习 {m.reviewCount} 次</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </motion.div>
      )}

      {stage === 'hub' && tab === 'exam' && (
        <motion.div className="space-y-3">
          {examError && <p className="text-[9px] text-rose-400">{examError}</p>}

          {!currentExam && !examResult && (
            <>
              <div className="flex gap-1.5">
                {['', '数学', '物理', '化学', '英语', '托福'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setExamSubject(s)}
                    className={`rounded px-2 py-1 text-[9px] ${
                      examSubject === s
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                        : 'text-gray-500 border border-gray-900'
                    }`}
                  >
                    {s || '综合'}
                  </button>
                ))}
              </div>

              {/* mode selector */}
              <div className="flex gap-1 rounded-lg border border-gray-900 bg-black/40 p-0.5">
                {([
                  ['quick', '快速模考 (≤20题)'],
                  ['large', '全真模考 (50题)'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setExamMode(id)}
                    className={`flex-1 rounded-md py-1.5 text-[9px] font-bold ${
                      examMode === id ? 'bg-cyan-500/20 text-cyan-200' : 'text-gray-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={examBusy}
                onClick={async () => {
                  setExamBusy(true);
                  setExamError('');
                  try {
                    const exam = examMode === 'large'
                      ? await generateLargeExam(userId, examSubject || undefined, 50)
                      : await generateExam(userId, examSubject || undefined);
                    setCurrentExam(exam);
                    setExamAnswers({});
                    setExamResult(null);
                    setExamPage(1);
                    setExamPageQuestions([]);
                    setExamTotalPages(1);
                    await startExam(exam.id);
                    if (examMode === 'large' && exam.questionCount > 10) {
                      const pg = await fetchExamQuestionsPaginated(exam.id, 1, 10);
                      setExamPageQuestions(pg.questions);
                      setExamTotalPages(pg.totalPages);
                    }
                  } catch (e) {
                    setExamError(e instanceof Error ? e.message : '生成模考失败');
                  } finally { setExamBusy(false); }
                }}
                className="w-full rounded-xl bg-cyan-500 py-2.5 text-[10px] font-black text-black disabled:opacity-50"
              >
                {examBusy
                  ? examMode === 'large' ? 'AI 分批出卷中（1/5）…' : 'AI 组卷中…'
                  : examMode === 'large' ? '✦ 生成全真模考试卷（50题）' : '✦ 生成快速模考试卷'
                }
              </button>

              {examHistory && examHistory.items.length > 0 && (
                <div className="border-t border-gray-900 pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[9px] font-bold text-gray-500">历史模考</p>
                    <p className="text-[9px] text-gray-600">平均分 {examHistory.avgScore}%</p>
                  </div>
                  <ul className="space-y-1">
                    {examHistory.items.map((ex) => (
                      <li
                        key={ex.id}
                        className="flex items-center justify-between rounded border border-gray-900 bg-black/30 px-2 py-1.5 text-[9px] cursor-pointer hover:border-gray-700"
                        onClick={async () => {
                          setExamBusy(true);
                          try {
                            const detail = await fetchExamDetail(ex.id);
                            if (detail) {
                              if (detail.status === 'completed') {
                                setExamResult(detail);
                              } else {
                                setCurrentExam(detail);
                                setExamAnswers({});
                                setExamResult(null);
                              }
                            }
                          } catch { /* skip */ } finally { setExamBusy(false); }
                        }}
                      >
                        <span className="text-gray-300 truncate">{ex.title}</span>
                        <span className={`shrink-0 ${ex.scorePct >= 80 ? 'text-[#00FF7F]' : ex.scorePct >= 50 ? 'text-amber-400' : 'text-rose-300'}`}>
                          {ex.status === 'completed' ? `${ex.scorePct}%` : ex.status === 'in_progress' ? '进行中' : ex.status === 'generated' ? '未开始' : ex.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {currentExam && !examResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-cyan-200">{currentExam.title}</p>
                <p className="text-[9px] text-gray-500">{currentExam.sourceSummary}</p>
              </div>

              {/* progress bar */}
              <div className="flex items-center gap-2 text-[9px] text-gray-500">
                <div className="flex-1 h-1.5 rounded-full bg-gray-900 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all"
                    style={{ width: `${currentExam.questionCount > 0 ? (Object.keys(examAnswers).length / currentExam.questionCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="shrink-0">{Object.keys(examAnswers).length}/{currentExam.questionCount}</span>
              </div>

              {/* paginated questions */}
              {examMode === 'large' && examTotalPages > 1 ? (
                <div className="space-y-2">
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {examPageQuestions.map((q) => (
                      <div key={q.id} className="rounded-xl border border-gray-900 bg-black/40 p-3">
                        <p className="text-[10px] font-medium text-gray-200">{q.questionIndex}. {q.questionText}</p>
                        <div className="mt-2 space-y-1">
                          {q.options.map((opt) => (
                            <label key={opt} className="flex cursor-pointer items-center gap-2 text-[9px] text-gray-400">
                              <input
                                type="radio"
                                name={q.id}
                                checked={examAnswers[q.id] === opt}
                                onChange={() => setExamAnswers((a) => ({ ...a, [q.id]: opt }))}
                              />
                              {opt}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* page nav */}
                  <div className="flex items-center justify-center gap-2 text-[9px]">
                    <button
                      type="button"
                      disabled={examPage <= 1}
                      className="px-2 py-1 text-gray-500 disabled:opacity-30"
                      onClick={async () => {
                        const p = Math.max(1, examPage - 1);
                        setExamPage(p);
                        const pg = await fetchExamQuestionsPaginated(currentExam.id, p, 10);
                        setExamPageQuestions(pg.questions);
                        setExamTotalPages(pg.totalPages);
                      }}
                    >
                      ◀
                    </button>
                    <span className="text-gray-400">{examPage}/{examTotalPages}</span>
                    <button
                      type="button"
                      disabled={examPage >= examTotalPages}
                      className="px-2 py-1 text-gray-500 disabled:opacity-30"
                      onClick={async () => {
                        const p = Math.min(examTotalPages, examPage + 1);
                        setExamPage(p);
                        const pg = await fetchExamQuestionsPaginated(currentExam.id, p, 10);
                        setExamPageQuestions(pg.questions);
                        setExamTotalPages(pg.totalPages);
                      }}
                    >
                      ▶
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {currentExam.questions.map((q) => (
                    <div key={q.id} className="rounded-xl border border-gray-900 bg-black/40 p-3">
                      <p className="text-[10px] font-medium text-gray-200">{q.questionIndex}. {q.questionText}</p>
                      <div className="mt-2 space-y-1">
                        {q.options.map((opt) => (
                          <label key={opt} className="flex cursor-pointer items-center gap-2 text-[9px] text-gray-400">
                            <input
                              type="radio"
                              name={q.id}
                              checked={examAnswers[q.id] === opt}
                              onChange={() => setExamAnswers((a) => ({ ...a, [q.id]: opt }))}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setCurrentExam(null); setExamResult(null); setExamPage(1); setExamPageQuestions([]); }}
                  className="flex-1 rounded-lg border border-gray-800 py-2 text-[10px] text-gray-500"
                >
                  返回
                </button>
                <button
                  type="button"
                  disabled={examBusy}
                  onClick={async () => {
                    setExamBusy(true);
                    setExamError('');
                    try {
                      // submit all answered answers
                      const toSubmit = Object.entries(examAnswers)
                        .filter(([, ans]) => ans)
                        .map(([qid, ans]) => ({ questionId: qid, answer: ans }));
                      if (currentExam.questionCount > 20) {
                        await answerQuestionBatch(currentExam.id, toSubmit);
                      } else {
                        for (const { questionId, answer } of toSubmit) {
                          await answerExamQuestion(currentExam.id, questionId, answer);
                        }
                      }
                      const graded = await gradeExam(currentExam.id);
                      setExamResult(graded);
                      setCurrentExam(null);
                      setExamPage(1);
                      setExamPageQuestions([]);
                      const pct = graded.scorePct;
                      const label = pct >= 80 ? '优秀' : pct >= 50 ? '需加强' : '薄弱';
                      appendZhi(
                        `【模考】${graded.title} ${pct}% · ${label}\n薄弱：${graded.weakAreas.join('、') || '无'}\n建议：${graded.recommendations ?? ''}`,
                        '模考',
                      );
                      void loadExamHistory();
                    } catch (e) {
                      setExamError(e instanceof Error ? e.message : '批改失败');
                    } finally { setExamBusy(false); }
                  }}
                  className="flex-[2] rounded-lg bg-cyan-500 py-2 text-[10px] font-black text-black disabled:opacity-50"
                >
                  {examBusy ? '批改中…' : `提交并批改 (${Object.keys(examAnswers).length}/${currentExam.questionCount})`}
                </button>
              </div>
            </div>
          )}

          {examResult && (
            <div className="space-y-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
              <p className="text-[11px] font-bold text-cyan-200">{examResult.title}</p>
              <p className="text-[12px] font-black">{examResult.scorePct}%</p>
              <div className="flex flex-wrap gap-2 text-[9px] text-gray-500">
                <span>正确 {examResult.correctCount}/{examResult.questionCount}</span>
                <span>错题来源：{examResult.sourceSummary}</span>
              </div>
              {examResult.weakAreas.length > 0 && (
                <div>
                  <p className="text-[9px] text-rose-300/80 mb-1">薄弱区域：</p>
                  <div className="flex flex-wrap gap-1">
                    {examResult.weakAreas.map((w) => (
                      <span key={w} className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[8px] text-rose-200">{w}</span>
                    ))}
                  </div>
                </div>
              )}
              {examResult.recommendations && (
                <p className="rounded bg-gray-900/50 px-2 py-1 text-[9px] text-gray-400">
                  💡 {examResult.recommendations}
                </p>
              )}

              {/* show individual question results */}
              <div className="max-h-48 space-y-1 overflow-y-auto border-t border-gray-900 pt-2">
                {examResult.questions.map((q) => (
                  <div key={q.id} className="flex items-start gap-2 text-[9px]">
                    <span className={q.isCorrect ? 'text-[#00FF7F]' : q.isAnswered ? 'text-rose-300' : 'text-gray-600'}>
                      {q.isCorrect ? '✓' : q.isAnswered ? '✗' : '—'}
                    </span>
                    <span className="text-gray-300">{q.questionText.slice(0, 50)}</span>
                    {q.isAnswered && !q.isCorrect && (
                      <span className="text-gray-600 shrink-0">正解：{q.correctAnswer}</span>
                    )}
                  </div>
                ))}
              </div>

              {examResult.scorePct < 80 && examResult.scorePct > 0 && (
                <p className="text-[9px] text-cyan-300">
                  📋 已自动生成重考试卷，可在历史中查看
                </p>
              )}

              <button
                type="button"
                onClick={() => {
                  setExamResult(null);
                  setCurrentExam(null);
                }}
                className="w-full rounded-lg border border-gray-800 py-2 text-[10px] text-gray-400"
              >
                返回模考中心
              </button>
            </div>
          )}
        </motion.div>
      )}

      {stage === 'hub' && hub && hub.recentPapers.length > 0 && (
        <motion.div className="border-t border-gray-950 pt-2">
          <p className="mb-1.5 text-[9px] font-bold text-gray-500">最近评估</p>
          <ul className="space-y-1">
            {hub.recentPapers.slice(0, 5).map((p) => (
              <li key={p.id} className="flex justify-between gap-2 text-[8px] text-gray-600">
                <span className="truncate">{p.title}</span>
                <span className="shrink-0 text-gray-500">{p.scoreSummary ?? '—'}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {stage === 'paper' && paper && (
        <motion.div className="space-y-3">
          {paper.assessmentMode === 'active' && (
            <p className="rounded-lg border border-[#00FF7F]/30 bg-[#00FF7F]/5 px-2 py-1.5 text-[9px] text-[#00FF7F]">
              {paper.activeIntro ?? '主动验收：有学必考，请逐题作答。'}
            </p>
          )}
          <p className="text-[11px] font-bold text-gray-200">{paper.title}</p>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1 scrollbar-none">
            {paper.questions.map(renderQuestion)}
          </div>
          <motion.div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStage('hub')}
              className="flex-1 rounded-lg border border-gray-800 py-2 text-[10px] text-gray-500"
            >
              返回
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitPaper()}
              className="flex-[2] rounded-lg bg-[#00FF7F] py-2 text-[10px] font-black text-black disabled:opacity-50"
            >
              {busy ? 'AI 批改中…' : '提交答卷 · 清算效率'}
            </button>
          </motion.div>
        </motion.div>
      )}

      {stage === 'result' && result && paper && (
        <motion.div className="space-y-3 rounded-xl border border-[#00FF7F]/20 bg-[#00FF7F]/5 p-3">
          <p className="text-[11px] font-bold text-[#00FF7F]">
            {result.scorePct}% · {result.efficiencyLabel}
          </p>
          <p className="text-[10px] text-gray-300">{result.coachFeedback}</p>
          {result.strengths.length > 0 && (
            <p className="text-[9px] text-gray-500">强项：{result.strengths.join('；')}</p>
          )}
          {result.gaps.length > 0 && (
            <p className="text-[9px] text-rose-300/80">薄弱：{result.gaps.join('；')}</p>
          )}
          <p className="text-[9px] text-[#00FF7F]">→ {result.nextAction}</p>

          {result.gaps.length > 0 && (
            <div className="space-y-1">
              {result.gaps.slice(0, 3).map((gap) => (
                <button
                  key={gap}
                  type="button"
                  disabled={teachingBusy}
                  className="w-full rounded border border-cyan-500/30 bg-cyan-500/5 py-1.5 text-[9px] text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
                  onClick={async () => {
                    setTeachingBusy(true);
                    setTeachingLesson(null);
                    try {
                      const lesson = await teachKnowledgePoint({
                        userId,
                        knowledgePoint: gap,
                        subject: paper?.subjectId,
                        context: `该学生在评估中得分 ${result.scorePct}%，此项为薄弱环节`,
                        sourceType: 'assessment_gap',
                        sourceId: gap,
                      });
                      setTeachingLesson(lesson);
                      setCheckAnswer('');
                    } catch (e) {
                      appendZhi(e instanceof Error ? e.message : '讲授失败', '学习评估');
                    } finally {
                      setTeachingBusy(false);
                    }
                  }}
                >
                  {teachingBusy ? '生成讲解…' : `📖 讲解：${gap.slice(0, 24)}`}
                </button>
              ))}
            </div>
          )}

          {teachingLesson && (
            <div className="space-y-2 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3">
              <p className="text-[10px] font-bold text-cyan-200">{teachingLesson.knowledgePoint}</p>
              {teachingLesson.prerequisiteCheck && (
                <div className="rounded bg-gray-900/50 px-2 py-1 text-[9px] text-gray-400">
                  <span className="text-gray-500">前置：</span>{teachingLesson.prerequisiteCheck}
                </div>
              )}
              <p className="text-[10px] leading-relaxed text-gray-200 whitespace-pre-wrap">{teachingLesson.coreTeaching}</p>
              {teachingLesson.analogy && (
                <p className="rounded bg-amber-500/10 px-2 py-1 text-[9px] text-amber-200">💡 {teachingLesson.analogy}</p>
              )}
              {teachingLesson.commonMistakes && (
                <p className="text-[9px] text-rose-300/80">⚠️ {teachingLesson.commonMistakes}</p>
              )}
              {teachingLesson.checkpointQuestion && (
                <div className="border-t border-gray-800 pt-2">
                  <p className="text-[9px] text-[#00FF7F] mb-1">随堂验收：{teachingLesson.checkpointQuestion}</p>
                  <div className="space-y-1">
                    {teachingLesson.checkpointOptions.map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-[9px] text-gray-400 cursor-pointer">
                        <input
                          type="radio"
                          name="tutor-check"
                          checked={checkAnswer === opt}
                          onChange={() => { setCheckAnswer(opt); setTeachingBusy(false); }}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                  {checkAnswer && !teachingBusy && (
                    <button
                      type="button"
                      className="mt-1 rounded bg-[#00FF7F]/20 px-3 py-1 text-[9px] text-[#00FF7F]"
                      onClick={async () => {
                        setTeachingBusy(true);
                        try {
                          const result = await submitLessonCheckpoint(userId, teachingLesson.id, checkAnswer);
                          appendZhi(
                            result.passed
                              ? `✅ ${teachingLesson.knowledgePoint} 验收通过`
                              : `❌ ${teachingLesson.knowledgePoint} 验收未通过，正确答案：${result.correctAnswer}`,
                            '学习评估',
                          );
                        } catch (e) {
                          appendZhi(e instanceof Error ? e.message : '提交验收失败', '学习评估');
                        } finally { setTeachingBusy(false); }
                      }}
                    >
                      提交验收
                    </button>
                  )}
                  {teachingBusy && <p className="mt-1 text-[9px] text-gray-500">提交中…</p>}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setStage('hub');
              setPaper(null);
              setResult(null);
              setTeachingLesson(null);
            }}
            className="w-full rounded-lg border border-gray-800 py-2 text-[10px] text-gray-400"
          >
            完成 · 返回评估中心
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
