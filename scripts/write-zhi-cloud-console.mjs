import fs from 'node:fs';

const u = (s) => s;

const content = `import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { authFetch, ensureAuthSession, parseApiErrorMessage } from '../lib/api-auth';
import { useZhiDirectory } from '../context/ZhiDirectoryContext';
import { isAnchorSessionDone, markAnchorSessionDone } from '../lib/anchor-session';
import { goCockpitHome } from '../lib/go-cockpit-home';

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

function unwrap<T>(json: unknown): T {
  const j = json as { data?: T };
  return (j?.data ?? json) as T;
}

function syncLabel(status: Dir['cloudSyncStatus']): string {
  if (status === 'SYNCED') return 'SYNCED';
  if (status === 'FAILED') return 'FAILED';
  return 'LOCAL';
}

const GRADE_OPTIONS = [${[
  '\u521d\u4e09',
  '\u9ad8\u4e00',
  '\u9ad8\u4e8c',
  '\u9ad8\u4e09',
  '\u9ad8\u4e09(Gap)',
  '\u5927\u4e00',
  '\u5927\u4e8c',
  '\u5927\u4e09',
  '\u5927\u56db',
]
  .map((g) => `'${g}'`)
  .join(', ')}] as const;

type AnchorProfile = {
  school: string;
  major: string;
  currentGrade: string;
  targetApplyAt: string;
};

function defaultTargetApplyAt(): string {
  const d = new Date();
  const y = d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
  return \`\${y}-09\`;
}

export function ZhiCloudConsole({
  userId,
  compact = false,
  onAfterWake,
}: {
  userId: string;
  compact?: boolean;
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
  const [school, setSchool] = useState('${u('\u5361\u5185\u57fa\u6885\u9686\u5927\u5b66')}');
  const [major, setMajor] = useState('${u('\u8ba1\u7b97\u673a')}');
  const [currentGrade, setCurrentGrade] = useState<string>('${u('\u9ad8\u4e09')}');
  const [targetApplyAt, setTargetApplyAt] = useState(defaultTargetApplyAt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dirs, setDirs] = useState<Dir[]>([]);
  const [, setArtifacts] = useState<Artifact[]>([]);
  const [syncLogs, setSyncLogs] = useState<string[]>([
    '${u('\u68a6\u6821\u4e91\u76ee\u5f55\u5df2\u5c31\u7eea\uff1b\u5f53\u524d\u4e3a LOCAL \u9884\u89c8\u6a21\u5f0f\uff08\u672a\u63a5 S3 \u65f6\u4ecd\u53ef\u89c4\u5212\uff09\u3002')}',
  ]);
  const [collapsed, setCollapsed] = useState(true);
  const [anchorReady, setAnchorReady] = useState(false);
  const [compactStatus, setCompactStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; text: string }>({
    kind: 'idle',
    text: '',
  });
  const { refreshDirectories } = useZhiDirectory();

  const selectedDir = useMemo(
    () => dirs.find((d) => d.nodeType === 'ESSAY_ESSENTIAL') ?? dirs[0],
    [dirs],
  );

  useEffect(() => {
    const expand = () => setCollapsed(false);
    const collapse = () => setCollapsed(true);
    window.addEventListener('wuxian:show-anchor', expand);
    window.addEventListener('wuxian:enter-cockpit', collapse);
    window.addEventListener('wuxian:hide-overlays', collapse);
    return () => {
      window.removeEventListener('wuxian:show-anchor', expand);
      window.removeEventListener('wuxian:enter-cockpit', collapse);
      window.removeEventListener('wuxian:hide-overlays', collapse);
    };
  }, []);

  const refreshState = async () => {
    const res = await authFetch(\`/api/v3.5/cloud/state/\${encodeURIComponent(userId)}\`);
    const json = await res.json().catch(() => null);
    if (!res.ok) return;
    const d = unwrap<{
      directories: Dir[];
      artifacts: Artifact[];
      anchorProfile?: AnchorProfile | null;
    }>(json);
    setDirs(d.directories ?? []);
    setArtifacts(d.artifacts ?? []);
    const profile = d.anchorProfile;
    if (profile) {
      setAnchorReady(true);
      if (profile.school) setSchool(profile.school);
      if (profile.major) setMajor(profile.major);
      if (profile.currentGrade) setCurrentGrade(profile.currentGrade);
      if (profile.targetApplyAt) setTargetApplyAt(profile.targetApplyAt);
    } else if ((d.directories?.length ?? 0) > 0) {
      setAnchorReady(true);
      const first = d.directories![0];
      if (first?.targetSchool) setSchool(first.targetSchool);
      if (first?.targetMajor) setMajor(first.targetMajor);
    }
  };

  useEffect(() => {
    void refreshState();
    const t = window.setInterval(() => void refreshState(), 12000);
    return () => window.clearInterval(t);
  }, [userId]);

  const enterHome = (activeDirectoryId?: string) => {
    markAnchorSessionDone();
    setCollapsed(true);
    goCockpitHome(activeDirectoryId, { collapseCloud: true });
  };

  const handleGenerateAndSync = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    if (compact) setCompactStatus({ kind: 'idle', text: '${u('\u6b63\u5728\u5524\u9192 ZHI\u2026')}' });
    setSyncLogs((p) => [...p, \`${u('\u6b63\u5728\u751f\u6210\u68a6\u6821\u4e91\u76ee\u5f55')}\uFF1A\${school} \u00b7 \${major}\`]);
    try {
      const authed = await ensureAuthSession(userId);
      if (!authed) {
        const msg = '${u('\u4f1a\u8bdd\u672a\u5c31\u7eea\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5')}';
        setSyncLogs((p) => [...p, msg]);
        if (compact) setCompactStatus({ kind: 'err', text: msg });
        return;
      }
      const res = await authFetch('/api/v3.5/cloud/directories/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, school, major, currentGrade, targetApplyAt }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = parseApiErrorMessage(json, res);
        setSyncLogs((p) => [...p, \`${u('\u751f\u6210\u5931\u8d25')}: \${msg}\`]);
        if (compact) setCompactStatus({ kind: 'err', text: msg });
        return;
      }
      const d = unwrap<{
        success?: boolean;
        directories: Dir[];
        anchorDirectoryId?: string;
        anchorBrief?: {
          chatText: string;
          daysRemaining: number;
          challengeIndex: number;
          timelineMilestones: unknown[];
          dynamicMilestones: unknown[];
          requiredMetrics: Record<string, unknown>;
        } | null;
      }>(json);
      const directories = d.directories ?? [];
      const anchorDirectoryId = d.anchorDirectoryId;
      if (d.success === false) {
        const msg = '${u('\u670d\u52a1\u7aef\u672a\u8fd4\u56de\u6210\u529f\u72b6\u6001')}';
        if (compact) setCompactStatus({ kind: 'err', text: msg });
        return;
      }
      setDirs(directories);
      setAnchorReady(true);
      await refreshDirectories(anchorDirectoryId);
      window.dispatchEvent(
        new CustomEvent('wuxian:directories-refresh', {
          detail: { activeDirectoryId: anchorDirectoryId },
        }),
      );
      setSyncLogs((p) => [
        ...p,
        '${u('\u68a6\u6821\u4e91\u8282\u70b9\u5df2\u751f\u6210')}',
        '${u('\u5de6\u4fa7 PINNED \u6e05\u5355\u5df2\u540c\u6b65')}',
        compact ? '${u('\u5de5\u5177\u9762\u677f\u5c06\u6536\u8d77')}' : '${u('\u6b63\u5728\u8fdb\u5165\u4e3b\u9a7e\u9a76\u8231\u2026')}',
      ]);
      if (compact) {
        markAnchorSessionDone();
        setCompactStatus({ kind: 'ok', text: '${u('\u5524\u9192\u6210\u529f\uff0c\u5de6\u4fa7\u5df2\u540c\u6b65')}' });
        await onAfterWake?.(anchorDirectoryId, d.anchorBrief ?? null);
      } else {
        enterHome(anchorDirectoryId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '${u('\u7f51\u7edc\u5f02\u5e38')}';
      setSyncLogs((p) => [...p, msg]);
      if (compact) setCompactStatus({ kind: 'err', text: msg });
    } finally {
      setIsGenerating(false);
    }
  };

  const pushSampleArtifact = async () => {
    if (!selectedDir) return;
    setSyncLogs((p) => [...p, \`${u('\u63a8\u9001\u81f3')}: \${selectedDir.nodeName}\`]);
    const res = await authFetch('/api/v3.5/cloud/artifacts/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        dirId: selectedDir.dirId,
        title: 'Common App ${u('\u6587\u4e66\u5207\u7247')}',
        version: \`V1_\${Date.now()}\`,
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
      setSyncLogs((p) => [...p, \`${u('\u63a8\u9001\u5931\u8d25')}: \${err.error || err.message || 'UNKNOWN'}\`]);
      return;
    }
    const d = unwrap<{ success: boolean; url?: string }>(json);
    setSyncLogs((p) => [...p, d.success ? '${u('\u63a8\u9001\u6210\u529f')}' : '${u('\u63a8\u9001\u5931\u8d25\uff08S3\uff09')}']);
    void refreshState();
  };

  if (compact) {
    return (
      <div data-cockpit-anchor className="space-y-3 font-mono text-left">
        <p className="text-[9px] text-gray-500">${u('\u586b\u5199\u540e\u5524\u9192\uff0c\u5de6\u4fa7 PINNED \u6e05\u5355\u5c06\u7acb\u5373\u540c\u6b65')}</p>
        <motion.div className="grid grid-cols-2 gap-3 bg-black p-3 rounded-xl border border-gray-950">
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">${u('\u76ee\u6807\u9662\u6821')}</label>
            <input type="text" value={school} onChange={(e) => setSchool(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">${u('\u805a\u7126\u4e13\u4e1a')}</label>
            <input type="text" value={major} onChange={(e) => setMajor(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">${u('\u5728\u8bfb\u5e74\u7ea7')}</label>
            <select value={currentGrade} onChange={(e) => setCurrentGrade(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans">
              {GRADE_OPTIONS.map((g) => (<option key={g} value={g}>{g}</option>))}
            </select>
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">${u('\u76ee\u6807\u5165\u5b66\u65f6\u95f4')}</label>
            <input type="month" value={targetApplyAt} onChange={(e) => setTargetApplyAt(e.target.value)} className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans" />
          </motion.div>
        </motion.div>
        <button type="button" onClick={() => void handleGenerateAndSync()} disabled={isGenerating} className="w-full bg-[#00FF7F] text-black font-black text-xs py-3 rounded-xl hover:bg-[#00E06F] transition-all disabled:opacity-60">
          {isGenerating ? '${u('\u6b63\u5728\u5524\u9192 ZHI\u2026')}' : '${u('\u26a1 \u5524\u9192 ZHI \u00b7 \u540c\u6b65\u5de6\u4fa7')}'}
        </button>
        {compactStatus.kind !== 'idle' && (
          <p className={\`text-[10px] \${compactStatus.kind === 'ok' ? 'text-[#00FF7F]' : 'text-[#FF4500]'}\`}>
            {compactStatus.text}
          </p>
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
          ${u('\u8fdb\u5165\u4e3b\u9a7e\u9a76\u8231\uff08\u9996\u9875\uff09\u2192')}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="w-full rounded-xl border border-[#00FF7F]/25 bg-[#050608]/90 px-4 py-2 text-[10px] text-[#00FF7F] hover:border-[#00FF7F]/50"
        >
          ${u('\u5c55\u5f00\u68a6\u6821\u822a\u6807\u8bbe\u5b9a')}
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
            <p className="text-[8px] text-[#00FF7F] tracking-widest mb-1">STEP 1 ${u('\u00b7')} ${u('\u68a6\u6821\u822a\u6807')}</p>
            <h2 className="text-xs font-black text-white tracking-widest">ZHI // ${u('\u68a6\u6821\u4e91\u951a\u70b9\u8bbe\u5b9a')}</h2>
            <p className="text-[9px] text-gray-500 mt-0.5">${u('\u586b\u5199\u9662\u6821\u3001\u4e13\u4e1a\u3001\u5728\u8bfb\u5e74\u7ea7\u4e0e\u76ee\u6807\u5165\u5b66\u65f6\u95f4\uff0c\u5524\u9192\u540e\u540c\u6b65\u5de6\u4fa7\u6e05\u5355')}</p>
          </motion.div>
          <motion.div className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF7F] animate-ping" />
            <span className="text-[8px] text-[#00FF7F] font-bold">ANCHOR</span>
          </motion.div>
        </motion.div>

        <motion.div className="grid grid-cols-2 gap-3 bg-black p-3 rounded-xl border border-gray-950">
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">${u('\u76ee\u6807\u9662\u6821')} (School)</label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
            />
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">${u('\u805a\u7126\u4e13\u4e1a')} (Major)</label>
            <input
              type="text"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
            />
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">${u('\u5728\u8bfb\u5e74\u7ea7')}</label>
            <select
              value={currentGrade}
              onChange={(e) => setCurrentGrade(e.target.value)}
              className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
            >
              {GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </motion.div>
          <motion.div>
            <label className="text-[9px] text-gray-500 block uppercase mb-1">${u('\u76ee\u6807\u5165\u5b66\u65f6\u95f4')}</label>
            <input
              type="month"
              value={targetApplyAt}
              onChange={(e) => setTargetApplyAt(e.target.value)}
              className="w-full bg-[#0B0C10] border border-gray-900 rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00FF7F]/50 outline-none font-sans"
            />
          </motion.div>
        </motion.div>

        <button
          type="button"
          onClick={() => void handleGenerateAndSync()}
          disabled={isGenerating}
          className="w-full bg-[#00FF7F] text-black font-black text-xs py-3 rounded-xl hover:bg-[#00E06F] transition-all disabled:opacity-60"
        >
          {isGenerating ? '${u('\u6b63\u5728\u5524\u9192 ZHI\u2026')}' : '${u('\u26a1 \u5524\u9192 ZHI \u00b7 \u751f\u6210\u4e91\u76ee\u5f55\u5e76\u540c\u6b65\u5de6\u4fa7')}'}
        </button>

        {anchorReady && (
          <button
            type="button"
            onClick={() => enterHome()}
            className="w-full rounded-xl border border-white/20 bg-white/5 py-2.5 text-[11px] font-bold text-white hover:bg-white/10"
          >
            ${u('\u8fdb\u5165\u4e3b\u9a7e\u9a76\u8231\uff08\u9996\u9875\uff09\u2192')}
          </button>
        )}

        <button
          type="button"
          onClick={() => void pushSampleArtifact()}
          disabled={!selectedDir}
          className="w-full bg-[#14161D] border border-gray-900 text-gray-200 text-xs py-3 rounded-xl hover:border-[#00FF7F]/50 transition-all disabled:opacity-60"
        >
          ${u('\u63a8\u9001\u793a\u4f8b\u6587\u4e66\u5207\u7247\u81f3 S3\uff08\u6f14\u793a\uff09')}
        </button>

        <motion.div className="space-y-2">
          <span className="text-[9px] text-gray-500 block uppercase">${u('\u4e91\u76ee\u5f55\u8282\u70b9')}</span>
          <motion.div className="bg-black border border-gray-950 rounded-xl p-3 text-[10px] space-y-1.5 font-mono text-gray-400">
            {dirs.length === 0 ? (
              <motion.div>${u('\u6682\u65e0')} ${u('\u00b7')} ${u('\u5f85\u5524\u9192')}</motion.div>
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
          <span className="text-[9px] text-gray-500 block uppercase">${u('\u540c\u6b65\u65e5\u5fd7')}</span>
          <motion.div className="bg-black border border-gray-950 rounded-xl p-3 text-[10px] space-y-1.5 max-h-36 overflow-y-auto font-mono text-gray-400">
            {syncLogs.map((log, index) => (
              <motion.div key={index} className="leading-relaxed whitespace-pre-wrap">
                {log}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
`;

const out = 'web/src/components/ZhiCloudConsole.tsx';
fs.writeFileSync(out, content, 'utf8');
console.log('wrote', out, content.length, 'chars');
