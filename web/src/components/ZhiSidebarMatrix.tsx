import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLearningProgress } from '../context/LearningProgressContext';
import { useZhiDirectory, type DirectoryItem } from '../context/ZhiDirectoryContext';
import { hasConfiguredAnchor } from '../lib/anchor-session';
import { goAnchorPage, goCockpitHome } from '../lib/go-cockpit-home';
import { ZhiSidebarSubjectTracks } from './progress/ZhiSidebarSubjectTracks';
import { ZhiSidebarTextbooks } from './progress/ZhiSidebarTextbooks';
import { ZhiProgressBar } from './progress/ZhiProgressBar';
import { ZhiDreamMomentumCurves } from './progress/ZhiDreamMomentumCurves';

function DirectoryRow({
  dir,
  active,
  target,
  onSelect,
  onDelete,
}: {
  dir: DirectoryItem;
  active: boolean;
  target?: { currentPct: number; targetPct: number } | null;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={`group flex w-full cursor-pointer flex-col gap-1.5 rounded-lg px-2.5 py-2 text-xs transition-all ${
        active
          ? 'border border-gray-900 bg-[#0B0C10] font-bold text-[#00FF7F] shadow-[0_0_15px_rgba(0,255,127,0.02)]'
          : 'text-gray-400 hover:bg-gray-950/40 hover:text-white'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="min-w-0 flex-1 truncate font-sans text-[11px]">{dir.title}</span>
        <div className="flex shrink-0 items-center gap-1">
          {dir.todayTaskCount !== undefined && dir.todayTaskCount > 0 && (
            <span className="rounded border border-emerald-500/30 px-1 text-[8px] text-emerald-400">
              {dir.todayTaskCount}
            </span>
          )}
          {dir.type === 'ERROR_BANK' && (
            <span className="scale-90 rounded border border-[#FF4500]/30 px-1 text-[8px] text-[#FF4500] opacity-40 transition-all group-hover:opacity-100">
              CRITICAL
            </span>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="px-1 font-sans text-[9px] text-gray-700 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
            >
              ?
            </button>
          )}
        </div>
      </div>
      {target && (
        <ZhiProgressBar
          label={`\u76ee\u6807 ${target.targetPct}%`}
          currentPct={target.currentPct}
          targetPct={target.targetPct}
          compact
        />
      )}
    </motion.div>
  );
}

export function ZhiSidebarMatrix({ layout = 'desktop' }: { layout?: 'desktop' | 'sheet' }) {
  const { t } = useTranslation();
  const { directoryTarget, dashboard } = useLearningProgress();
  const {
    activeId,
    setActiveId,
    pinned,
    custom,
    refreshDirectories,
    addCustomDirectory,
    removeCustomDirectory,
    activeDirectory,
    anchorProfile,
  } = useZhiDirectory();

  const [newDirTitle, setNewDirTitle] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);

  useEffect(() => {
    void refreshDirectories();
  }, [refreshDirectories]);

  const handleAddDirectory = () => {
    if (!newDirTitle.trim()) return;
    void addCustomDirectory(newDirTitle.trim());
    setNewDirTitle('');
    setShowAddInput(false);
  };

  const focusLabel =
    activeDirectory?.title.replace(/^\u2514\s*/, '').replace(/^\u3000\s*\u2514\s*/, '') ?? '\u672a\u9009\u62e9';

  const dream = dashboard?.dream;

  const shell =
    layout === 'sheet'
      ? 'flex h-full min-h-0 w-full flex-col justify-between border-0 bg-[#030406] p-4 font-mono text-left select-none'
      : 'flex h-screen w-64 shrink-0 flex-col justify-between border-r border-gray-950 bg-[#030406] p-4 font-mono text-left select-none xl:w-80';

  return (
    <aside className={shell}>
      <div className="space-y-4 overflow-y-auto">
        <div className="border-b border-gray-950 pb-3">
          <div className="flex items-center space-x-1.5 text-[11px] font-black tracking-widest text-[#00FF7F]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00FF7F]" />
            <span>{t('sidebar.title')}</span>
          </div>
          <p className="mt-0.5 text-[8px] text-gray-600">{t('sidebar.subtitle')}</p>
        </div>

        {dream && (
          <div className="space-y-1 rounded-xl border border-[#00FF7F]/15 bg-[#00FF7F]/5 p-2">
            <motion.div className="flex items-center justify-between gap-2 px-0.5">
              <p className="min-w-0 truncate text-[9px] font-bold text-[#00FF7F]">{dream.targetSchool}</p>
              <span className="shrink-0 text-[8px] text-gray-500">
                {t('sidebar.dream_days', { count: dream.daysRemaining })}
              </span>
            </motion.div>
            {dream.activePhase && (
              <p className="truncate px-0.5 text-[8px] text-gray-600">{dream.activePhase}</p>
            )}
            <ZhiProgressBar
              label={t('sidebar.dream_certainty')}
              currentPct={dream.certaintyPct}
              targetPct={100}
              displayCurrent={String(dream.certaintyPct)}
              displayTarget="100"
              unit="%"
              deltaPct={dream.delta7d}
              trend={dream.delta7d > 0 ? 'up' : dream.delta7d < 0 ? 'down' : 'flat'}
            />
            <p className="px-0.5 text-[8px] text-gray-600">
              阻力 {dream.challengeIndex}% · 战役 {dream.milestonePct}%
            </p>
            {dashboard?.momentum && (
              <ZhiDreamMomentumCurves momentum={dashboard.momentum} compact />
            )}
          </div>
        )}

        <ZhiSidebarSubjectTracks />

        <ZhiSidebarTextbooks />

        <motion.div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] uppercase tracking-wider text-gray-500">
              // 学习目录 · 目标值
            </span>
            <span className="text-[8px] text-[#00FF7F]">🔒 PINNED</span>
          </div>
          <div className="space-y-0.5">
            {pinned.map((dir) => (
              <DirectoryRow
                key={dir.id}
                dir={dir}
                active={activeId === dir.id}
                target={directoryTarget(dir.id)}
                onSelect={() => setActiveId(dir.id)}
              />
            ))}
          </div>
        </motion.div>

        <motion.div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] uppercase tracking-wider text-gray-500">
              // 动态战术扩展
            </span>
            <button
              type="button"
              onClick={() => setShowAddInput(!showAddInput)}
              className="rounded border border-[#00FF7F]/30 bg-[#00FF7F]/5 px-1.5 py-0.5 text-[9px] text-[#00FF7F] transition-all hover:border-[#00FF7F]"
            >
              {t('sidebar.btn_add')}
            </button>
          </div>

          <AnimatePresence>
            {showAddInput && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-2 rounded-xl border border-gray-950 bg-black p-2"
              >
                <input
                  type="text"
                  placeholder={t('sidebar.placeholder')}
                  value={newDirTitle}
                  onChange={(e) => setNewDirTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDirectory()}
                  className="w-full rounded border border-gray-900 bg-[#0B0C10] px-2 py-1 font-sans text-xs text-white outline-none placeholder:text-gray-700 focus:border-[#00FF7F]/50"
                />
                <div className="flex justify-end space-x-1 text-[9px]">
                  <button
                    type="button"
                    onClick={() => setShowAddInput(false)}
                    className="px-1.5 py-0.5 text-gray-500"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleAddDirectory}
                    className="rounded bg-[#00FF7F] px-2 py-0.5 font-bold text-black"
                  >
                    确认
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-0.5">
            {custom.map((dir) => (
              <DirectoryRow
                key={dir.id}
                dir={dir}
                active={activeId === dir.id}
                target={directoryTarget(dir.id)}
                onSelect={() => setActiveId(dir.id)}
                onDelete={() => void removeCustomDirectory(dir.id)}
              />
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div className="space-y-1 border-t border-gray-950 pt-3 text-[10px] text-gray-500">
        <button
          type="button"
          onClick={() => goCockpitHome(activeId ?? undefined)}
          className="mb-2 w-full rounded-lg bg-[#00FF7F] py-2 text-[10px] font-black text-black hover:bg-[#00E06F]"
        >
          🏠 进入主驾驶舱
        </button>
        <button
          type="button"
          onClick={() => goAnchorPage({ edit: true })}
          className="mb-2 w-full rounded-lg border border-[#00FF7F]/30 py-1.5 text-[9px] text-[#00FF7F] hover:bg-[#00FF7F]/10"
        >
          {hasConfiguredAnchor(anchorProfile) ? '✏️ 更改梦校航标' : '🎯 设定梦校航标'}
        </button>
        {anchorProfile && (
          <div className="mb-2 space-y-1 rounded-lg border border-gray-950 bg-black/50 px-2 py-1.5 text-[9px]">
            {anchorProfile.currentSchool ? (
              <motion.div className="flex justify-between gap-2">
                <span className="text-gray-500">现就读</span>
                <span className="truncate text-right text-white">
                  {anchorProfile.currentSchool}
                  {anchorProfile.currentRegion ? ` · ${anchorProfile.currentRegion}` : ''}
                </span>
              </motion.div>
            ) : null}
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">梦校航标</span>
              <span className="truncate text-right text-white">
                {anchorProfile.school} · {anchorProfile.major}
                {anchorProfile.targetSchoolRegion ? ` · ${anchorProfile.targetSchoolRegion}` : ''}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">在读年级</span>
              <span className="text-[#00FF7F]">{anchorProfile.currentGrade}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">目标入学</span>
              <span className="text-white">{anchorProfile.targetApplyAt}</span>
            </div>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span className="shrink-0">当前聚焦域:</span>
          <span className="truncate text-right font-bold text-white">{focusLabel}</span>
        </div>
        <p className="text-[8px] italic text-gray-600">
          * 目录目标值随试卷/标化更新自动变化；右侧栏同步能力增长与知识成果。
        </p>
      </motion.div>
    </aside>
  );
}
