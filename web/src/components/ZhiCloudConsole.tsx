import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { authFetch, ensureAuthSession, parseApiErrorMessage } from '../lib/api-auth';
import { useZhiDirectory } from '../context/ZhiDirectoryContext';
import { hasConfiguredAnchor, isAnchorSessionDone, markAnchorSessionDone } from '../lib/anchor-session';
import { goCockpitHome } from '../lib/go-cockpit-home';
import { unwrapEnvelope } from '../lib/api-envelope';
import {
  emitAnchorBrief,
  emitDirectoryWorkspaceRefresh,
  onWuxianEvent,
  onWuxianEventUntyped,
  WUXIAN_EVENTS,
} from '../lib/wuxian-events';
import {
  buildK12AnchorFields,
  inferTargetSchoolRegion,
  isK12StageAnchor,
  type K12GoalType,
} from '../lib/school-pathway';
import { fetchDataGaps, type DataGapsDto } from '../lib/zhi-planner-api';

type Dir = {
  dirId: string;
  targetSchool: string;
  targetMajor: string;
  nodeName: string;
  nodeType: string;
  cloudSyncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  storageUrl: string | null;
  updatedAt: number;
};

type Artifact = {
  artifactId: string;
  dirId: string;
  fileTitle: string;
  versionTag: string;
  cloudKey: string;
  cdnUrl: string | null;
  cloudSyncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  syncTimestamp: number;
};

function syncLabel(status: Dir['cloudSyncStatus']): string {
  if (status === 'SYNCED') return 'SYNCED';
  if (status === 'FAILED') return 'FAILED';
  return 'LOCAL';
}

const COLLEGE_GRADE_OPTIONS = ['初三', '高一', '高二', '高三', '高三(Gap)', '大一', '大二', '大三', '大四'] as const;
const K12_GRADE_OPTIONS = [
  '小学三年级',
  '小学四年级',
  '小学五年级',
  '小学六年级',
  '初一',
  '初二',
  '初三',
] as const;
const K12_SUBJECT_OPTIONS = ['数学', '语文', '英语', '科学'] as const;
type AnchorMode = 'college' | 'k12';

type AnchorProfile = {
  school: string;
  major: string;
  currentGrade: string;
  targetApplyAt: string;
  currentSchool: string;
  currentRegion: string;
  targetSchoolRegion: string;
};

function defaultTargetApplyAt(): string {
  const d = new Date();
  const y = d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
  return `${y}-09`;
}

function profileIsK12Anchor(profile: AnchorProfile): boolean {
  return (
    profile.school === '校内成长目标' ||
    isK12StageAnchor(profile.school, profile.major, profile.currentGrade)
  );
}

