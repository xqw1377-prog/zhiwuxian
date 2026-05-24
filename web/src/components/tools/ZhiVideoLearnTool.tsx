import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useEmbedPlaybackClock } from '../../hooks/useEmbedPlaybackClock';
import { useZhiChat } from '../../context/ZhiChatContext';
import { useZhiDirectory } from '../../context/ZhiDirectoryContext';
import { syncChatTurnToCloud } from '../../lib/sync-chat-to-cloud';
import {
  assimilateVideoSession,
  askVideoCheckpointApi,
  cellsToChapters,
  evalVideoCheckpointApi,
  fetchCourseGraph,
  fetchCoursewareMatches,
  fetchVideoLearnContext,
  finalizeVideoCheckpoint,
  formatTimestamp,
  parseVideoUrl,
  resolveVideoCheckpoint,
  type CourseNodeDto,
  type CoursewareMatchDto,
  type CoursewareMatchPackDto,
  type ParsedVideoUrl,
  type TextbookAlignmentDto,
  type VideoCheckpointEvalDto,
  type VideoLearnContextDto,
} from '../../lib/video-learn-api';
import { fetchMistakesForRetry, reviewMistake, type MistakeEntryDto } from '../../lib/zhi-mistake-api';
import { ZhiProgressBar } from '../progress/ZhiProgressBar';
import { onWuxianEventUntyped, WUXIAN_EVENTS } from '../../lib/wuxian-events';

type Props = { userId: string };

type Phase = 'idle' | 'loading' | 'ready';
type InputMode = 'recommend' | 'manual';

const GRADE_COLOR: Record<string, string> = {
  S: 'text-amber-300 border-amber-500/40',
  A: 'text-[#00FF7F] border-[#00FF7F]/40',
  B: 'text-gray-400 border-gray-700',
};

