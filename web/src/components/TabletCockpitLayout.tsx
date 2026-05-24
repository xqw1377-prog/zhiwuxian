import { useEffect, useState } from 'react';
import { onWuxianEventUntyped, WUXIAN_EVENTS } from '../lib/wuxian-events';
import { ZhiSidebarMatrix } from './ZhiSidebarMatrix';
import { ZhiCockpitCenter } from './ZhiCockpitCenter';
import { ZhiCockpitFuelColumn } from './ZhiCockpitFuelColumn';

type MobileTab = 'dirs' | 'chat' | 'fuel';

/**
 * 桌面：三栏并排（≥1024px）
 * 平板/手机：底栏切换「目录 | ZHI | 成长」，主屏只显示一栏
 */
export function TabletCockpitLayout({
  userId,
  refreshKey,
  onFuelExpandedChange,
}: {
  userId: string;
  refreshKey: number;
  onFuelExpandedChange?: (expanded: boolean) => void;
}) {
  const [tab, setTab] = useState<MobileTab>('chat');

  useEffect(() => {
    return onWuxianEventUntyped(WUXIAN_EVENTS.enterCockpit, () => setTab('chat'));
  }, []);

  return (
    <>
      <div className="hidden min-h-[100dvh] w-full lg:flex">
        <ZhiSidebarMatrix layout="desktop" />
        <ZhiCockpitCenter userId={userId} />
        <ZhiCockpitFuelColumn
          userId={userId}
          refreshKey={refreshKey}
          layout="desktop"
          onExpandedChange={onFuelExpandedChange}
        />
      </div>

      <div className="flex min-h-[100dvh] flex-col lg:hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tab === 'dirs' && <ZhiSidebarMatrix layout="sheet" />}
          {tab === 'chat' && <ZhiCockpitCenter userId={userId} />}
          {tab === 'fuel' && (
            <ZhiCockpitFuelColumn
              userId={userId}
              refreshKey={refreshKey}
              layout="sheet"
              onExpandedChange={onFuelExpandedChange}
            />
          )}
        </div>

        <nav
          className="safe-area-pb z-30 flex shrink-0 border-t border-gray-950 bg-[#030406]/95 backdrop-blur-md"
          aria-label="驾驶舱导航"
        >
          {(
            [
              { id: 'dirs' as const, label: '目录', sub: '科目与航标' },
              { id: 'chat' as const, label: 'ZHI', sub: '对话主屏' },
              { id: 'fuel' as const, label: '成长', sub: '算力与进度' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-center transition-colors ${
                tab === item.id
                  ? 'bg-[#00FF7F]/10 text-[#00FF7F]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className="text-xs font-black tracking-wider">{item.label}</span>
              <span className="text-[9px] opacity-70">{item.sub}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
