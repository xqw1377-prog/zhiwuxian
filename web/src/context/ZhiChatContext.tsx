import { authFetch, ensureAuthSession } from '../lib/api-auth';
import { fetchProactiveBrief, type ProactiveBriefDto } from '../lib/zhi-proactive-api';
import type { ProactivePushDto } from '../lib/zhi-proactive-push-api';
import type { DailyReviewDto } from '../lib/zhi-daily-review-api';
import { fetchDailyReview } from '../lib/zhi-daily-review-api';
import { fetchAnchorBrief } from '../lib/zhi-anchor-brief-api';
import { followUpAfterLearningEvidence } from '../lib/zhi-learning-followup';
import { processChatAttachments, uploadVoiceAudio } from '../lib/chat-upload';
import { analyzeVisionImage } from '../lib/zhi-vision-api';
import { buildQuickActions, type QuickAction } from '../lib/chat-quick-actions';
import { detectSchoolPathway, PATHWAY_LABEL } from '../lib/school-pathway';
import { ZHI_BASELINE_PHOTO_INVITE_SHORT } from '../lib/zhi-baseline-invite';
import { generateAssessmentPaper } from '../lib/zhi-assessment-api';
import { loadChatState, saveChatState } from '../lib/chat-persistence';
import { syncChatTurnToCloud } from '../lib/sync-chat-to-cloud';
import { unwrapEnvelope } from '../lib/api-envelope';
import {
  emitAnchorBrief,
  emitDailyReview,
  emitPickImage,
  emitProactiveBrief,
  emitVisionIntakePreview,
  emitWuxianEventUntyped,
  onWuxianEvent,
  onWuxianEventUntyped,
  WUXIAN_EVENTS,
} from '../lib/wuxian-events';
import { emitDirectoryWorkspaceRefresh } from '../lib/directory-workspace-api';
import { getTool, type ZhiToolId } from '../tools/zhi-tools';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useZhiDirectory } from './ZhiDirectoryContext';

export type ChatRole = 'user' | 'zhi';

export type ChatAttachment = {
  id: string;
  kind: 'image' | 'file' | 'video' | 'audio';
  name: string;
  file: File;
  previewUrl?: string;
};

export type DialogQuickAction = {
  id: string;
  label: string;
  toolId?: 'learning-assessment' | 'video-learn' | 'learning-path' | 'vision-intercept';
  /** 主动推送等场景：直接打开指定工具 */
  openToolId?: ZhiToolId;
  toolLaunch?: ToolLaunchOpts;
  replyToken?: string;
  assessmentSubjectId?: string;
  assessmentPaperId?: string;
  videoUrl?: string;
  videoTitle?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  at: number;
  toolHint?: string;
  dialogQuickActions?: DialogQuickAction[];
};

export type ReplyMode = 'fast' | 'deep';

export type ToolLaunchOpts = {
  assessmentTab?: 'subject' | 'standard' | 'daily' | 'mistake' | 'exam';
  assessmentSubjectId?: string;
  /** 对话触发的已生成试卷，直达作答页 */
  assessmentPaperId?: string;
  /** 打开梦校航标时直接进入编辑表单 */
  anchorEdit?: boolean;
  videoUrl?: string;
  videoTitle?: string;
  visionTab?: 'photo' | 'textbook' | 'solve';
};

type ZhiChatContextValue = {
  userId: string;
  messages: ChatMessage[];
  activeToolId: ZhiToolId | null;
  replyMode: ReplyMode;
  attachments: ChatAttachment[];
  busy: boolean;
  setReplyMode: (m: ReplyMode) => void;
  quickActions: QuickAction[];
  runQuickAction: (action: QuickAction) => void;
  runDialogQuickAction: (action: DialogQuickAction) => void;
  openTool: (id: ZhiToolId, opts?: { silent?: boolean; launch?: ToolLaunchOpts; anchorEdit?: boolean }) => void;
  closeTool: () => void;
  toolLaunch: ToolLaunchOpts | null;
  consumeToolLaunch: () => void;
  addFiles: (files: FileList | File[], opts?: { autoIngestImages?: boolean }) => void;
  removeAttachment: (id: string) => void;
  sendMessage: (text: string) => Promise<void>;
  appendZhi: (text: string, toolHint?: string) => void;
  ingestImageNow: (file: File) => Promise<void>;
  ingestVoiceBlob: (blob: Blob) => Promise<void>;
};

