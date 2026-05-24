import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { hasConfiguredAnchor, isAnchorSessionDone, markAnchorSessionDone } from '../lib/anchor-session';
import { useZhiDirectory } from '../context/ZhiDirectoryContext';
import { useZhiChat } from '../context/ZhiChatContext';
import { ZhiChatThread } from './chat/ZhiChatThread';
import { ZhiComposer } from './chat/ZhiComposer';
import { ZhiToolCanvas } from './chat/ZhiToolCanvas';
import { ZhiDreamProgressStrip } from './progress/ZhiDreamProgressStrip';

export function ZhiChatShell({ userId }: { userId: string }) {
  const { anchorProfile, directoriesLoaded } = useZhiDirectory();
  const { activeToolId, closeTool, openTool } = useZhiChat();
  const autoOpenedAnchorRef = useRef(false);

  useEffect(() => {
    if (!directoriesLoaded) return;

    if (hasConfiguredAnchor(anchorProfile)) {
      if (!isAnchorSessionDone()) markAnchorSessionDone();
      if (autoOpenedAnchorRef.current && activeToolId === 'anchor') {
        autoOpenedAnchorRef.current = false;
        closeTool();
      }
      return;
    }

    if (!isAnchorSessionDone() && !autoOpenedAnchorRef.current) {
      autoOpenedAnchorRef.current = true;
      openTool('anchor', { silent: true });
    }
  }, [anchorProfile, directoriesLoaded, activeToolId, openTool, closeTool]);

  return (
    <motion.div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-4xl flex-col px-2 py-4">
      <ZhiDreamProgressStrip />
      <ZhiChatThread />
      <ZhiToolCanvas userId={userId} />
      <ZhiComposer />
    </motion.div>
  );
}
