import { AnimatePresence, motion } from 'framer-motion';
import { ZhiVisionInterceptTool } from '../tools/ZhiVisionInterceptTool';
import { ZhiCausalReportTool } from '../tools/ZhiCausalReportTool';
import { ZhiCloudConsole } from '../ZhiCloudConsole';
import { ZhiLanguageCoachTool } from '../tools/ZhiLanguageCoachTool';
import { ZhiLifeMatrix } from '../ZhiLifeMatrix';
import { ZhiVideoLearnTool } from '../tools/ZhiVideoLearnTool';
import { ZhiCoursewareAdminTool } from '../tools/ZhiCoursewareAdminTool';
import { ZhiLearningAssessmentTool } from '../tools/ZhiLearningAssessmentTool';
import { ZhiLearningPathTool } from '../tools/ZhiLearningPathTool';
import { ZhiToolShell } from '../tools/ZhiToolShell';
import { useZhiChat } from '../../context/ZhiChatContext';
import { useZhiDirectory } from '../../context/ZhiDirectoryContext';
import type { AnchorBriefDto } from './ZhiAnchorCountdown';
import { fetchProactiveBrief } from '../../lib/zhi-proactive-api';
import { ensureAuthSession } from '../../lib/api-auth';
import { getTool } from '../../tools/zhi-tools';
import { emitAnchorBrief, emitDailyReview, emitProactiveBrief } from '../../lib/wuxian-events';

export function ZhiToolCanvas({ userId }: { userId: string }) {
  const { activeToolId, appendZhi, closeTool, openTool, toolLaunch, consumeToolLaunch } = useZhiChat();
  const { refreshDirectories } = useZhiDirectory();

  const tool = activeToolId ? getTool(activeToolId) : null;

  const renderToolBody = () => {
    if (!activeToolId) return null;
    switch (activeToolId) {
      case 'vision-intercept':
        return <ZhiVisionInterceptTool userId={userId} />;
      case 'language-coach':
        return <ZhiLanguageCoachTool userId={userId} />;
      case 'anchor':
        return (
          <div data-cockpit-anchor>
            <ZhiCloudConsole
              userId={userId}
              compact
              openInEditMode={Boolean(toolLaunch?.anchorEdit)}
              onConsumeEditIntent={consumeToolLaunch}
              onAfterWake={async (anchorDirectoryId, anchorBrief) => {
                await refreshDirectories(anchorDirectoryId);
                closeTool();
                await ensureAuthSession(userId);
                const proactive = await fetchProactiveBrief(userId, 'anchor_wake');
                if (proactive) {
                  const text = [proactive.chatText, proactive.zhiTip].filter(Boolean).join('\n\n');
                  appendZhi(text, `主动 · ${proactive.activeModeLabel}`);
                  emitProactiveBrief(proactive);
                  if (proactive.dailyReview) {
                    emitDailyReview(proactive.dailyReview);
                  }
                } else if (anchorBrief?.chatText) {
                  appendZhi(anchorBrief.chatText, '梦校航标');
                } else {
                  appendZhi('梦校航标已更新，左侧 PINNED 清单已同步。', '梦校航标');
                }
                if (anchorBrief) {
                  emitAnchorBrief(anchorBrief as AnchorBriefDto);
                }
                openTool('learning-path', { silent: true });
              }}
            />
          </div>
        );
      case 'evolution-ledger':
        return <ZhiLifeMatrix userId={userId} compact />;
      case 'video-learn':
        return <ZhiVideoLearnTool userId={userId} />;
      case 'courseware-admin':
        return <ZhiCoursewareAdminTool />;
      case 'learning-assessment':
        return <ZhiLearningAssessmentTool userId={userId} />;
      case 'learning-path':
        return <ZhiLearningPathTool userId={userId} />;
      case 'causal-report':
        return <ZhiCausalReportTool userId={userId} />;
      default:
        return null;
    }
  };

  return (
    <AnimatePresence mode="wait">
      {activeToolId && tool && (
        <motion.div
          key={activeToolId}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden rounded-xl border border-gray-900 bg-[#050608]/90"
        >
          <motion.div
            className={`overflow-y-auto p-3 ${
              activeToolId === 'anchor' ? 'max-h-[min(72vh,680px)]' : 'max-h-[min(52vh,520px)]'
            }`}
          >
            <ZhiToolShell title={tool.label} icon={tool.icon} description={tool.description}>
              {renderToolBody()}
            </ZhiToolShell>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