const ZhiChatContext = createContext<ZhiChatContextValue | null>(null);

/** 离开多久后回访主动简报（默认 2h，原 6h） */
const RETURN_VISIT_IDLE_MS = 2 * 60 * 60 * 1000;
/** 会话内周期性主动脉冲 */
const PROACTIVE_POLL_MS = 20 * 60 * 1000;
/** 两次主动消息最短间隔 */
const PROACTIVE_MIN_GAP_MS = 35 * 60 * 1000;
const ASSESSMENT_AUTOSTART_GAP_MS = 12 * 60 * 60 * 1000;
const PUSH_POLL_MS = 5 * 60 * 1000;

function uid(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function assessmentAutostartKey(userId: string): string {
  return `wuxian_assessment_autostart_${userId.trim()}`;
}

function assessmentAutostartDoneKey(userId: string): string {
  return `wuxian_assessment_autostart_done_${userId.trim()}`;
}

function assessmentAnchorHashKey(userId: string): string {
  return `wuxian_assessment_anchor_hash_${userId.trim()}`;
}

function computeAnchorHash(anchor: ReturnType<typeof useZhiDirectory>['anchorProfile']): string {
  if (!anchor) return '';
  const parts = [
    anchor.school,
    anchor.major,
    anchor.currentGrade,
    anchor.targetApplyAt,
    anchor.currentSchool,
    anchor.currentRegion,
    anchor.targetSchoolRegion,
  ]
    .map((s) => String(s ?? '').trim())
    .join('|');
  return parts;
}

function inferSubjectIdFromWeakText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/数学/.test(t)) return 'math';
  if (/物理/.test(t)) return 'phys';
  if (/化学/.test(t)) return 'chem';
  if (/SAT/i.test(t)) return 'sat';
  if (/托福|雅思|标化|英语/.test(t)) return 'toefl';
  return null;
}

function pickAssessmentSubjectId(brief: ProactiveBriefDto): string {
  const candidates = [
    ...(Array.isArray(brief.weakSubjects) ? brief.weakSubjects : []),
    brief.weakestSubject?.name ?? '',
  ]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);
  for (const c of candidates) {
    const id = inferSubjectIdFromWeakText(c);
    if (id) return id;
  }
  const p = String(brief.pathway ?? '').trim();
  if (p === 'us_intl') return 'toefl';
  return 'math';
}

function kindFromFile(file: File): ChatAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

function buildOpening(
  anchor: ReturnType<typeof useZhiDirectory>['anchorProfile'],
  focus: string | null,
): string {
  if (!anchor) {
    return [
      '智宝，我是 ZHI。',
      '你不需要先研究系统：我从你进来的这一刻就会主动规划。',
      '第一步：打开「梦校航标」选一个目标（大学梦校 / 校内成长 / 单科提分）。',
      '第二步：我会立刻告诉你“从哪一门课开始”，并把今天任务写成可交付清单。',
    ].join('\n');
  }
  const focusLine = focus ? `当前聚焦：${focus.replace(/^└\s*/, '').replace(/^　\s*└\s*/, '')}。` : '';
  const schoolLine = anchor.currentSchool
    ? `现就读 ${anchor.currentSchool}${anchor.currentRegion ? `（${anchor.currentRegion}）` : ''}。`
    : '请补全现就读学校与所在地，科目轨会更准。';
  const isK12 =
    anchor.school.includes('校内成长') ||
    /全校第一|全班第一|单科提升/.test(anchor.major) ||
    /小学|初一|初二|初三/.test(anchor.currentGrade);
  if (isK12) {
    return [
      `智宝，当前走【校内成长】：阶段目标 ${anchor.major}，${anchor.currentGrade}。不必先选大学。`,
      schoolLine,
      focusLine,
      '现在就开工：点快捷按钮「从数学开始」（或你主攻科）→ 发一张卷子/作业/错题页。',
      ZHI_BASELINE_PHOTO_INVITE_SHORT,
    ].filter(Boolean).join('\n');
  }
  const pathway = detectSchoolPathway(anchor.school, anchor.major, {
    currentSchool: anchor.currentSchool,
    currentRegion: anchor.currentRegion,
    targetSchoolRegion: anchor.targetSchoolRegion,
    currentGrade: anchor.currentGrade,
  });
  const intlSchool = /国际|外国语|双语|美高|ib|ap\s*班/i.test(anchor.currentSchool ?? '');
  const trackLine = intlSchool
    ? '课程轨：国际课程（AP/IB/A-Level 等），不会默认给你高考总复习卷。'
    : pathway === 'domestic_cn'
      ? `课程轨：${PATHWAY_LABEL.domestic_cn}（按你就读省份与年级对齐教材，如湖南高二用省卷题型）。`
      : `课程轨：${PATHWAY_LABEL[pathway] ?? '综合升学'}`;
  const starter = pathway === 'us_intl' ? '托福' : pathway === 'domestic_cn' ? '数学' : '数学';
  return [
    `智宝，航标是 ${anchor.school} · ${anchor.major}，${anchor.currentGrade}，目标 ${anchor.targetApplyAt} 入学。`,
    schoolLine,
    trackLine,
    `现在就开工：点快捷按钮「从${starter}开始」→ 发一张卷子/错题/教材目录页，我会自动生成 7 天任务清单。`,
    focusLine,
    ZHI_BASELINE_PHOTO_INVITE_SHORT,
  ].filter(Boolean).join('\n');
}