export function ZhiCloudConsole({
  userId,
  compact = false,
  openInEditMode = false,
  onConsumeEditIntent,
  onAfterWake,
}: {
  userId: string;
  compact?: boolean;
  /** 由 openTool(anchor, { anchorEdit: true }) 触发，保证挂载后进入编辑表单 */
  openInEditMode?: boolean;
  onConsumeEditIntent?: () => void;
  onAfterWake?: (
    anchorDirectoryId?: string,
    anchorBrief?: {
      chatText: string;
      daysRemaining: number;
      challengeIndex: number;
      timelineMilestones: unknown[];
      dynamicMilestones: unknown[];
      requiredMetrics: Record<string, unknown>;
    } | null,
  ) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [school, setSchool] = useState('清华大学');
  const [major, setMajor] = useState('计算机');
  const [currentGrade, setCurrentGrade] = useState<string>('高三');
  const [targetApplyAt, setTargetApplyAt] = useState(defaultTargetApplyAt);
  const [currentSchool, setCurrentSchool] = useState('');
  const [currentRegion, setCurrentRegion] = useState('');
  const [targetSchoolRegion, setTargetSchoolRegion] = useState('北京');
  const [anchorMode, setAnchorMode] = useState<AnchorMode>('college');
  const [k12GoalType, setK12GoalType] = useState<K12GoalType>('school_top');
  const [k12Subject, setK12Subject] = useState<string>('数学');
  const [isGenerating, setIsGenerating] = useState(false);
  const [dirs, setDirs] = useState<Dir[]>([]);
  const [, setArtifacts] = useState<Artifact[]>([]);
  const [syncLogs, setSyncLogs] = useState<string[]>([
    t('cloudConsole.cloudReady'),
  ]);
  const [collapsed, setCollapsed] = useState(true);
  const [anchorReady, setAnchorReady] = useState(false);
  const [dataGaps, setDataGaps] = useState<DataGapsDto | null>(null);
  const [compactStatus, setCompactStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; text: string }>({
    kind: 'idle',
    text: '',
  });
  const { activeId, refreshDirectories, anchorProfile: ctxAnchor } = useZhiDirectory();
  const anchorConfigured = hasConfiguredAnchor(ctxAnchor) || anchorReady;
  const [formExpanded, setFormExpanded] = useState(() => !hasConfiguredAnchor(ctxAnchor));
  const editIntentRef = useRef(false);
  const formExpandedRef = useRef(formExpanded);
  const editHydratedRef = useRef(false);

  const markAnchorEditing = () => {
    editIntentRef.current = true;
  };

  const applyProfileToForm = (profile: AnchorProfile) => {
    if (profile.school) setSchool(profile.school);
    if (profile.major) setMajor(profile.major);
    if (profile.currentGrade) setCurrentGrade(profile.currentGrade);
    if (profile.targetApplyAt) setTargetApplyAt(profile.targetApplyAt);
    if (profile.currentSchool) setCurrentSchool(profile.currentSchool);
    if (profile.currentRegion) setCurrentRegion(profile.currentRegion);
    if (profile.targetSchoolRegion) {
      setTargetSchoolRegion(profile.targetSchoolRegion);
    } else if (profile.school) {
      const inferred = inferTargetSchoolRegion(profile.school);
      if (inferred) setTargetSchoolRegion(inferred);
    }
    if (profileIsK12Anchor(profile)) {
      setAnchorMode('k12');
      if (/单科/.test(profile.major)) {
        setK12GoalType('subject_boost');
        const subj = profile.major.match(/单科提升[·:]\s*([^\s+]+)/)?.[1];
        if (subj) setK12Subject(subj);
      } else {
        setK12GoalType('school_top');
      }
    } else {
      setAnchorMode('college');
    }
  };

  useEffect(() => {
    formExpandedRef.current = formExpanded;
    if (!formExpanded) editHydratedRef.current = false;
  }, [formExpanded]);

  const selectedDir = useMemo(
    () => dirs.find((d) => d.nodeType === 'ESSAY_ESSENTIAL') ?? dirs[0],
    [dirs],
  );

  useEffect(() => {
    if (!openInEditMode) return;
    markAnchorEditing();
    setFormExpanded(true);
    onConsumeEditIntent?.();
  }, [openInEditMode, onConsumeEditIntent]);

  useEffect(() => {
    if (!formExpanded || !editIntentRef.current || editHydratedRef.current) return;
    if (!ctxAnchor?.school?.trim()) return;
    applyProfileToForm(ctxAnchor);
    editHydratedRef.current = true;
  }, [formExpanded, ctxAnchor]);

  useEffect(() => {
    if (!hasConfiguredAnchor(ctxAnchor)) setFormExpanded(true);
  }, [ctxAnchor?.school]);

  useEffect(() => {
    const collapse = () => setCollapsed(true);
    const u1 = onWuxianEvent(WUXIAN_EVENTS.showAnchor, (detail) => {
      setCollapsed(false);
      if (detail?.edit) {
        markAnchorEditing();
        editHydratedRef.current = false;
        setFormExpanded(true);
      } else if (!hasConfiguredAnchor(ctxAnchor)) {
        editIntentRef.current = false;
        setFormExpanded(true);
      } else {
        editIntentRef.current = false;
        setFormExpanded(false);
      }
    });
    const u2 = onWuxianEventUntyped(WUXIAN_EVENTS.enterCockpit, collapse);
    const u3 = onWuxianEventUntyped(WUXIAN_EVENTS.hideOverlays, collapse);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [ctxAnchor]);

  const refreshState = async () => {
    const res = await authFetch(`/api/v3.5/cloud/state/${encodeURIComponent(userId)}`);
    const json = await res.json().catch(() => null);
    if (!res.ok) return;
    const d = unwrapEnvelope<{
      directories: Dir[];
      artifacts: Artifact[];
      anchorProfile?: AnchorProfile | null;
    }>(json);
    setDirs(d.directories ?? []);
    setArtifacts(d.artifacts ?? []);
    const profile = d.anchorProfile;
    const userEditing = formExpandedRef.current && editIntentRef.current;
    if (profile) {
      setAnchorReady(true);
      if (!userEditing) {
        applyProfileToForm(profile);
      }
    } else if ((d.directories?.length ?? 0) > 0) {
      setAnchorReady(true);
      const first = d.directories![0];
      if (first?.targetSchool) setSchool(first.targetSchool);
      if (first?.targetMajor) setMajor(first.targetMajor);
    }
  };

  useEffect(() => {
    void refreshState().then(() => refreshDirectories());
    void fetchDataGaps(userId).then(setDataGaps).catch(() => {});
    const t = window.setInterval(() => {
      void refreshState().then(() => refreshDirectories());
    }, 12000);
    return () => window.clearInterval(t);
  }, [userId, refreshDirectories]);

  const enterHome = (activeDirectoryId?: string) => {
    markAnchorSessionDone();
    editIntentRef.current = false;
    setFormExpanded(false);
    setCollapsed(true);
    goCockpitHome(activeDirectoryId, { collapseCloud: true });
  };

  const buildWakePayload = () => {
    const wake =
      anchorMode === 'k12'
        ? buildK12AnchorFields({
            goalType: k12GoalType,
            focusSubject: k12Subject,
            targetApplyAt,
          })
        : { school, major, targetApplyAt };
    const wakeSchool = wake.school.trim();
    const wakeMajor = wake.major.trim();
    const wakeApplyAt = wake.targetApplyAt;
    const wakeRegion =
      anchorMode === 'k12'
        ? ''
        : targetSchoolRegion.trim() || inferTargetSchoolRegion(wakeSchool);
    return {
      wakeSchool,
      wakeMajor,
      wakeApplyAt,
      wakeRegion,
      body: {
        userId,
        school: wakeSchool,
        major: wakeMajor,
        currentGrade,
        targetApplyAt: wakeApplyAt,
        currentSchool,
        currentRegion,
        targetSchoolRegion: wakeRegion,
      },
    };
  };

  const syncSidebarFromAnchor = async (opts?: { fullGenerate?: boolean }) => {
    if (isGenerating) return;
    setIsGenerating(true);
    if (compact) setCompactStatus({ kind: 'idle', text: t('cloudConsole.waking') });
    const { wakeSchool, wakeMajor, body } = buildWakePayload();
    setSyncLogs((p) => [
      ...p,
      opts?.fullGenerate
        ? t('cloudConsole.generatingDir', { school: wakeSchool, major: wakeMajor })
        : t('cloudConsole.resyncingSidebar', { school: wakeSchool, major: wakeMajor }),
    ]);
    try {
      const authed = await ensureAuthSession(userId);
      if (!authed) {
        const msg = t('cloudConsole.authFail');
        setSyncLogs((p) => [...p, msg]);
        if (compact) setCompactStatus({ kind: 'err', text: msg });
        return null;
      }
      const endpoint = opts?.fullGenerate
        ? '/api/v3.5/cloud/directories/generate'
        : '/api/v3.5/cloud/anchor/sync';
      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = parseApiErrorMessage(json, res);
        setSyncLogs((p) => [...p, t('cloudConsole.genFail', { msg })]);
        if (compact) setCompactStatus({ kind: 'err', text: msg });
        return null;
      }
      return unwrapEnvelope<{
        success?: boolean;
        directories?: Dir[];
        anchorDirectoryId?: string;
        anchorBrief?: {
          chatText: string;
          daysRemaining: number;
          challengeIndex: number;
          timelineMilestones: unknown[];
          dynamicMilestones: unknown[];
          requiredMetrics: Record<string, unknown>;
          pathway?: string;
          pathwayLabel?: string;
        } | null;
      }>(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('cloudConsole.networkError');
      setSyncLogs((p) => [...p, msg]);
      if (compact) setCompactStatus({ kind: 'err', text: msg });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAndSync = async () => {
    const { wakeSchool, wakeRegion } = buildWakePayload();
    if (anchorMode === 'college' && !wakeSchool) {
      const msg = t('cloudConsole.needTargetSchool');
      if (compact) setCompactStatus({ kind: 'err', text: msg });
      else setSyncLogs((p) => [...p, msg]);
      return;
    }
    if (anchorMode === 'college' && !targetSchoolRegion.trim() && wakeRegion) {
      setTargetSchoolRegion(wakeRegion);
    }
    const d = await syncSidebarFromAnchor({ fullGenerate: true });
    if (!d) return;
    const directories = d.directories ?? [];
    const anchorDirectoryId = d.anchorDirectoryId;
    if (d.success === false) {
      const msg = t('cloudConsole.serverNotOk');
      if (compact) setCompactStatus({ kind: 'err', text: msg });
      return;
    }
    setDirs(directories);
    setAnchorReady(true);
    await refreshDirectories(anchorDirectoryId);
    emitDirectoryWorkspaceRefresh(anchorDirectoryId);
    setSyncLogs((p) => [
      ...p,
      t('cloudConsole.nodeGenerated'),
      t('cloudConsole.pinnedSynced'),
      compact ? t('cloudConsole.toolPanelCollapse') : t('cloudConsole.enteringCockpit'),
    ]);
    editIntentRef.current = false;
    setFormExpanded(false);
    if (d.anchorBrief) emitAnchorBrief(d.anchorBrief);
    if (compact) {
      markAnchorSessionDone();
      setCompactStatus({ kind: 'ok', text: t('cloudConsole.wakeSuccess') });
      await onAfterWake?.(anchorDirectoryId, d.anchorBrief ?? null);
    } else {
      enterHome(anchorDirectoryId);
    }
  };

  const handleResyncSidebarOnly = async () => {
    const { wakeRegion } = buildWakePayload();
    if (anchorMode === 'college' && !targetSchoolRegion.trim() && wakeRegion) {
      setTargetSchoolRegion(wakeRegion);
    }
    const d = await syncSidebarFromAnchor({ fullGenerate: false });
    if (!d) return;
    setDirs(d.directories ?? []);
    setAnchorReady(true);
    await refreshDirectories(d.anchorDirectoryId);
    emitDirectoryWorkspaceRefresh(d.anchorDirectoryId);
    if (d.anchorBrief) emitAnchorBrief(d.anchorBrief);
    setSyncLogs((p) => [...p, t('cloudConsole.pinnedSynced'), t('cloudConsole.metricsSynced')]);
    if (compact) setCompactStatus({ kind: 'ok', text: t('cloudConsole.sidebarSynced') });
  };

  const pushSampleArtifact = async () => {
    if (!selectedDir) return;
    setSyncLogs((p) => [...p, t('cloudConsole.pushToDir', { name: selectedDir.nodeName })]);
    const res = await authFetch('/api/v3.5/cloud/artifacts/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        dirId: selectedDir.dirId,
        title: 'Common App 文书切片',
        version: `V1_${Date.now()}`,
        content: JSON.stringify(
          { school, major, type: 'ESSAY_SLICE', nodes: ['Hook', 'Growth', 'Proof', 'Reflection'] },
          null,
          2,
        ),
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (json ?? {}) as { error?: string; message?: string; status?: string };
      setSyncLogs((p) => [...p, t('cloudConsole.pushFail', { err: err.error || err.message || 'UNKNOWN' })]);
      return;
    }
    const d = unwrapEnvelope<{ success: boolean; url?: string }>(json);
    setSyncLogs((p) => [...p, d.success ? t('cloudConsole.pushOk') : t('cloudConsole.pushFailS3')]);
    void refreshState();
  };

  const displayAnchor = ctxAnchor ?? (anchorReady ? { school, major, currentGrade, targetApplyAt, currentSchool, currentRegion, targetSchoolRegion } : null);

  const renderCompactForm = () => (
    <>
        <p className="text-[9px] text-gray-500">
          {anchorConfigured
            ? t('cloudConsole.editAnchorHint')
            : anchorMode === 'k12'
              ? t('cloudConsole.noCollegeYet')
              : t('cloudConsole.curriculumAuto')}
        </p>
        <motion.div className="grid grid-cols-2 gap-3 bg-black p-3 rounded-xl border border-gray-950">
          <motion.div className="col-span-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                markAnchorEditing();
                setAnchorMode('college');
              }}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold ${anchorMode === 'college' ? 'border-[#00FF7F] bg-[#00FF7F]/15 text-[#00FF7F]' : 'border-gray-800 text-gray-500'}`}
            >
              {t('cloudConsole.haveDreamSchool')}
            </button>
            <button
              type="button"
              onClick={() => {
                markAnchorEditing();
                setAnchorMode('k12');
                if (!K12_GRADE_OPTIONS.includes(currentGrade as (typeof K12_GRADE_OPTIONS)[number])) {
                  setCurrentGrade('小学五年级');
                }
              }}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold ${anchorMode === 'k12' ? 'border-[#00FF7F] bg-[#00FF7F]/15 text-[#00FF7F]' : 'border-gray-800 text-gray-500'}`}
            >
              {t('cloudConsole.noDreamSchool')}
            </button>
          </motion.div>
          <motion.div className="col-span-2">
            <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.currentSchool')}</label>
            <input type="text" value={currentSchool} onChange={(e) => setCurrentSchool(e.target.value)} placeholder={t('cloudConsole.placeholderSchool')} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.currentLocation')}</label>
            <input type="text" value={currentRegion} onChange={(e) => setCurrentRegion(e.target.value)} placeholder={t('cloudConsole.placeholderLocation')} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
          </motion.div>
          {anchorMode === 'college' ? (
            <>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.targetLocation')}</label>
                <input type="text" value={targetSchoolRegion} onChange={(e) => setTargetSchoolRegion(e.target.value)} placeholder={t('cloudConsole.placeholderTargetLocation')} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
              </motion.div>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.targetSchool')}</label>
                <input type="text" value={school} onChange={(e) => setSchool(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
              </motion.div>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.focusMajor')}</label>
                <input type="text" value={major} onChange={(e) => setMajor(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
              </motion.div>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.grade')}</label>
                <select value={currentGrade} onChange={(e) => setCurrentGrade(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans">
                  {COLLEGE_GRADE_OPTIONS.map((g) => (<option key={g} value={g}>{g}</option>))}
                </select>
              </motion.div>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.targetEnroll')}</label>
                <input type="month" value={targetApplyAt} onChange={(e) => setTargetApplyAt(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
              </motion.div>
            </>
          ) : (
            <>
              <motion.div className="col-span-2">
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.stageGoal')}</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setK12GoalType('school_top')} className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] ${k12GoalType === 'school_top' ? 'border-[#00FF7F] text-[#00FF7F]' : 'border-gray-800 text-gray-500'}`}>{t('cloudConsole.topOfClass')}</button>
                  <button type="button" onClick={() => setK12GoalType('subject_boost')} className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] ${k12GoalType === 'subject_boost' ? 'border-[#00FF7F] text-[#00FF7F]' : 'border-gray-800 text-gray-500'}`}>{t('cloudConsole.singleSubject')}</button>
                </div>
              </motion.div>
              {k12GoalType === 'subject_boost' && (
                <motion.div>
                  <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.mainSubject')}</label>
                  <select value={k12Subject} onChange={(e) => setK12Subject(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans">
                    {K12_SUBJECT_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </motion.div>
              )}
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.grade')}</label>
                <select value={currentGrade} onChange={(e) => setCurrentGrade(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans">
                  {K12_GRADE_OPTIONS.map((g) => (<option key={g} value={g}>{g}</option>))}
                </select>
              </motion.div>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.stageNode')}</label>
                <input type="month" value={targetApplyAt} onChange={(e) => setTargetApplyAt(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
              </motion.div>
            </>
          )}
        </motion.div>
        <button type="button" onClick={() => void handleGenerateAndSync()} disabled={isGenerating} className="w-full bg-[#00FF7F] text-black font-black text-xs py-3 rounded-xl hover:bg-[#00E06F] transition-all disabled:opacity-60">
          {isGenerating ? t('cloudConsole.waking') : t('cloudConsole.wakeButton')}
        </button>
        {compactStatus.kind !== 'idle' && (
          <p className={`text-[10px] ${compactStatus.kind === 'ok' ? 'text-[#00FF7F]' : 'text-[#FF4500]'}`}>
            {compactStatus.text}
          </p>
        )}
        {anchorConfigured && (
          <button
            type="button"
            onClick={() => {
              editIntentRef.current = false;
              setFormExpanded(false);
            }}
            className="w-full rounded-xl border border-gray-800 py-2 text-[10px] text-gray-500 hover:border-gray-700"
          >
            {t('cloudConsole.backToSummary')}
          </button>
        )}
        {dirs.length > 0 && (
          <motion.div className="bg-black border border-gray-950 rounded-xl p-2 text-[9px] text-gray-500 max-h-24 overflow-y-auto space-y-1">
            {dirs.slice(0, 6).map((d) => (
              <motion.div key={d.dirId} className="flex justify-between gap-2">
                <span className="truncate">{d.nodeName}</span>
                <span className={d.cloudSyncStatus === 'SYNCED' ? 'text-[#00FF7F]' : 'text-amber-500/90'}>{syncLabel(d.cloudSyncStatus)}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
    </>
  );

  if (compact) {
    return (
      <div data-cockpit-anchor className="space-y-3 font-mono text-left">
        {anchorConfigured && !formExpanded && displayAnchor ? (
          <>
            <div className="rounded-xl border border-[#00FF7F]/25 bg-[#00FF7F]/5 p-3 space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#00FF7F]">
                {t('cloudConsole.anchorConfirmedTitle')}
              </p>
              <p className="text-[10px] text-white">
                {displayAnchor.school} · {displayAnchor.major}
              </p>
              <p className="text-[9px] text-gray-500">
                {displayAnchor.currentGrade} · {t('cloudConsole.targetEnroll')} {displayAnchor.targetApplyAt}
                {displayAnchor.targetSchoolRegion ? ` · ${displayAnchor.targetSchoolRegion}` : ''}
              </p>
              <p className="text-[9px] text-gray-600">{t('cloudConsole.anchorConfirmedHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => enterHome(activeId ?? undefined)}
              className="w-full rounded-xl bg-[#00FF7F] py-2.5 text-[11px] font-black text-black hover:bg-[#00E06F]"
            >
              {t('cloudConsole.enterCockpit')}
            </button>
            <button
              type="button"
              onClick={() => {
                markAnchorEditing();
                editHydratedRef.current = false;
                setFormExpanded(true);
              }}
              className="w-full rounded-xl border border-[#00FF7F]/40 bg-[#050608] py-2.5 text-[11px] font-bold text-[#00FF7F] hover:bg-[#00FF7F]/10"
            >
              {t('cloudConsole.changeAnchor')}
            </button>
            <button
              type="button"
              onClick={() => void handleResyncSidebarOnly()}
              disabled={isGenerating}
              className="w-full rounded-xl border border-gray-800 py-2 text-[10px] text-gray-400 hover:border-[#00FF7F]/30 hover:text-[#00FF7F] disabled:opacity-50"
            >
              {isGenerating ? t('cloudConsole.waking') : t('cloudConsole.resyncSidebar')}
            </button>
          </>
        ) : (
          renderCompactForm()
        )}
      </div>
    );
  }

  if (collapsed && isAnchorSessionDone()) {
    return (
      <motion.div data-cockpit-anchor className="w-full max-w-2xl mx-auto p-2 font-mono text-left space-y-2">
        <button
          type="button"
          onClick={() => enterHome()}
          className="w-full rounded-xl bg-[#00FF7F] px-4 py-2.5 text-[11px] font-black text-black hover:bg-[#00E06F]"
        >
          {t('cloudConsole.enterCockpit')}
        </button>
        <button
          type="button"
          onClick={() => {
            editIntentRef.current = true;
            setFormExpanded(true);
            setCollapsed(false);
          }}
          className="w-full rounded-xl border border-[#00FF7F]/25 bg-[#050608]/90 px-4 py-2 text-[10px] text-[#00FF7F] hover:border-[#00FF7F]/50"
        >
          {anchorConfigured ? t('cloudConsole.changeAnchor') : t('cloudConsole.expandAnchor')}
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      data-cockpit-anchor
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl mx-auto p-4 font-mono select-none text-left"
    >
      <div className="rounded-2xl border-2 border-[#00FF7F]/40 bg-[#050608] p-6 shadow-[0_0_50px_rgba(0,255,127,0.12)] space-y-6">
        <motion.div className="flex justify-between items-baseline border-b border-gray-950 pb-3">
          <motion.div>
            <p className="text-[8px] text-[#00FF7F] tracking-widest mb-1">{t('cloudConsole.step1')}</p>
            <h2 className="text-xs font-black text-white tracking-widest">{t('cloudConsole.anchorTitle')}</h2>
            <p className="text-[9px] text-gray-500 mt-0.5">
              {t('cloudConsole.anchorDesc')}
            </p>
          </motion.div>
          <motion.div className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF7F] animate-ping" />
            <span className="text-[8px] text-[#00FF7F] font-bold">ANCHOR</span>
          </motion.div>
        </motion.div>

        <motion.div className="grid grid-cols-2 gap-3 bg-black p-3 rounded-xl border border-gray-950">
          <motion.div className="col-span-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                markAnchorEditing();
                setAnchorMode('college');
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-[10px] font-bold transition-colors ${anchorMode === 'college' ? 'border-[#00FF7F] bg-[#00FF7F]/15 text-[#00FF7F]' : 'border-gray-800 text-gray-500 hover:border-gray-700'}`}
            >
              {t('cloudConsole.haveDreamSchool')}
            </button>
            <button
              type="button"
              onClick={() => {
                markAnchorEditing();
                setAnchorMode('k12');
                if (!K12_GRADE_OPTIONS.includes(currentGrade as (typeof K12_GRADE_OPTIONS)[number])) {
                  setCurrentGrade('小学五年级');
                }
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-[10px] font-bold transition-colors ${anchorMode === 'k12' ? 'border-[#00FF7F] bg-[#00FF7F]/15 text-[#00FF7F]' : 'border-gray-800 text-gray-500 hover:border-gray-700'}`}
            >
              {t('cloudConsole.noDreamSchool')}
            </button>
          </motion.div>
          <motion.div className="col-span-2">
            <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.currentSchool')}</label>
            <input
              type="text"
              value={currentSchool}
              onChange={(e) => setCurrentSchool(e.target.value)}
              placeholder={t('cloudConsole.placeholderSchool')}
              className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
            />
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.currentLocation')}</label>
            <input
              type="text"
              value={currentRegion}
              onChange={(e) => setCurrentRegion(e.target.value)}
              placeholder={t('cloudConsole.placeholderLocation')}
              className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
            />
          </motion.div>
          {anchorMode === 'college' ? (
            <>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.targetLocation')}</label>
                <input
                  type="text"
                  value={targetSchoolRegion}
                  onChange={(e) => setTargetSchoolRegion(e.target.value)}
                  placeholder={t('cloudConsole.placeholderTargetLocation')}
                  className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
                />
              </motion.div>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.targetSchool')}</label>
                <input
                  type="text"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
                />
              </motion.div>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.focusMajor')}</label>
                <input
                  type="text"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
                />
              </motion.div>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.grade')}</label>
                <select
                  value={currentGrade}
                  onChange={(e) => setCurrentGrade(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
                >
                  {COLLEGE_GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </motion.div>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.targetEnroll')}</label>
                <input
                  type="month"
                  value={targetApplyAt}
                  onChange={(e) => setTargetApplyAt(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
                />
              </motion.div>
            </>
          ) : (
            <>
              <motion.div className="col-span-2">
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.stageGoal')}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setK12GoalType('school_top')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-[10px] font-bold ${k12GoalType === 'school_top' ? 'border-[#00FF7F] text-[#00FF7F]' : 'border-gray-800 text-gray-500'}`}
                  >
                    {t('cloudConsole.topOfClassFull')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setK12GoalType('subject_boost')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-[10px] font-bold ${k12GoalType === 'subject_boost' ? 'border-[#00FF7F] text-[#00FF7F]' : 'border-gray-800 text-gray-500'}`}
                  >
                    {t('cloudConsole.singleSubject')}
                  </button>
                </div>
              </motion.div>
              {k12GoalType === 'subject_boost' && (
                <motion.div>
                  <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.mainSubject')}</label>
                  <select
                    value={k12Subject}
                    onChange={(e) => setK12Subject(e.target.value)}
                    className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
                  >
                    {K12_SUBJECT_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </motion.div>
              )}
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.grade')}</label>
                <select
                  value={currentGrade}
                  onChange={(e) => setCurrentGrade(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
                >
                  {K12_GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </motion.div>
              <motion.div>
                <label className="text-[9px] text-gray-500 block uppercase mb-1">{t('cloudConsole.semesterNode')}</label>
                <input
                  type="month"
                  value={targetApplyAt}
                  onChange={(e) => setTargetApplyAt(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
                />
              </motion.div>
            </>
          )}
        </motion.div>

        <button
          type="button"
          onClick={() => void handleGenerateAndSync()}
          disabled={isGenerating}
          className="w-full bg-[#00FF7F] text-black font-black text-xs py-3 rounded-xl hover:bg-[#00E06F] transition-all disabled:opacity-60"
        >
          {isGenerating ? t('cloudConsole.waking') : t('cloudConsole.wakeButton')}
        </button>

        {anchorReady && (
          <button
            type="button"
            onClick={() => enterHome()}
            className="w-full rounded-xl border border-white/20 bg-white/5 py-2.5 text-[11px] font-bold text-white hover:bg-white/10"
          >
            {t('cloudConsole.enterCockpit')}
          </button>
        )}

        <button
          type="button"
          onClick={() => void pushSampleArtifact()}
          disabled={!selectedDir}
          className="w-full bg-[#14161D] border border-gray-900 text-gray-200 text-xs py-3 rounded-xl hover:border-[#00FF7F]/50 transition-all disabled:opacity-60"
        >
          {t('cloudConsole.pushDemo')}
        </button>

        <motion.div className="space-y-2">
          <span className="text-[9px] text-gray-500 block uppercase">{t('cloudConsole.cloudNodes')}</span>
          <motion.div className="bg-black border border-gray-950 rounded-xl p-3 text-[10px] space-y-1.5 font-mono text-gray-400">
            {dirs.length === 0 ? (
              <motion.div>{t('cloudConsole.emptyNodes')}</motion.div>
            ) : (
              dirs.slice(0, 8).map((d) => (
                <motion.div key={d.dirId} className="flex justify-between gap-2">
                  <span className="truncate">{d.nodeName}</span>
                  <span
                    className={
                      d.cloudSyncStatus === 'SYNCED'
                        ? 'text-[#00FF7F]'
                        : d.cloudSyncStatus === 'FAILED'
                          ? 'text-[#FF4500]'
                          : 'text-amber-500/90'
                    }
                  >
                    {syncLabel(d.cloudSyncStatus)}
                  </span>
                </motion.div>
              ))
            )}
          </motion.div>
        </motion.div>

        <motion.div className="space-y-2">
          <span className="text-[9px] text-gray-500 block uppercase">{t('cloudConsole.syncLog')}</span>
          <motion.div className="bg-black border border-gray-950 rounded-xl p-3 text-[10px] space-y-1.5 max-h-36 overflow-y-auto font-mono text-gray-400">
            {syncLogs.map((log, index) => (
              <motion.div key={index} className="leading-relaxed whitespace-pre-wrap">
                {log}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {dataGaps && (
          <motion.div className="space-y-2">
            <span className="text-[9px] text-gray-500 block uppercase">数据缺口雷达</span>
            <motion.div className="bg-black border border-amber-500/20 rounded-xl p-3 text-[10px] font-mono">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-amber-400 text-[11px] font-bold">{dataGaps.completenessPct}%</span>
                <span className="text-gray-500 text-[9px]">证据完备度</span>
                <span className={`ml-auto text-[8px] px-1.5 py-0.5 rounded ${
                  dataGaps.priority === 'high' ? 'bg-rose-500/20 text-rose-300' :
                  dataGaps.priority === 'medium' ? 'bg-amber-500/20 text-amber-300' :
                  'bg-gray-800 text-gray-500'
                }`}>
                  {dataGaps.priority === 'high' ? '高优先级' : dataGaps.priority === 'medium' ? '中优先级' : '低'}
                </span>
              </div>
              {dataGaps.missingFields.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {dataGaps.missingFields.map((f) => (
                    <span key={f} className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[8px] text-amber-300/80">
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {dataGaps.missingFields.length === 0 && (
                <p className="text-[9px] text-[#00FF7F]/70">所有必要数据已完备</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
