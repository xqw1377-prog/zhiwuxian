import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  defaultFuelExpandedForLayout,
  isFuelColumnExpanded,
  setFuelColumnExpanded,
} from '../lib/cockpit-ui-prefs';
import { ZhiFuelMatrix } from './ZhiFuelMatrix';
import { ZhiGrowthPanel } from './progress/ZhiGrowthPanel';
import { ZhiTokenDashboard } from './ZhiTokenDashboard';

export function ZhiCockpitFuelColumn({
  userId,
  refreshKey,
  layout = 'desktop',
  onExpandedChange,
}: {
  userId: string;
  refreshKey: number;
  layout?: 'desktop' | 'sheet';
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(() => (layout === 'sheet' ? true : defaultFuelExpandedForLayout()));

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    setFuelColumnExpanded(next);
    onExpandedChange?.(next);
  };

  if (!expanded && layout === 'desktop') {
    return (
      <aside className="flex h-screen w-10 shrink-0 flex-col items-center border-l border-gray-950 bg-[#030406] py-4">
        <button
          type="button"
          onClick={toggle}
          title={t('fuelColumn.expand')}
          className="text-[9px] font-bold tracking-widest text-[#FF4500] hover:text-[#00FF7F]"
          style={{ writingMode: 'vertical-rl' }}
        >
          {t('fuelColumn.growth')}
        </button>
      </aside>
    );
  }

  const expandedShell =
    layout === 'sheet'
      ? 'flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto bg-[#030406] p-4'
      : 'flex h-screen w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto border-l border-gray-950 bg-[#030406] p-4';

  return (
    <aside className={expandedShell}>
      <ZhiGrowthPanel />
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-950 pb-2 bg-[#030406]">
        <div>
          <span className="text-[10px] font-black tracking-widest text-[#FF4500]">{t('fuelColumn.warpTitle')}</span>
          <p className="text-[8px] text-gray-600">{t('fuelColumn.dualCore')}</p>
        </div>
        {layout === 'desktop' && (
          <button
            type="button"
            onClick={toggle}
            className="text-[10px] text-gray-500 hover:text-white"
            title={t('fuelColumn.collapse')}
          >
            ×
          </button>
        )}
      </div>
      <ZhiTokenDashboard userId={userId} refreshKey={refreshKey} />
      <ZhiFuelMatrix userId={userId} refreshKey={refreshKey} />
    </aside>
  );
}