export function ZhiChatProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const { anchorProfile, activeDirectory, activeId } = useZhiDirectory();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeToolId, setActiveToolId] = useState<ZhiToolId | null>(null);
  const [toolLaunch, setToolLaunch] = useState<ToolLaunchOpts | null>(null);
  const [replyMode, setReplyMode] = useState<ReplyMode>('fast');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const lastProactiveAtRef = useRef(0);
  const proactivePulseLockRef = useRef(false);
  const pushProactiveNudgeRef = useRef<
    ((scene: 'return_visit' | 'session_open' | 'daily_review' | 'anchor_wake') => Promise<void>) | null
  >(null);

  const focusTitle = activeDirectory?.title ?? null;

  const lastProactiveMessageAt = useCallback((list: ChatMessage[]) => {
    let max = 0;
    for (const m of list) {
      if (m.role === 'zhi' && m.toolHint?.startsWith('主动')) {
        max = Math.max(max, m.at);
      }
    }
    return max;
  }, []);

  const appendZhi = useCallback(
    (text: string, toolHint?: string, dialogQuickActions?: DialogQuickAction[]) => {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'zhi', text, at: Date.now(), toolHint, dialogQuickActions },
      ]);
    },
    [],
  );

  const openTool = useCallback(
    (id: ZhiToolId, opts?: { silent?: boolean; launch?: ToolLaunchOpts; anchorEdit?: boolean }) => {
      if (opts?.launch || opts?.anchorEdit) {
        setToolLaunch({
          ...(opts.launch ?? {}),
          ...(opts.anchorEdit ? { anchorEdit: true } : {}),
        });
      }
      if (id === 'causal-report') {
        setActiveToolId('causal-report');
        return;
      }
      setActiveToolId(id);
      if (opts?.silent) return;
      const t = getTool(id);
      if (t) appendZhi(`已打开工具「${t.label}」。${t.description}`, t.label);
    },
    [appendZhi],
  );

  const consumeToolLaunch = useCallback(() => setToolLaunch(null), []);

  const closeTool = useCallback(() => {
    setActiveToolId(null);
    setToolLaunch(null);
  }, []);

  const quickActions = useMemo(
    () => buildQuickActions(anchorProfile, activeDirectory),
    [anchorProfile, activeDirectory],
  );

  const runQuickAction = useCallback(
    (action: QuickAction) => {
      if (action.id === 'report') {
        openTool('causal-report');
        return;
      }
      if (action.id === 'baseline') {
        openTool('vision-intercept');
        return;
      }
      if (action.id === 'anchor-edit') {
        openTool('anchor', { silent: true, anchorEdit: true });
        return;
      }
      if (action.pickImage) {
        if (action.toolId) openTool(action.toolId, { silent: true });
        emitPickImage();
        return;
      }
      if (action.toolId) openTool(action.toolId);
    },
    [openTool],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((p) => {
      const hit = p.find((a) => a.id === id);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return p.filter((a) => a.id !== id);
    });
  }, []);

  const runLearningFollowUp = useCallback(
    async (
      input: { kind: 'vision' | 'chat' | 'archive' | 'voice'; label?: string; excerpt?: string },
    ) => {
      if (!anchorProfile?.school) return;
      const { review, activeExam } = await followUpAfterLearningEvidence(userId, {
        ...input,
        forceDailyReview: true,
      });
      if (activeExam?.paperId) {
        appendZhi(
          `【有学必考】已生成主动验收卷「${activeExam.title}」（${activeExam.questionCount ?? '?'} 题）。请立即在「学习评估」作答。`,
          '学习评估',
        );
        openTool('learning-assessment', {
          silent: true,
          launch: {
            assessmentTab: 'subject',
            assessmentSubjectId: activeExam.subjectId,
            assessmentPaperId: activeExam.paperId,
          },
        });
      }
      if (review) {
        const ab = await fetchAnchorBrief(userId);
        if (ab) {
          emitAnchorBrief(ab);
        }
        appendZhi(
          `【差距重算】已根据新档案修正今日 P0/P1，左侧分科进度与倒计时已同步。`,
          '归档回响',
        );
        emitDirectoryWorkspaceRefresh();
        void pushProactiveNudgeRef.current?.('daily_review');
      }
    },
    [anchorProfile?.school, appendZhi, openTool, userId],
  );

  useEffect(() => {
    return onWuxianEvent(WUXIAN_EVENTS.assessmentReady, (detail) => {
      if (!detail?.paperId) return;
      openTool('learning-assessment', {
        silent: true,
        launch: {
          assessmentTab: 'subject',
          assessmentSubjectId: detail.subjectId,
          assessmentPaperId: detail.paperId,
        },
      });
    });
  }, [openTool]);

  const archiveToCloud = useCallback(
    async (userText: string, attachSummary: string, fileNames: string[]) => {
      if (!attachSummary && !fileNames.length && userText.length < 8) return;
      const sync = await syncChatTurnToCloud({
        userId,
        cognitiveDirId: activeId,
        focusTitle: focusTitle,
        userText,
        attachSummary,
        fileNames,
      });
      if (sync.ok) {
        appendZhi(`本轮内容已写入左侧「${sync.nodeHint ?? '云目录'}」。`, '归档');
        const hasMedia = fileNames.some((n) => /\.(jpe?g|png|webp|gif|pdf)$/i.test(n));
        void runLearningFollowUp({
          kind: hasMedia ? 'vision' : attachSummary ? 'chat' : 'archive',
          label: fileNames[0],
          excerpt: [userText, attachSummary].filter(Boolean).join('\n').slice(0, 400),
        });
      } else if (fileNames.length > 0 || attachSummary) {
        appendZhi(sync.error ?? '云归档未完成，可稍后在梦校航标中重试。', '归档');
      }
    },
    [activeId, appendZhi, focusTitle, runLearningFollowUp, userId],
  );

  const ingestImageNow = useCallback(
    async (file: File) => {
      setBusy(true);
      openTool('vision-intercept');
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'user', text: `（照片）${file.name}`, at: Date.now() },
      ]);
      try {
        const result = await analyzeVisionImage(userId, file);
        emitVisionIntakePreview(result);
        appendZhi(result.chatText, '摄影拦截 · 待确认');
      } catch (e) {
        appendZhi(e instanceof Error ? e.message : '图片解析失败', '摄影拦截');
      } finally {
        setBusy(false);
      }
    },
    [appendZhi, openTool, userId],
  );

  const ingestVoiceBlob = useCallback(
    async (blob: Blob | File) => {
      setBusy(true);
      try {
        const v = await uploadVoiceAudio(userId, blob);
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: 'user', text: '（语音）', at: Date.now() },
        ]);
        const body = [v.rawSpeechText, v.weaverResponse].filter(Boolean).join('\n\n');
        appendZhi(body, '语音');
        await archiveToCloud('', body, ['voice.webm']);
      } catch (e) {
        appendZhi(e instanceof Error ? e.message : '语音解析失败', '语音');
      } finally {
        setBusy(false);
      }
    },
    [appendZhi, archiveToCloud, userId],
  );

  const addFiles = useCallback(
    (files: FileList | File[], opts?: { autoIngestImages?: boolean }) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      const autoVision = opts?.autoIngestImages !== false;
      const images = list.filter((f) => f.type.startsWith('image/'));
      const rest = list.filter((f) => !f.type.startsWith('image/'));

      if (autoVision && images.length === 1 && rest.length === 0) {
        void ingestImageNow(images[0]);
        return;
      }

      if (autoVision && images.length > 0) {
        for (const img of images) void ingestImageNow(img);
      }

      if (rest.length === 1 && rest[0].type.startsWith('audio/')) {
        void ingestVoiceBlob(rest[0]);
        return;
      }

      if (rest.length > 0) {
        const next: ChatAttachment[] = rest.map((f) => ({
          id: uid(),
          kind: kindFromFile(f),
          name: f.name,
          file: f,
          previewUrl: undefined,
        }));
        setAttachments((p) => [...p, ...next]);

        const hasVideo = rest.some((f) => f.type.startsWith('video/'));
        const hasAudio = rest.some((f) => f.type.startsWith('audio/'));
        if (hasVideo) openTool('video-learn');
        else if (hasAudio) openTool('language-coach');
      }
    },
    [ingestImageNow, ingestVoiceBlob, openTool],
  );

  useEffect(() => {
    if (messages.length > 0) {
      saveChatState(userId, messages, replyMode);
    }
  }, [messages, replyMode, userId]);

  const emitAnchorBriefFromProactive = useCallback(
    (brief: ProactiveBriefDto) => {
      if (!brief.dynamicMilestones?.length) return;
      void (async () => {
        let metrics: Record<string, unknown> = { ...(brief.requiredMetrics ?? {}) };
        let pathway = brief.pathway;
        let pathwayLabel = brief.pathwayLabel;
        if (Object.keys(metrics).length === 0 || !pathway) {
          const full = await fetchAnchorBrief(userId);
          if (full) {
            if (Object.keys(metrics).length === 0) metrics = full.requiredMetrics;
            pathway = pathway ?? full.pathway;
            pathwayLabel = pathwayLabel ?? full.pathwayLabel;
          }
        }
        emitAnchorBrief({
          daysRemaining: brief.daysRemaining ?? 0,
          challengeIndex: brief.challengeIndex ?? 0,
          requiredMetrics: metrics,
          dynamicMilestones: brief.dynamicMilestones,
          pathway,
          pathwayLabel,
        });
      })();
    },
    [userId],
  );

  const applyProactiveBrief = useCallback(
    (brief: ProactiveBriefDto, daily?: DailyReviewDto | null) => {
      const text = [brief.chatText, brief.zhiTip].filter(Boolean).join('\n\n');
      emitProactiveBrief(brief);
      const review = daily ?? brief.dailyReview ?? null;
      if (review) {
        emitDailyReview(review);
      }
      emitAnchorBriefFromProactive(brief);
      if (brief.activatedTool === 'VISION_INTERCEPT') openTool('vision-intercept', { silent: true });
      if (brief.activatedTool === 'METRICS_INPUT') openTool('causal-report', { silent: true });
      if (brief.activatedTool === 'LEARNING_PATH') openTool('learning-path', { silent: true });
      lastProactiveAtRef.current = Date.now();
      return text;
    },
    [emitAnchorBriefFromProactive, openTool],
  );

  const autoStartAssessmentIfNeeded = useCallback(
    async (brief: ProactiveBriefDto) => {
      if (brief.activatedTool !== 'LEARNING_ASSESSMENT') return;
      if (busy) return;

      const anchorHash = computeAnchorHash(anchorProfile);
      const storedAnchorHash = localStorage.getItem(assessmentAnchorHashKey(userId)) ?? '';
      if (anchorHash && anchorHash !== storedAnchorHash) {
        localStorage.removeItem(assessmentAutostartDoneKey(userId));
        localStorage.removeItem(assessmentAutostartKey(userId));
        localStorage.setItem(assessmentAnchorHashKey(userId), anchorHash);
      }

      if (brief.assessmentPaperId) {
        openTool('learning-assessment', {
          silent: true,
          launch: {
            assessmentTab: 'subject',
            assessmentPaperId: brief.assessmentPaperId,
            assessmentSubjectId: brief.assessmentSubjectId,
          },
        });
        localStorage.setItem(assessmentAutostartDoneKey(userId), '1');
        return;
      }

      const doneKey = assessmentAutostartDoneKey(userId);
      const done = localStorage.getItem(doneKey) === '1';
      if (done) {
        openTool('learning-assessment', { silent: true, launch: { assessmentTab: 'subject' } });
        return;
      }

      const key = assessmentAutostartKey(userId);
      const last = Number(localStorage.getItem(key) ?? '0');
      if (Number.isFinite(last) && last > 0 && Date.now() - last < ASSESSMENT_AUTOSTART_GAP_MS) {
        openTool('learning-assessment', { silent: true, launch: { assessmentTab: 'subject' } });
        return;
      }

      await ensureAuthSession(userId);
      const subjectId = pickAssessmentSubjectId(brief);
      const paper = await generateAssessmentPaper(userId, {
        subjectId,
        adaptive: true,
        userHint: `主动摸底评估·${subjectId}`,
      });
      localStorage.setItem(key, String(Date.now()));
      localStorage.setItem(doneKey, '1');
      openTool('learning-assessment', {
        silent: true,
        launch: { assessmentTab: 'subject', assessmentSubjectId: subjectId, assessmentPaperId: paper.id },
      });
      appendZhi(`【摸底评估】已生成 ${paper.subjectName} 摸底卷，直接作答。`, '学习评估');
    },
    [anchorProfile, appendZhi, busy, openTool, userId],
  );

  const hydrateDailyReviewIfNeeded = useCallback(async () => {
    if (!anchorProfile?.school) return;
    const pack = await fetchDailyReview(userId);
    if (pack?.review) {
      emitDailyReview(pack.review);
    }
  }, [anchorProfile?.school, userId]);

  const pushProactiveNudge = useCallback(
    async (scene: 'return_visit' | 'session_open' | 'daily_review' | 'anchor_wake') => {
      if (!anchorProfile?.school || busy || proactivePulseLockRef.current) return;
      const gap = Date.now() - Math.max(lastProactiveAtRef.current, lastProactiveMessageAt(messages));
      if (gap < PROACTIVE_MIN_GAP_MS) return;

      proactivePulseLockRef.current = true;
      try {
        await ensureAuthSession(userId);
        const brief = await fetchProactiveBrief(userId, scene, { focusDirectoryId: activeId });
        if (!brief) return;
        const text = applyProactiveBrief(brief, brief.dailyReview ?? null);
        if (!brief.dailyReview) void hydrateDailyReviewIfNeeded();
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'zhi',
            text,
            at: Date.now(),
            toolHint: `主动 · ${brief.activeModeLabel}`,
          },
        ]);
        void autoStartAssessmentIfNeeded(brief);
      } finally {
        proactivePulseLockRef.current = false;
      }
    },
    [
      activeId,
      anchorProfile?.school,
      applyProactiveBrief,
      autoStartAssessmentIfNeeded,
      busy,
      hydrateDailyReviewIfNeeded,
      lastProactiveMessageAt,
      messages,
      userId,
    ],
  );

  useEffect(() => {
    pushProactiveNudgeRef.current = pushProactiveNudge;
  }, [pushProactiveNudge]);

  useEffect(() => {
    if (booted) return;
    setBooted(true);

    const saved = loadChatState(userId);
    if (saved && saved.messages.length > 0) {
      setMessages(saved.messages);
      setReplyMode(saved.replyMode);
      const lastAt = saved.messages[saved.messages.length - 1]?.at ?? 0;
      lastProactiveAtRef.current = lastProactiveMessageAt(saved.messages);
      if (Date.now() - lastAt > RETURN_VISIT_IDLE_MS) {
        void (async () => {
          await ensureAuthSession(userId);
          const brief = await fetchProactiveBrief(userId, 'return_visit', {
            focusDirectoryId: activeId,
          });
          if (!brief) return;
          const text = applyProactiveBrief(brief, brief.dailyReview ?? null);
          if (!brief.dailyReview) void hydrateDailyReviewIfNeeded();
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: 'zhi',
              text,
              at: Date.now(),
              toolHint: `主动 · ${brief.activeModeLabel}`,
            },
          ]);
          void autoStartAssessmentIfNeeded(brief);
        })();
      }
      return;
    }

    void (async () => {
      await ensureAuthSession(userId);
      const brief = await fetchProactiveBrief(userId, 'session_open', {
        focusDirectoryId: activeId,
      });
      if (brief) {
        const text = applyProactiveBrief(brief, brief.dailyReview ?? null);
        if (!brief.dailyReview) void hydrateDailyReviewIfNeeded();
        setMessages([
          {
            id: uid(),
            role: 'zhi',
            text,
            at: Date.now(),
            toolHint: `主动 · ${brief.activeModeLabel}`,
          },
        ]);
        void autoStartAssessmentIfNeeded(brief);
        return;
      }
      const opening = buildOpening(anchorProfile, focusTitle);
      setMessages([{ id: uid(), role: 'zhi', text: opening, at: Date.now() }]);
    })();
  }, [activeId, applyProactiveBrief, autoStartAssessmentIfNeeded, booted, hydrateDailyReviewIfNeeded, lastProactiveMessageAt, userId, anchorProfile, focusTitle]);

  useEffect(() => {
    if (!booted || !anchorProfile?.school || !activeId) return;
    const t = window.setTimeout(() => {
      void pushProactiveNudge('return_visit');
    }, 800);
    return () => window.clearTimeout(t);
  }, [activeId, anchorProfile?.school, booted, pushProactiveNudge]);

  useEffect(() => {
    if (!booted || !anchorProfile?.school) return;
    const timer = window.setInterval(() => {
      void pushProactiveNudge('return_visit');
    }, PROACTIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [anchorProfile?.school, booted, pushProactiveNudge]);

  // 每 5 分钟拉取主动推送（错题复习、计划、重考等）
  const seenPushSignaturesRef = useRef(new Set<string>());
  useEffect(() => {
    if (!booted || !anchorProfile?.school) return;
    const poll = async () => {
      try {
        const { fetchProactivePush } = await import('../lib/zhi-proactive-push-api');
        const push = await fetchProactivePush(userId);
        const { buildProactivePushQuickActions } = await import('../lib/zhi-proactive-push-actions');
        for (const item of push.items) {
          const sig = `${item.type}:${item.title}`;
          if (seenPushSignaturesRef.current.has(sig)) continue;
          seenPushSignaturesRef.current.add(sig);
          const quickActions = buildProactivePushQuickActions(item);
          const text = `🔔 ${item.title}\n${item.body}`;
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: 'zhi',
              text,
              at: Date.now(),
              toolHint: '学习提醒',
              dialogQuickActions: quickActions.length ? quickActions : undefined,
            },
          ]);
        }
      } catch { /* silently fail */ }
    };
    const timer = window.setInterval(poll, PUSH_POLL_MS);
    poll();
    return () => { window.clearInterval(timer); seenPushSignaturesRef.current.clear(); };
  }, [booted, anchorProfile?.school, userId, setMessages]);

  useEffect(() => {
    return onWuxianEventUntyped(WUXIAN_EVENTS.openTool, (detail) => {
      const d = detail as { toolId?: ZhiToolId; silent?: boolean; anchorEdit?: boolean } | undefined;
      if (d?.toolId) openTool(d.toolId, { silent: d.silent, anchorEdit: d.anchorEdit });
    });
  }, [openTool]);

  useEffect(() => {
    return onWuxianEventUntyped(WUXIAN_EVENTS.closeTool, () => closeTool());
  }, [closeTool]);

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      const pending = attachmentsRef.current;
      if (!text && pending.length === 0) return;

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'user',
          text: text || `（${pending.map((a) => a.name).join('、')}）`,
          at: Date.now(),
        },
      ]);

      const files = pending.map((a) => a.file);
      setAttachments([]);
      setBusy(true);

      try {
        let attachContext = '';
        if (files.length > 0) {
          const summary = await processChatAttachments(userId, files, text, replyMode);
          attachContext = summary.lines.join('\n\n');
          if (summary.suggestedTool) openTool(summary.suggestedTool);
        }

        const payload = [text, attachContext].filter(Boolean).join('\n\n');

        const res = await authFetch('/api/v3.5/zhi/intrusion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            userFeedback: payload || attachContext,
            focusDirectoryId: activeId ?? undefined,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const err = (json ?? {}) as { error?: string; message?: string };
          appendZhi(err.error || err.message || 'ZHI 信号中断，请稍后再试。');
          return;
        }
        const d = unwrapEnvelope<{
          zhiOpening?: string;
          zhiTip?: string;
          zhiCoachNote?: string;
          mentorText?: string;
          activatedTool?: string;
          assessmentPaperId?: string;
          assessmentSubjectId?: string;
          videoUrl?: string;
          videoTitle?: string;
          dialogQuickActions?: DialogQuickAction[];
        }>(json);
        const parts =
          d.mentorText?.trim() ||
          [d.zhiOpening, d.zhiTip, d.zhiCoachNote].filter(Boolean).join('\n\n');
        const dialogActions = (d.dialogQuickActions ?? []).map((a) => ({
          ...a,
          toolId: a.toolId as DialogQuickAction['toolId'],
        }));
        appendZhi(parts || '收到。继续。', undefined, dialogActions.length ? dialogActions : undefined);

        if (d.activatedTool === 'VISION_INTERCEPT') openTool('vision-intercept', { silent: true });
        if (d.activatedTool === 'METRICS_INPUT') openTool('causal-report', { silent: true });
        if (d.activatedTool === 'LEARNING_ASSESSMENT') {
          openTool('learning-assessment', {
            silent: true,
            launch: {
              assessmentTab: 'subject',
              assessmentSubjectId: d.assessmentSubjectId,
              assessmentPaperId: d.assessmentPaperId,
            },
          });
        }
        if (d.activatedTool === 'LEARNING_PATH') {
          openTool('learning-path', { silent: true });
        }
        if (d.activatedTool === 'VIDEO_LEARN' && d.videoUrl) {
          openTool('video-learn', { silent: true });
          emitWuxianEventUntyped(WUXIAN_EVENTS.videoLearnStart, {
            sourceUrl: d.videoUrl,
            title: d.videoTitle,
          });
        }

        await archiveToCloud(text, attachContext, files.map((f) => f.name));
      } catch {
        appendZhi('网络波动，但我还在。你可以重试或换一个工具。');
      } finally {
        setBusy(false);
      }
    },
    [activeId, appendZhi, archiveToCloud, openTool, replyMode, userId],
  );

  const runDialogQuickAction = useCallback(
    (action: DialogQuickAction) => {
      if (action.replyToken?.trim()) {
        void sendMessage(action.replyToken);
        return;
      }
      if (action.openToolId) {
        openTool(action.openToolId, {
          silent: true,
          launch: action.toolLaunch ?? undefined,
        });
        return;
      }
      if (action.toolId === 'learning-assessment') {
        openTool('learning-assessment', {
          silent: true,
          launch: {
            assessmentTab: 'subject',
            assessmentSubjectId: action.assessmentSubjectId,
            assessmentPaperId: action.assessmentPaperId,
          },
        });
        return;
      }
      if (action.toolId === 'video-learn' && action.videoUrl) {
        openTool('video-learn', { silent: true });
        emitWuxianEventUntyped(WUXIAN_EVENTS.videoLearnStart, {
          sourceUrl: action.videoUrl,
          title: action.videoTitle,
        });
        return;
      }
      if (action.toolId === 'learning-path') {
        openTool('learning-path', { silent: true });
        return;
      }
      if (action.toolId === 'vision-intercept') {
        openTool('vision-intercept', { silent: true });
      }
    },
    [openTool, sendMessage],
  );

  const value = useMemo<ZhiChatContextValue>(
    () => ({
      userId,
      messages,
      activeToolId,
      replyMode,
      attachments,
      busy,
      quickActions,
      runQuickAction,
      runDialogQuickAction,
      setReplyMode,
      openTool,
      closeTool,
      toolLaunch,
      consumeToolLaunch,
      addFiles,
      removeAttachment,
      sendMessage,
      appendZhi,
      ingestImageNow,
      ingestVoiceBlob,
    }),
    [
      messages,
      activeToolId,
      toolLaunch,
      replyMode,
      attachments,
      busy,
      quickActions,
      runQuickAction,
      runDialogQuickAction,
      userId,
      openTool,
      closeTool,
      toolLaunch,
      consumeToolLaunch,
      addFiles,
      removeAttachment,
      sendMessage,
      appendZhi,
      ingestImageNow,
      ingestVoiceBlob,
    ],
  );

  return <ZhiChatContext.Provider value={value}>{children}</ZhiChatContext.Provider>;
}

export function useZhiChat(): ZhiChatContextValue {
  const ctx = useContext(ZhiChatContext);
  if (!ctx) throw new Error('useZhiChat must be used within ZhiChatProvider');
  return ctx;
}
