import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ZhiLanguageSyncer } from '../services/ZhiLanguageSyncer';
import { onWuxianEvent, WUXIAN_EVENTS } from '../lib/wuxian-events';

const LANG_OPTIONS = [
  { code: 'zh', label: 'ZH // 中文' },
  { code: 'en', label: 'EN // CORE' },
  { code: 'ja', label: 'JA // 日本語' },
  { code: 'ko', label: 'KO // 한국어' },
  { code: 'th', label: 'TH // ไทย' },
] as const;

export function ZhiLangSwitcher({ userId }: { userId: string }) {
  const { i18n } = useTranslation();
  const [currentLang, setCurrentLang] = useState(i18n.language || 'zh');

  useEffect(() => {
    return onWuxianEvent(WUXIAN_EVENTS.langChanged, ({ lang }) => {
      const l = String(lang ?? i18n.language).toLowerCase().slice(0, 2);
      setCurrentLang(l);
    });
  }, [i18n.language]);

  const handleLangToggle = (lang: string) => {
    setCurrentLang(lang);
    ZhiLanguageSyncer.switchLanguage(lang, userId);
  };

  return (
    <div className="inline-flex bg-black border border-gray-950 p-1 rounded-xl font-mono select-none">
      <div className="flex space-x-1 relative">
        {LANG_OPTIONS.map((opt, i) => (
          <button
            key={opt.code}
            type="button"
            onClick={() => handleLangToggle(opt.code)}
            className={`px-3 py-1 text-[10px] font-black tracking-widest rounded-lg transition-all ${
              currentLang === opt.code
                ? i === 0
                  ? 'bg-[#0B0C10] text-[#00FF7F] border border-gray-900 shadow-[0_0_10px_rgba(0,255,127,0.1)]'
                  : i === 1
                    ? 'bg-[#0B0C10] text-[#FF4500] border border-gray-900 shadow-[0_0_10px_rgba(255,69,0,0.15)]'
                    : 'bg-[#0B0C10] text-[#60A5FA] border border-gray-900 shadow-[0_0_10px_rgba(96,165,250,0.1)]'
                : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