export function ZhiVideoLearnTool({ userId }: Props) {
  const { appendZhi } = useZhiChat();
  const { activeId, activeDirectory } = useZhiDirectory();
  const videoRef = useRef<HTMLVideoElement>(null);
  const triggeredRef = useRef<Set<string>>(new Set());

  const [urlInput, setUrlInput] = useState('');
  const [parsed, setParsed] = useState<ParsedVideoUrl | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [localName, setLocalName] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [courseId, setCourseId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<CourseNodeDto[]>([]);
  const [grade, setGrade] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeChapter, setActiveChapter] = useState<CourseNodeDto | null>(null);
  const [checkpointQ, setCheckpointQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<VideoLearnContextDto | null>(null);
  const [coachLine, setCoachLine] = useState('');
  const [passedIds, setPassedIds] = useState<Set<string>>(new Set());
  const [courseProgressPct, setCourseProgressPct] = useState(0);
  const [lastEval, setLastEval] = useState<VideoCheckpointEvalDto | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('recommend');
  const [matchPack, setMatchPack] = useState<CoursewareMatchPackDto | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<CoursewareMatchDto | null>(null);
  const [highlightCatalogId, setHighlightCatalogId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [showPanel, setShowPanel] = useState<'notes' | 'review' | null>(null);
  const [retryItems, setRetryItems] = useState<MistakeEntryDto[]>([]);

  const loadContext = useCallback(async () => {
    const [ctx, matches] = await Promise.all([
      fetchVideoLearnContext(userId),
      fetchCoursewareMatches(userId),
    ]);
    if (ctx) setContext(ctx);
    if (matches) setMatchPack(matches);
  }, [userId]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    return onWuxianEventUntyped(WUXIAN_EVENTS.coursewarePrefill, (raw) => {
      const detail = raw as {
        alignment?: TextbookAlignmentDto;
        highlightCatalogId?: string;
      } | undefined;
      if (!detail?.alignment) return;
      setInputMode('recommend');
      setHighlightCatalogId(detail.highlightCatalogId ?? detail.alignment.catalogId);
      setMatchPack((prev) => {
        const others = (prev?.textbookAlignments ?? []).filter(
          (a) => a.catalogId !== detail.alignment!.catalogId,
        );
        return prev
          ? { ...prev, textbookAlignments: [detail.alignment!, ...others] }
          : {
              needs: {
                focusSubject: detail.alignment!.subject,
                weakTopics: detail.alignment!.knowledgePoints,
                priorityTopics: detail.alignment!.knowledgePoints,
                dreamSchool: '',
                major: '',
                examTargets: [],
                needSummary: `教材第${detail.alignment!.chapterIndex}章对齐`,
              },
              matches: detail.alignment!.matches,
              textbookAlignments: [detail.alignment!],
              tagGlossary: {},
            };
      });
      if (detail.alignment.matches[0]) {
        setSelectedMatch(detail.alignment.matches[0]);
      }
    });
  }, []);

  const hasLocal = Boolean(localUrl);
  const hasEmbed = Boolean(parsed?.embedUrl);

  const embedSource = useMemo(() => {
    if (!parsed?.embedUrl) return null;
    if (parsed.kind === 'youtube') return { kind: 'youtube' as const, embedUrl: parsed.embedUrl };
    if (parsed.kind === 'bilibili') return { kind: 'bilibili' as const, embedUrl: parsed.embedUrl };
    return null;
  }, [parsed]);

  const {
    containerRef,
    effectiveTime,
    manualTime,
    setManualTime,
    seekTo,
    ready: embedReady,
    isYouTube,
    isBilibili,
    duration: embedDuration,
  } = useEmbedPlaybackClock(embedSource, phase === 'ready' && Boolean(embedSource));

  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);

  const onUrlChange = (v: string) => {
    setUrlInput(v);
    setParsed(v.trim() ? parseVideoUrl(v) : null);
  };

  const onPickLocal = (file: File) => {
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(URL.createObjectURL(file));
    setLocalName(file.name);
    setParsed(null);
    setUrlInput('');
  };

  const startFromUrl = useCallback(
    async (url: string, title: string) => {
      setUrlInput(url);
      setParsed(parseVideoUrl(url));
      setVideoTitle(title);
      setLocalUrl(null);
      setLocalName('');
      setError('');
      setPhase('loading');
      triggeredRef.current.clear();
      try {
        const r = await assimilateVideoSession({
          userId,
          videoUrl: url.trim(),
          title,
        });
        setCourseId(r.courseId);
        setGrade(r.grade ?? null);
        const nodes = await fetchCourseGraph(r.courseId);
        const list = nodes.length > 0 ? nodes : cellsToChapters(r.cells);
        setChapters(list);
        setPhase('ready');
        appendZhi(
          `已匹配课件「${title}」· ${list.length} 个章节节点${r.grade ? ` · 评级 ${r.grade}` : ''}。`,
          '视频学习',
        );
        if (r.coursewareIngest?.ingested) {
          appendZhi(`课件已入库：${r.coursewareIngest.reason}`, '课件库');
        } else if (r.coursewareIngest?.reason) {
          appendZhi(r.coursewareIngest.reason, '课件库');
        }
        void loadContext();
      } catch (e) {
        setError(e instanceof Error ? e.message : '同化失败');
        setPhase('idle');
      }
    },
    [appendZhi, loadContext, userId],
  );

  useEffect(() => {
    return onWuxianEventUntyped(WUXIAN_EVENTS.videoLearnStart, (raw) => {
      const detail = raw as {
        sourceUrl?: string;
        title?: string;
        chapterTitle?: string;
      } | undefined;
      if (!detail?.sourceUrl) return;
      void startFromUrl(detail.sourceUrl, detail.title ?? detail.chapterTitle ?? '课件');
    });
  }, [startFromUrl]);

  const startSession = useCallback(async () => {
    setError('');
    setPhase('loading');
    triggeredRef.current.clear();
    try {
      if (hasLocal && videoRef.current) {
        await new Promise<void>((resolve) => {
          const v = videoRef.current!;
          if (v.readyState >= 1) resolve();
          else v.onloadedmetadata = () => resolve();
        });
        const durMin = Math.max(1, Math.ceil((videoRef.current?.duration ?? 600) / 60));
        const r = await assimilateVideoSession({
          userId,
          simulate: true,
          videoDurationMinutes: durMin,
          title: localName || '本地视频',
        });
        setCourseId(r.courseId);
        setGrade(r.grade ?? null);
        setVideoTitle(localName || '本地视频');
        const nodes = await fetchCourseGraph(r.courseId);
        const list = nodes.length > 0 ? nodes : cellsToChapters(r.cells);
        setChapters(list);
        setPhase('ready');
        appendZhi(
          `视频章节已切分（${list.length} 个认知节点）${r.grade ? `，评级 ${r.grade}` : ''}。播放时 ZHI 会在章节边界主动提问。`,
          '视频学习',
        );
      } else if (urlInput.trim()) {
        const r = await assimilateVideoSession({
          userId,
          videoUrl: urlInput.trim(),
          title: parsed?.rawUrl,
        });
        setCourseId(r.courseId);
        setGrade(r.grade ?? null);
        setVideoTitle(parsed?.rawUrl?.slice(0, 80) || urlInput.trim().slice(0, 80) || '在线视频');
        const nodes = await fetchCourseGraph(r.courseId);
        const list = nodes.length > 0 ? nodes : cellsToChapters(r.cells);
        setChapters(list);
        setPhase('ready');
        appendZhi(
          `视频章节已切分（${list.length} 个认知节点）${r.grade ? `，评级 ${r.grade}` : ''}。外链请点章节手动卡点；本地视频可自动卡点。`,
          '视频学习',
        );
        if (r.coursewareIngest?.ingested) {
          appendZhi(`课件已入库：${r.coursewareIngest.reason}`, '课件库');
          void loadContext();
        }
      } else {
        throw new Error('请粘贴视频链接或选择本地文件');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '同化失败');
      setPhase('idle');
    }
  }, [appendZhi, hasLocal, localName, parsed?.rawUrl, urlInput, userId]);

  const openCheckpoint = useCallback(
    async (ch: CourseNodeDto) => {
      if (busy) return;
      setActiveChapter(ch);
      setAnswer('');
      setLastEval(null);
      setBusy(true);
      try {
        const pack = await askVideoCheckpointApi({
          userId,
          chapterTitle: ch.title,
          courseId: courseId ?? undefined,
          timestampSec: ch.video_timestamp_start,
          videoTitle,
        });
        setCheckpointQ(pack.question);
        setCoachLine(pack.coachLine);
        appendZhi(`【${ch.title} @ ${formatTimestamp(ch.video_timestamp_start)}】\n${pack.coachLine}\n\n${pack.question}`, '视频卡点');
      } catch {
        const fallback = `用一句话说明「${ch.title}」和你已学内容的因果联系。`;
        setCheckpointQ(fallback);
        setCoachLine('到这一节了，别跳过。');
      } finally {
        setBusy(false);
      }
    },
    [appendZhi, busy, courseId, userId, videoTitle],
  );

  const submitAnswer = useCallback(async () => {
    if (!activeChapter || !answer.trim()) return;
    setBusy(true);
    try {
      const ts =
        videoRef.current?.currentTime ??
        (hasEmbed ? effectiveTime : activeChapter.video_timestamp_start);
      if (courseId) {
        const route = await resolveVideoCheckpoint({
          userId,
          courseId,
          currentTimestamp: ts,
          quizScore: 0.75,
        });
        if (route.event === 'WORMHOLE_ACTIVATED' && route.redirectToSeconds != null && videoRef.current) {
          videoRef.current.currentTime = route.redirectToSeconds;
          appendZhi(`虫洞跃迁 → ${formatTimestamp(route.redirectToSeconds)}`, '视频学习');
        }
      }
      const evalResult = await evalVideoCheckpointApi({
        userId,
        chapterTitle: activeChapter.title,
        courseId: courseId ?? undefined,
        videoTitle,
        timestampSec: ts,
        question: checkpointQ,
        userAnswer: answer.trim(),
        totalChapters: chapters.length,
      });
      setLastEval(evalResult);
      if (evalResult.courseProgress) {
        setCourseProgressPct(evalResult.courseProgress.progressPct);
      }
      if (evalResult.passed) {
        setPassedIds((prev) => new Set(prev).add(activeChapter.id));
      }
      appendZhi(
        `${evalResult.coachFeedback}${evalResult.passed ? '' : `\n回看：${evalResult.rewatchHint ?? '本章开头'}`}`,
        '视频陪看',
      );
      await finalizeVideoCheckpoint(
        userId,
        `视频·${context?.focusSubject ?? '综合'}`,
        `${activeChapter.title} ${Math.round(evalResult.masteryScore)}%`,
      );
      void loadContext();
      const sync = await syncChatTurnToCloud({
        userId,
        cognitiveDirId: activeId,
        focusTitle: activeDirectory?.title ?? null,
        userText: answer.trim(),
        attachSummary: `视频章节：${activeChapter.title}`,
        fileNames: [localName || urlInput || 'video'],
      });
      if (sync.ok) appendZhi(`已写入左侧「${sync.nodeHint ?? '云目录'}」。`, '归档');
      setActiveChapter(null);
      setCheckpointQ('');
      setCoachLine('');
      setAnswer('');
    } catch (e) {
      appendZhi(e instanceof Error ? e.message : '提交失败', '视频学习');
    } finally {
      setBusy(false);
    }
  }, [
    activeChapter,
    activeDirectory?.title,
    activeId,
    answer,
    appendZhi,
    courseId,
    effectiveTime,
    hasEmbed,
    localName,
    urlInput,
    chapters.length,
    checkpointQ,
    context?.focusSubject,
    loadContext,
    videoTitle,
    userId,
  ]);

  const onTimeUpdate = useCallback(() => {
    if (phase !== 'ready' || !videoRef.current || chapters.length === 0) return;
    const t = videoRef.current.currentTime;
    for (const ch of chapters) {
      if (triggeredRef.current.has(ch.id)) continue;
      if (t >= ch.video_timestamp_start && t < ch.video_timestamp_start + 2) {
        triggeredRef.current.add(ch.id);
        void openCheckpoint(ch);
        break;
      }
    }
  }, [chapters, openCheckpoint, phase]);

  useEffect(() => {
    if (phase !== 'ready' || !hasEmbed || chapters.length === 0) return;
    const t = effectiveTime;
    for (const ch of chapters) {
      if (triggeredRef.current.has(ch.id)) continue;
      if (t >= ch.video_timestamp_start && t < ch.video_timestamp_start + 2) {
        triggeredRef.current.add(ch.id);
        void openCheckpoint(ch);
        break;
      }
    }
  }, [chapters, effectiveTime, hasEmbed, openCheckpoint, phase]);

  const seekChapter = (ch: CourseNodeDto) => {
    if (videoRef.current) {
      videoRef.current.currentTime = ch.video_timestamp_start;
      videoRef.current.play().catch(() => {});
    }
    if (embedSource) {
      seekTo(ch.video_timestamp_start);
    }
    if (hasEmbed && !isYouTube) {
      void openCheckpoint(ch);
    }
  };

  const chapterList = useMemo(
    () => (
      <ul className="max-h-32 space-y-1 overflow-y-auto text-[10px]">
        {chapters.map((ch) => (
          <li key={ch.id}>
            <button
              type="button"
              onClick={() => seekChapter(ch)}
              className={`w-full rounded px-2 py-1 text-left hover:bg-gray-900 ${
                passedIds.has(ch.id)
                  ? 'text-[#00FF7F]'
                  : 'text-gray-400 hover:text-[#00FF7F]'
              }`}
            >
              {passedIds.has(ch.id) ? '✓ ' : ''}
              {formatTimestamp(ch.video_timestamp_start)} · {ch.title}
            </button>
          </li>
        ))}
      </ul>
    ),
    [chapters, passedIds],
  );

  return (
    <div className="space-y-3 text-[11px] text-gray-300">
      {context && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
          <p className="font-bold text-violet-200">{context.headline}</p>
          <p className="mt-1 text-[10px] text-gray-400">{context.zhiBrief}</p>
          <p className="mt-1 text-[9px] text-gray-600">{context.streakHint}</p>
        </div>
      )}

      {phase === 'idle' && (
        <>
          <motion.div className="flex gap-1 rounded-lg border border-gray-900 bg-black/40 p-0.5">
            <button
              type="button"
              onClick={() => setInputMode('recommend')}
              className={`flex-1 rounded-md py-1.5 text-[10px] font-bold ${
                inputMode === 'recommend' ? 'bg-violet-600 text-white' : 'text-gray-500'
              }`}
            >
              ✦ AI 匹配课件
            </button>
            <button
              type="button"
              onClick={() => setInputMode('manual')}
              className={`flex-1 rounded-md py-1.5 text-[10px] font-bold ${
                inputMode === 'manual' ? 'bg-gray-800 text-white' : 'text-gray-500'
              }`}
            >
              自备链接
            </button>
          </motion.div>

          {inputMode === 'recommend' && matchPack && (
            <motion.div className="space-y-3">
              {matchPack.textbookAlignments.length > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                  <p className="mb-2 text-[10px] font-bold text-emerald-300">📚 教材章节对齐推荐</p>
                  {matchPack.textbookAlignments.map((a) => (
                    <div
                      key={a.catalogId}
                      className={`mb-2 border-b border-gray-900 pb-2 last:mb-0 last:border-0 ${
                        highlightCatalogId === a.catalogId
                          ? 'rounded-lg border border-emerald-400/50 bg-emerald-500/10 p-2'
                          : ''
                      }`}
                    >
                      <p className="text-[10px] text-gray-300">
                        {a.textbookTitle} · 第{a.chapterIndex}章 {a.chapterTitle}
                      </p>
                      <p className="text-[8px] text-gray-600">
                        知识点：{a.knowledgePoints.slice(0, 4).join('、')}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {a.matches.slice(0, 2).map((m) => (
                          <li key={m.courseware.id}>
                            <button
                              type="button"
                              onClick={() => void startFromUrl(m.courseware.sourceUrl, m.courseware.title)}
                              className="w-full rounded border border-emerald-900/50 px-2 py-1 text-left text-[9px] text-emerald-200/90 hover:bg-emerald-500/10"
                            >
                              ▶ {m.courseware.title}（{m.matchScore}%）
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[10px] text-violet-200/90">{matchPack.needs.needSummary}</p>
              <p className="text-[9px] text-gray-600">
                标签体系：学科 · 知识点 · 梦校/考试对标 · 质量 S/A/B · 虫洞值
              </p>
              <ul className="max-h-52 space-y-2 overflow-y-auto">
                {matchPack.matches.map((m) => (
                  <li
                    key={m.courseware.id}
                    className={`rounded-xl border p-2.5 ${
                      selectedMatch?.courseware.id === m.courseware.id
                        ? 'border-violet-500/50 bg-violet-500/10'
                        : 'border-gray-900 bg-black/30'
                    }`}
                  >
                    <motion.div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-bold text-gray-100">{m.courseware.title}</p>
                        <p className="text-[9px] text-gray-500">
                          {m.courseware.instructor ?? m.courseware.platform} · {m.courseware.durationMin ?? '?'} 分钟
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-black ${
                          GRADE_COLOR[m.courseware.qualityGrade] ?? GRADE_COLOR.B
                        }`}
                      >
                        {m.courseware.qualityGrade}
                      </span>
                    </motion.div>
                    <p className="mt-1 text-[9px] text-violet-300/80">
                      匹配 {m.matchScore}% · {m.qualityHighlight}
                    </p>
                    <p className="mt-0.5 text-[9px] text-gray-500">{m.matchReasons.join(' · ')}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.courseware.topicTags.slice(0, 5).map((t) => (
                        <span key={t} className="rounded bg-gray-900 px-1 text-[8px] text-gray-500">
                          {t}
                        </span>
                      ))}
                    </div>
                    <details className="mt-1.5 text-[9px] text-gray-600">
                      <summary className="cursor-pointer text-gray-500">知识点 ({m.courseware.knowledgePoints.length})</summary>
                      <ul className="mt-1 space-y-0.5 pl-2">
                        {m.courseware.knowledgePoints.map((kp) => (
                          <li key={kp.id}>· {kp.name}</li>
                        ))}
                      </ul>
                    </details>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMatch(m);
                        void startFromUrl(m.courseware.sourceUrl, m.courseware.title);
                      }}
                      className="mt-2 w-full rounded-lg bg-violet-600 py-1.5 text-[10px] font-bold text-white"
                    >
                      开始学这门 · 匹配度 {m.matchScore}%
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {inputMode === 'manual' && (
            <>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="粘贴 B 站 / YouTube 链接"
            className="w-full rounded-lg border border-gray-900 bg-black px-3 py-2 text-xs text-white outline-none focus:border-[#00FF7F]/50"
          />
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg border border-gray-800 px-3 py-1.5 text-[10px] text-gray-400 hover:border-[#00FF7F]/40">
              本地视频
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickLocal(f);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              disabled={!urlInput.trim() && !hasLocal}
              onClick={() => void startSession()}
              className="rounded-lg bg-[#00FF7F] px-4 py-1.5 text-[10px] font-bold text-black disabled:opacity-40"
            >
              开始同化 · 生成章节
            </button>
          </div>
          {parsed?.kind === 'unknown' && urlInput.trim() && (
            <p className="text-[9px] text-amber-500/90">未识别平台；仍可尝试同化，或改用本地文件。</p>
          )}
          {hasLocal && localUrl && (
            <video ref={videoRef} src={localUrl} controls className="w-full rounded-lg border border-gray-900" />
          )}
            </>
          )}
        </>
      )}

      {phase === 'loading' && (
        <p className="text-[10px] text-gray-500">正在吞噬视频认知图谱…</p>
      )}

      {phase === 'ready' && (
        <>
          {grade && (
            <p className="text-[9px] text-gray-500">
              认知评级 {grade} · {chapters.length} 章
              {courseProgressPct > 0 ? ` · 已通过 ${courseProgressPct}%` : ''}
            </p>
          )}
          {chapters.length > 0 && (
            <ZhiProgressBar
              label="章节掌握"
              currentPct={courseProgressPct || Math.round((passedIds.size / chapters.length) * 100)}
              targetPct={100}
              displayCurrent={String(passedIds.size)}
              displayTarget={String(chapters.length)}
              unit="章"
              compact
            />
          )}

          {hasEmbed && parsed?.embedUrl && (
            <div className="space-y-2">
              <div className="aspect-video w-full overflow-hidden rounded-lg border border-gray-900 bg-black">
                {isYouTube ? (
                  <div ref={containerRef} className="h-full w-full" />
                ) : (
                  <iframe
                    title="video"
                    src={parsed.embedUrl}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                )}
              </div>
              {isYouTube && !embedReady && (
                <p className="text-[9px] text-gray-500">正在加载 YouTube 播放器…</p>
              )}
              {isBilibili && (
                <label className="block text-[9px] text-gray-500">
                  学习进度（秒）· 拖到章节起点可触发自动卡点
                  <input
                    type="range"
                    min={0}
                    max={Math.max(embedDuration, manualTime, 3600)}
                    step={1}
                    value={manualTime}
                    onChange={(e) => setManualTime(Number(e.target.value))}
                    className="mt-1 w-full accent-[#00FF7F]"
                  />
                  <span className="text-gray-400">{formatTimestamp(manualTime)}</span>
                </label>
              )}
            </div>
          )}

          {(hasLocal || !hasEmbed) && (
            <video
              ref={videoRef}
              src={localUrl ?? undefined}
              controls
              className="w-full rounded-lg border border-gray-900 bg-black"
              onTimeUpdate={onTimeUpdate}
            />
          )}

          {!hasLocal && hasEmbed && parsed?.kind === 'unknown' && (
            <p className="text-[9px] text-gray-500">未识别平台：点击下方章节手动触发 ZHI 提问。</p>
          )}

          {chapterList}

          {activeChapter && (
            <motion.div className="space-y-2 rounded-xl border border-[#00FF7F]/30 bg-[#00FF7F]/5 p-3">
              <p className="text-[10px] text-[#00FF7F]">
                卡点 · {activeChapter.title} ({formatTimestamp(activeChapter.video_timestamp_start)})
              </p>
              {coachLine && <p className="text-[9px] text-amber-200/90">{coachLine}</p>}
              <p className="text-xs text-gray-300 whitespace-pre-wrap">{checkpointQ}</p>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={3}
                placeholder="你的回答…"
                className="w-full rounded-lg border border-gray-900 bg-black p-2 text-xs text-white outline-none focus:border-[#00FF7F]/50"
              />
              <button
                type="button"
                disabled={busy || !answer.trim()}
                onClick={() => void submitAnswer()}
                className="w-full rounded-lg bg-[#00FF7F] py-2 text-[10px] font-bold text-black disabled:opacity-40"
              >
                提交陪看批改
              </button>
            </motion.div>
          )}

          {lastEval && !activeChapter && (
            <div className="rounded-lg border border-gray-800 bg-black/40 p-2 text-[10px]">
              <p className={lastEval.passed ? 'text-[#00FF7F]' : 'text-amber-400'}>
                掌握度 {Math.round(lastEval.masteryScore)}% · {lastEval.passed ? '通过' : '需加强'}
              </p>
              {lastEval.whatWorked.map((w) => (
                <p key={w} className="text-gray-500">
                  ✓ {w}
                </p>
              ))}
              <p className="text-gray-400">{lastEval.gapFix}</p>
            </div>
          )}
        </>
      )}

      {error && <p className="text-[10px] text-[#FF4500]">{error}</p>}

      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setShowPanel(showPanel === 'notes' ? null : 'notes')}
          className={`flex-1 rounded py-1.5 text-[9px] ${showPanel === 'notes' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30' : 'text-gray-500 border border-gray-900'}`}
        >
          📝 笔记
        </button>
        <button
          type="button"
          onClick={async () => {
            if (showPanel === 'review') { setShowPanel(null); return; }
            setShowPanel('review');
            try {
              const items = await fetchMistakesForRetry(userId, undefined, 5);
              setRetryItems(items);
            } catch { /* silently fail */ }
          }}
          className={`flex-1 rounded py-1.5 text-[9px] ${showPanel === 'review' ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30' : 'text-gray-500 border border-gray-900'}`}
        >
          🔄 间隔复习
        </button>
      </div>

      {showPanel === 'notes' && (
        <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2">
          <p className="text-[9px] uppercase tracking-widest text-cyan-300">学习笔记</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="记录你的理解、疑问或关键概念…"
            className="w-full rounded border border-gray-900 bg-black/50 px-2 py-1.5 text-[10px] text-white"
          />
          <div className="flex gap-1">
            <button
              type="button"
              className="flex-1 rounded bg-cyan-500/20 py-1 text-[9px] text-cyan-200"
              onClick={() => {
                if (!notes.trim()) return;
                setSavedNotes((n) => [notes.trim(), ...n].slice(0, 20));
                setNotes('');
                appendZhi(`📝 学习笔记：${notes.trim().slice(0, 100)}`, '视频学习');
              }}
            >
              保存笔记
            </button>
            {savedNotes.length > 0 && (
              <button
                type="button"
                className="rounded bg-gray-800 px-2 py-1 text-[9px] text-gray-500"
                onClick={() => setSavedNotes([])}
              >
                清空
              </button>
            )}
          </div>
          {savedNotes.length > 0 && (
            <ul className="space-y-1 max-h-24 overflow-y-auto">
              {savedNotes.map((n, i) => (
                <li key={i} className="text-[9px] text-gray-400 border-b border-gray-900 pb-1">
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showPanel === 'review' && (
        <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
          <p className="text-[9px] uppercase tracking-widest text-amber-300">间隔复习 · 待复习错题</p>
          {retryItems.length === 0 && (
            <p className="text-[9px] text-gray-500">暂无待复习错题</p>
          )}
          {retryItems.length > 0 && (
            <ul className="space-y-1">
              {retryItems.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-2 text-[9px]">
                  <span className="text-gray-300 flex-1">{m.questionText.slice(0, 50)}</span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      className="text-[#00FF7F] underline"
                      onClick={async () => {
                        await reviewMistake(userId, m.id, true);
                        setRetryItems((items) => items.filter((i) => i.id !== m.id));
                      }}
                    >
                      对
                    </button>
                    <button
                      type="button"
                      className="text-rose-400 underline"
                      onClick={async () => {
                        await reviewMistake(userId, m.id, false);
                      }}
                    >
                      错
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
