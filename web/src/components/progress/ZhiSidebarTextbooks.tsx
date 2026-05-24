import { useState } from 'react';

import { motion } from 'framer-motion';

import { useLearningProgress } from '../../context/LearningProgressContext';

import { useZhiDirectory } from '../../context/ZhiDirectoryContext';

import { useZhiChat } from '../../context/ZhiChatContext';

import { ZhiProgressBar } from './ZhiProgressBar';

import type { TextbookTrackDto } from '../../lib/learning-progress-api';

import { pushTextbookCoursewareMatch } from '../../lib/push-textbook-courseware';
import { emitWuxianEventUntyped, openToolViaEvent, WUXIAN_EVENTS } from '../../lib/wuxian-events';



export function ZhiSidebarTextbooks() {

  const { dashboard } = useLearningProgress();

  const { activeId, setActiveId } = useZhiDirectory();

  const { userId } = useZhiChat();

  const [pushingId, setPushingId] = useState<string | null>(null);

  const books = dashboard?.textbooks ?? [];

  if (books.length === 0) return null;



  const onSelect = (tb: TextbookTrackDto) => {

    setActiveId(tb.directoryId);

    emitWuxianEventUntyped(WUXIAN_EVENTS.textbookFocus, tb);
    openToolViaEvent('vision-intercept');
  };



  const onPushMatch = async (e: React.MouseEvent, tb: TextbookTrackDto) => {

    e.stopPropagation();

    if (!userId || pushingId) return;

    setPushingId(tb.catalogId);

    try {

      await pushTextbookCoursewareMatch(userId, tb);

    } finally {

      setPushingId(null);

    }

  };



  return (

    <motion.div className="space-y-1.5">

      <motion.div className="flex items-center justify-between px-1">

        <span className="text-[9px] uppercase tracking-wider text-gray-500">// 教材指认 · 目录</span>

        <span className="text-[8px] text-[#7CFFCB]">{books.length} 册</span>

      </motion.div>

      <div className="space-y-1">

        {books.map((tb) => (

          <button

            key={tb.catalogId}

            type="button"

            onClick={() => onSelect(tb)}

            className={`w-full rounded-lg border px-2.5 py-2 text-left transition-all ${

              activeId === tb.directoryId

                ? 'border-[#7CFFCB]/40 bg-[#7CFFCB]/10'

                : 'border-gray-950 bg-black/30 hover:border-gray-800'

            }`}

          >

            <p className="truncate text-[11px] font-medium text-gray-200">

              📚 {tb.subject} · {tb.title}

            </p>

            <p className="mt-0.5 truncate text-[9px] text-gray-600">{tb.publisher}</p>

            <ZhiProgressBar

              label={`第${tb.progressChapter}/${tb.totalChapters}章`}

              currentPct={tb.progressPct}

              targetPct={100}

              displayCurrent={String(tb.progressPct)}

              displayTarget="100"

              unit="%"

              compact

              accent="#7CFFCB"

            />

            <button

              type="button"

              onClick={(e) => void onPushMatch(e, tb)}

              disabled={pushingId === tb.catalogId}

              className="mt-1.5 w-full rounded border border-violet-500/30 py-1 text-[8px] font-bold text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"

            >

              {pushingId === tb.catalogId ? '匹配中…' : '推课件'}

            </button>

          </button>

        ))}

      </div>

    </motion.div>

  );

}

