import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useZhiChat } from '../../context/ZhiChatContext';
import { ZhiAnchorCountdown, type AnchorBriefDto } from './ZhiAnchorCountdown';
import { ZhiCommProtocolCard } from './ZhiCommProtocolCard';
import { ZhiDailyReviewCard } from '../progress/ZhiDailyReviewCard';
import type { ProactiveBriefDto } from '../../lib/zhi-proactive-api';
import type { DailyReviewDto } from '../../lib/zhi-daily-review-api';
import { ZhiTextbookFocusCard } from '../progress/ZhiTextbookFocusCard';
import { ZhiDirectoryWorkspaceCard } from '../progress/ZhiDirectoryWorkspaceCard';
import type { TextbookTrackDto } from '../../lib/learning-progress-api';
import { onWuxianEventUntyped, WUXIAN_EVENTS } from '../../lib/wuxian-events';

export function ZhiChatThread() {
  const { messages, busy, quickActions, runQuickAction, runDialogQuickAction, userId } =
    useZhiChat();
  const endRef = useRef<HTMLDivElement>(null);
  const [anchorBrief, setAnchorBrief] = useState<AnchorBriefDto | null>(null);
  const [proactiveBrief, setProactiveBrief] = useState<ProactiveBriefDto | null>(null);
  const [dailyReview, setDailyReview] = useState<DailyReviewDto | null>(null);
  const [textbookFocus, setTextbookFocus] = useState<TextbookTrackDto | null>(null);

  const lastZhiId = [...messages].reverse().find((m) => m.role === 'zhi')?.id;

  useEffect(() => {
    const u1 = onWuxianEventUntyped(WUXIAN_EVENTS.anchorBrief, (detail) => {
      const d = detail as AnchorBriefDto | undefined;
      if (d?.dynamicMilestones?.length) setAnchorBrief(d);
    });
    const u2 = onWuxianEventUntyped(WUXIAN_EVENTS.proactiveBrief, (detail) => {
      const d = detail as ProactiveBriefDto | undefined;
      if (d?.protocolDirectory?.length) setProactiveBrief(d);
      if (d?.dailyReview) setDailyReview(d.dailyReview);
    });
    const u3 = onWuxianEventUntyped(WUXIAN_EVENTS.dailyReview, (detail) => {
      const d = detail as DailyReviewDto | undefined;
      if (d?.reviewDate) setDailyReview(d);
    });
    const u4 = onWuxianEventUntyped(WUXIAN_EVENTS.textbookFocus, (detail) => {
      const d = detail as TextbookTrackDto | undefined;
      if (d?.catalogId) setTextbookFocus(d);
    });
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  return (
    <motion.div className="flex flex-1 flex-col gap-3 overflow-y-auto px-1 py-2">
      {messages.length <= 1 && !busy && (
        <p className="px-2 text-center text-[10px] leading-relaxed text-gray-600">
          ZHI 会按学习进度与梦校目标主动开口；你也可以用{' '}
          <span className="text-gray-400">+</span> 传试卷/教材建档。
        </p>
      )}
      {messages.map((m) => (
        <motion.div
          key={m.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
        >
          <motion.div
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-[#00FF7F]/15 text-white border border-[#00FF7F]/25'
                : 'bg-[#0A0B0E] text-gray-200 border border-gray-900'
            }`}
          >
            {m.role === 'zhi' && (
              <span className="mb-1 block text-[9px] font-bold tracking-widest text-[#00FF7F]">
                ZHI
                {m.toolHint ? ` · ${m.toolHint}` : ''}
              </span>
            )}
            <p className="whitespace-pre-wrap">{m.text}</p>
          </motion.div>

          {m.role === 'zhi' && m.id === lastZhiId && !busy && (m.dialogQuickActions?.length ?? 0) > 0 && (
            <motion.div
              className="mt-2 flex max-w-[90%] flex-wrap gap-1.5"
              role="toolbar"
              aria-label="对话快捷操作"
            >
              {m.dialogQuickActions!.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => runDialogQuickAction(a)}
                  className="rounded-full border border-[#00FF7F]/30 bg-[#11131A] px-3 py-1 text-[10px] text-[#00FF7F]/90 transition-colors hover:border-[#00FF7F]/60 hover:text-[#00FF7F]"
                >
                  {a.label}
                </button>
              ))}
            </motion.div>
          )}
          {m.role === 'zhi' &&
            m.id === lastZhiId &&
            !busy &&
            !(m.dialogQuickActions?.length) &&
            quickActions.length > 0 && (
            <motion.div className="mt-2 flex max-w-[90%] flex-wrap gap-1.5" role="toolbar" aria-label="快捷操作">
              {quickActions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => runQuickAction(a)}
                  className="rounded-full border border-gray-800 bg-[#11131A] px-3 py-1 text-[10px] text-gray-300 transition-colors hover:border-[#00FF7F]/40 hover:text-[#00FF7F]"
                >
                  {a.label}
                </button>
              ))}
            </motion.div>
          )}
        </motion.div>
      ))}
      <ZhiDirectoryWorkspaceCard />
      {textbookFocus && <ZhiTextbookFocusCard book={textbookFocus} />}
      {dailyReview && <ZhiDailyReviewCard review={dailyReview} />}
      {proactiveBrief && <ZhiCommProtocolCard brief={proactiveBrief} />}
      {anchorBrief && <ZhiAnchorCountdown brief={anchorBrief} userId={userId} />}
      {busy && (
        <motion.div className="text-[10px] text-gray-500 pl-1">ZHI 思考中…</motion.div>
      )}
      <motion.div ref={endRef} aria-hidden />
    </motion.div>
  );
}
