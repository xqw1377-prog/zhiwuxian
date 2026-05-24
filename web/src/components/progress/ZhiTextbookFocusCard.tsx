import { useState } from 'react';
import { motion } from 'framer-motion';
import type { TextbookTrackDto } from '../../lib/learning-progress-api';
import { useZhiChat } from '../../context/ZhiChatContext';
import { pushTextbookCoursewareMatch } from '../../lib/push-textbook-courseware';

export function ZhiTextbookFocusCard({ book }: { book: TextbookTrackDto }) {
  const { userId } = useZhiChat();
  const [pushing, setPushing] = useState(false);

  const onPush = async () => {
    if (!userId || pushing) return;
    setPushing(true);
    try {
      await pushTextbookCoursewareMatch(userId, book);
    } finally {
      setPushing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[92%] rounded-xl border border-[#7CFFCB]/25 bg-[#7CFFCB]/5 p-3 text-left text-[10px] text-gray-300"
      role="region"
      aria-label="教材进度"
    >
      <p className="mb-1 text-[11px] font-bold text-[#7CFFCB]">教材 · {book.title}</p>
      <p className="mb-2 text-[9px] text-gray-500">
        {book.publisher} · {book.subject} · 进度 {book.progressChapter}/{book.totalChapters}（
        {book.progressPct}%）
      </p>
      <p className="mb-1 text-[10px] text-white">当前章：{book.currentChapterTitle}</p>
      {book.knowledgePoints.length > 0 && (
        <p className="mb-2 text-gray-400">知识点：{book.knowledgePoints.join('、')}</p>
      )}
      {book.gapNote && <p className="text-[9px] text-gray-500">{book.gapNote}</p>}
      <button
        type="button"
        onClick={() => void onPush()}
        disabled={pushing}
        className="mt-2 w-full rounded-lg border border-violet-500/40 py-2 text-[10px] font-bold text-violet-200 hover:bg-violet-500/10 disabled:opacity-50"
      >
        {pushing ? '匹配中…' : '推课件'}
      </button>
      <p className="mt-2 text-[8px] text-gray-600">
        无需逐页拍照；可在「摄影拦截 → 教材指认」更新学到第几章。
      </p>
    </motion.div>
  );
}
